"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { toast } from "sonner";
import { db } from "@/lib/firebase/client";
import { normalizar } from "@/lib/reglas/normalizar";
import { cambiarEstadoItemCatalogo } from "@/lib/acciones/catalogo";
import type { ItemCatalogo } from "@/lib/tipos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ItemFormDialog } from "@/components/catalogo/item-form-dialog";
import { ConfiguracionDialog } from "@/components/catalogo/configuracion-dialog";

interface ItemConId extends ItemCatalogo {
  id: string;
}

const SELECT_CLASS =
  "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function ListadoCatalogo() {
  const [items, setItems] = useState<ItemConId[] | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [filtroRubro, setFiltroRubro] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [soloVerificacion, setSoloVerificacion] = useState(false);
  const [dialogNuevo, setDialogNuevo] = useState(false);
  const [dialogConfig, setDialogConfig] = useState(false);
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

  async function toggleEstado(item: ItemConId) {
    const nuevo = item.estado === "Habilitado" ? "Deshabilitado" : "Habilitado";
    const res = await cambiarEstadoItemCatalogo(item.id, nuevo);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`Ítem ${nuevo.toLowerCase()}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Catálogo</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setDialogConfig(true)}>
            Configuración
          </Button>
          <Button onClick={() => setDialogNuevo(true)}>Nuevo ítem</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Buscar por nombre o código..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="max-w-sm"
        />
        <select
          className={SELECT_CLASS}
          value={filtroRubro}
          onChange={(e) => setFiltroRubro(e.target.value)}
        >
          <option value="">Todos los rubros</option>
          {rubros.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select
          className={SELECT_CLASS}
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value)}
        >
          <option value="">Todos los estados</option>
          <option value="Habilitado">Habilitado</option>
          <option value="Deshabilitado">Deshabilitado</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={soloVerificacion}
            onChange={(e) => setSoloVerificacion(e.target.checked)}
          />
          Solo requiere verificación
        </label>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Rubro</TableHead>
              <TableHead>Proveedor</TableHead>
              <TableHead>Grupo contable</TableHead>
              <TableHead className="text-right">Precio final</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items === null && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  Cargando...
                </TableCell>
              </TableRow>
            )}
            {items !== null && filtrados.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  Sin resultados.
                </TableCell>
              </TableRow>
            )}
            {filtrados.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-mono text-xs">{item.codigo}</TableCell>
                <TableCell>
                  <button className="text-left hover:underline" onClick={() => setEditando(item)}>
                    {item.nombre}
                  </button>
                  {item.requiereVerificacion && (
                    <Badge variant="destructive" className="ml-2">
                      Verificar
                    </Badge>
                  )}
                </TableCell>
                <TableCell>{item.rubro}</TableCell>
                <TableCell>{item.proveedor || "—"}</TableCell>
                <TableCell className="capitalize">{item.grupoContable.replace("_", " ")}</TableCell>
                <TableCell className="text-right">
                  {item.moneda === "Dolar" ? "US$ " : "$ "}
                  {item.precioFinalIva.toLocaleString("es-AR")}
                </TableCell>
                <TableCell>
                  <Badge variant={item.estado === "Habilitado" ? "default" : "secondary"}>
                    {item.estado}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" onClick={() => toggleEstado(item)}>
                    {item.estado === "Habilitado" ? "Deshabilitar" : "Habilitar"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

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
    </div>
  );
}
