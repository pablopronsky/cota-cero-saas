"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { Package, Percent, Plus, Search, Settings } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/firebase/client";
import { normalizar } from "@/lib/reglas/normalizar";
import { cambiarEstadoItemCatalogo } from "@/lib/acciones/catalogo";
import type { ItemCatalogo } from "@/lib/tipos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EstadoCatalogoBadge, VerificarBadge } from "@/components/estado-badge";
import { PageHeader } from "@/components/page-header";
import { ItemFormDialog } from "@/components/catalogo/item-form-dialog";
import { ConfiguracionDialog } from "@/components/catalogo/configuracion-dialog";
import { ActualizarPreciosDialog } from "@/components/catalogo/actualizar-precios-dialog";

interface ItemConId extends ItemCatalogo {
  id: string;
}

export function ListadoCatalogo() {
  const [items, setItems] = useState<ItemConId[] | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [filtroRubro, setFiltroRubro] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [soloVerificacion, setSoloVerificacion] = useState(false);
  const [dialogNuevo, setDialogNuevo] = useState(false);
  const [dialogConfig, setDialogConfig] = useState(false);
  const [dialogPrecios, setDialogPrecios] = useState(false);
  const [editando, setEditando] = useState<ItemConId | null>(null);

  useEffect(() => {
    const q = query(collection(db, "catalogo"), orderBy("nombre"));
    return onSnapshot(
      q,
      (snap) => {
        setItems(snap.docs.map((d) => ({ id: d.id, ...(d.data() as ItemCatalogo) })));
      },
      (error) => {
        if (error.code !== "permission-denied") console.error(error);
      },
    );
  }, []);

  const rubros = useMemo(() => {
    if (!items) return [];
    return Array.from(new Set(items.map((i) => i.rubro))).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const filtrados = useMemo(() => {
    if (!items) return [];
    const termino = normalizar(busqueda.trim());
    return items.filter((i) => {
      if (filtroRubro && i.rubro !== filtroRubro) return false;
      if (filtroEstado && i.estado !== filtroEstado) return false;
      if (soloVerificacion && !i.requiereVerificacion) return false;
      if (!termino) return true;
      return normalizar(i.nombre).includes(termino) || normalizar(i.codigo).includes(termino);
    });
  }, [items, busqueda, filtroRubro, filtroEstado, soloVerificacion]);

  const pendientesVerificacion = useMemo(
    () => (items ?? []).filter((i) => i.requiereVerificacion).length,
    [items],
  );

  async function toggleEstado(item: ItemConId) {
    const nuevo = item.estado === "Habilitado" ? "Deshabilitado" : "Habilitado";
    const res = await cambiarEstadoItemCatalogo(item.id, nuevo);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`Ítem ${nuevo.toLowerCase()}`);
  }

  const hayFiltros = busqueda.trim() !== "" || filtroRubro !== "" || filtroEstado !== "" || soloVerificacion;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Catálogo"
        description={
          items === null
            ? "Cargando catálogo..."
            : `${items.length} ítem${items.length === 1 ? "" : "s"}${
                pendientesVerificacion > 0 ? ` · ${pendientesVerificacion} por verificar` : ""
              }`
        }
        actions={
          <>
            <Button variant="outline" onClick={() => setDialogPrecios(true)} disabled={!items?.length}>
              <Percent data-icon="inline-start" />
              Actualizar precios en masa
            </Button>
            <Button variant="outline" onClick={() => setDialogConfig(true)}>
              <Settings data-icon="inline-start" />
              Configuración
            </Button>
            <Button onClick={() => setDialogNuevo(true)}>
              <Plus data-icon="inline-start" />
              Nuevo ítem
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o código..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="bg-card pl-8"
          />
        </div>
        <NativeSelect value={filtroRubro} onChange={(e) => setFiltroRubro(e.target.value)}>
          <option value="">Todos los rubros</option>
          {rubros.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
          <option value="">Todos los estados</option>
          <option value="Habilitado">Habilitado</option>
          <option value="Deshabilitado">Deshabilitado</option>
        </NativeSelect>
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-input bg-card px-2.5 py-1.5 text-sm text-muted-foreground transition-colors select-none hover:text-foreground has-checked:border-cobre/50 has-checked:text-cobre-oscuro">
          <input
            type="checkbox"
            className="accent-cobre"
            checked={soloVerificacion}
            onChange={(e) => setSoloVerificacion(e.target.checked)}
          />
          Solo requiere verificación
        </label>
      </div>

      {items === null ? (
        <Skeleton className="h-96 w-full rounded-xl" />
      ) : filtrados.length === 0 ? (
        <Card>
          <EmptyState
            icon={Package}
            title={hayFiltros ? "Sin resultados" : "El catálogo está vacío"}
            description={
              hayFiltros
                ? "Probá con otro término o limpiá los filtros."
                : "Cargá ítems para poder armar presupuestos desde el catálogo."
            }
          />
        </Card>
      ) : (
        <>
          {/* Tabla — desktop/tablet */}
          <div className="hidden overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4">Código</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Rubro</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>Grupo contable</TableHead>
                  <TableHead className="text-right">Precio final</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="pr-4" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrados.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="pl-4 font-mono text-xs text-muted-foreground">
                      {item.codigo}
                    </TableCell>
                    <TableCell className="max-w-xs">
                      <div className="flex items-center gap-2">
                        <button
                          className="cursor-pointer truncate text-left font-medium hover:text-cobre-oscuro"
                          onClick={() => setEditando(item)}
                          title={item.nombre}
                        >
                          {item.nombre}
                        </button>
                        {item.requiereVerificacion && <VerificarBadge />}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{item.rubro}</TableCell>
                    <TableCell className="text-muted-foreground">{item.proveedor || "—"}</TableCell>
                    <TableCell className="text-muted-foreground capitalize">
                      {item.grupoContable.replace("_", " ")}
                    </TableCell>
                    <TableCell className="tnum text-right font-medium">
                      {item.moneda === "Dolar" ? "US$ " : "$ "}
                      {item.precioFinalIva.toLocaleString("es-AR")}
                    </TableCell>
                    <TableCell>
                      <EstadoCatalogoBadge estado={item.estado} />
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      <Button variant="ghost" size="sm" onClick={() => toggleEstado(item)}>
                        {item.estado === "Habilitado" ? "Deshabilitar" : "Habilitar"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Tarjetas — mobile */}
          <div className="space-y-2 md:hidden">
            {filtrados.map((item) => (
              <div key={item.id} className="rounded-xl bg-card p-3 ring-1 ring-foreground/10">
                <div className="flex items-start justify-between gap-3">
                  <button
                    className="min-w-0 cursor-pointer text-left"
                    onClick={() => setEditando(item)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{item.nombre}</span>
                      {item.requiereVerificacion && <VerificarBadge />}
                    </div>
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">{item.codigo}</p>
                  </button>
                  <EstadoCatalogoBadge estado={item.estado} />
                </div>
                <div className="mt-3 flex items-end justify-between gap-3 border-t border-border pt-2.5">
                  <div className="min-w-0 text-xs text-muted-foreground">
                    <p className="truncate">
                      {item.rubro}
                      {item.proveedor ? ` · ${item.proveedor}` : ""}
                    </p>
                    <p className="tnum mt-1 text-sm font-medium text-foreground">
                      {item.moneda === "Dolar" ? "US$ " : "$ "}
                      {item.precioFinalIva.toLocaleString("es-AR")}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => toggleEstado(item)}
                  >
                    {item.estado === "Habilitado" ? "Deshabilitar" : "Habilitar"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <ItemFormDialog
        key={dialogNuevo ? "abierto" : "cerrado"}
        open={dialogNuevo}
        onOpenChange={setDialogNuevo}
      />
      {editando && (
        <ItemFormDialog
          key={editando.id}
          open
          onOpenChange={(open) => !open && setEditando(null)}
          id={editando.id}
          datosIniciales={editando}
        />
      )}
      <ConfiguracionDialog open={dialogConfig} onOpenChange={setDialogConfig} />
      <ActualizarPreciosDialog
        open={dialogPrecios}
        onOpenChange={setDialogPrecios}
        items={items ?? []}
      />
    </div>
  );
}
