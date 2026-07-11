"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, doc, onSnapshot, orderBy, query as consulta } from "firebase/firestore";
import { toast } from "sonner";
import { db } from "@/lib/firebase/client";
import { calcularTotales, gruposIncluidos } from "@/lib/reglas/totales";
import { precioEfectivo } from "@/lib/reglas/precios";
import {
  crearPresupuesto,
  crearVersionPresupuesto,
  actualizarPresupuesto,
  type DatosItemPresupuesto,
} from "@/lib/acciones/presupuestos";
import type {
  Cliente,
  ConfigGeneral,
  GrupoContable,
  ItemCatalogo,
  ModalidadPresupuesto,
  Presupuesto,
} from "@/lib/tipos";
import type { Timestamp } from "firebase/firestore";
import { ChevronDown, PackagePlus, Plus, RefreshCw, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { VerificarBadge } from "@/components/estado-badge";
import { Autocomplete } from "@/components/presupuestos/autocomplete";
import { ClienteAltaRapidaDialog } from "@/components/clientes/cliente-alta-rapida-dialog";

const MODALIDAD_LABEL: Record<ModalidadPresupuesto, string> = {
  integrada: "Integrada (materiales + mano de obra + accesorios)",
  colocacion: "Colocación (mano de obra + accesorios, materiales los pone el cliente)",
  materiales: "Solo materiales (materiales + accesorios, sin ejecución)",
};

const GRUPO_LABEL: Record<GrupoContable, string> = {
  materiales: "Materiales",
  mano_obra: "Mano de obra",
  accesorios: "Accesorios",
};

interface ClienteConCodigo extends Cliente {
  codigo: string;
}

interface CatalogoConId extends ItemCatalogo {
  id: string;
}

interface ClienteSeleccion {
  codigo: string;
  nombre: string;
  telefono: string;
}

interface ItemRow {
  key: string;
  catalogoId: string | null;
  codigo: string;
  nombre: string;
  rubro: string;
  unidad: string;
  cantidad: number;
  precioUnitario: number;
  grupoContable: GrupoContable;
  m2PorCaja: number | null;
  requiereVerificacion: boolean;
  /** Solo en modo duplicar, tras usar "Actualizar precios desde catálogo". */
  precioAnterior?: number;
}

export interface ItemPrefill {
  catalogoId: string | null;
  codigo: string;
  nombre: string;
  rubro: string;
  unidad: string;
  cantidad: number;
  precioUnitario: number;
  grupoContable: GrupoContable;
  requiereVerificacion: boolean;
}

export interface PresupuestoPrefill {
  clienteId: string;
  clienteNombre: string;
  telefono: string;
  direccionObra: string;
  tipoObra: string;
  vendedor: string;
  fechaVisita: string;
  fechaEmision: string;
  m2Relevados: number;
  subpiso: string;
  nivelSubpiso: string;
  observacionesRiesgos: string;
  modalidad: ModalidadPresupuesto;
  formaPago: string;
  validez: string;
  moneda: string;
  exclusiones: string;
  items: ItemPrefill[];
}

let contadorLocal = 0;
function nuevaKey() {
  contadorLocal += 1;
  return `item-${contadorLocal}`;
}

const fmtMoneda = (n: number) => n.toLocaleString("es-AR", { style: "currency", currency: "ARS" });

interface Props {
  /** crear (default): obra nueva v1. editar: in-place sobre presupuestoId. duplicar: nuevo doc, precargado. */
  modo?: "crear" | "editar" | "duplicar";
  presupuestoId?: string;
  /** Solo modo=duplicar con destino "nueva versión de esta obra". */
  obraCodigoDestino?: string;
  prefill?: PresupuestoPrefill;
}

export function PresupuestoForm({ modo = "crear", presupuestoId, obraCodigoDestino, prefill }: Props) {
  const router = useRouter();
  const clienteBloqueado = modo === "editar" || (modo === "duplicar" && !!obraCodigoDestino);

  const [clientes, setClientes] = useState<ClienteConCodigo[] | null>(null);
  const [catalogo, setCatalogo] = useState<CatalogoConId[] | null>(null);
  const [config, setConfig] = useState<ConfigGeneral | null>(null);

  useEffect(() => {
    return onSnapshot(
      consulta(collection(db, "clientes"), orderBy("nombre")),
      (snap) => setClientes(snap.docs.map((d) => ({ codigo: d.id, ...(d.data() as Cliente) }))),
      (error) => {
        if (error.code !== "permission-denied") console.error(error);
      },
    );
  }, []);

  useEffect(() => {
    return onSnapshot(
      consulta(collection(db, "catalogo"), orderBy("nombre")),
      (snap) =>
        setCatalogo(
          snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as ItemCatalogo) }))
            .filter((i) => i.estado === "Habilitado"),
        ),
      (error) => {
        if (error.code !== "permission-denied") console.error(error);
      },
    );
  }, []);

  const tcUsd = config?.tcUsd ?? 0;

  // Cabecera
  const [clienteSeleccionado, setClienteSeleccionado] = useState<ClienteSeleccion | null>(
    prefill ? { codigo: prefill.clienteId, nombre: prefill.clienteNombre, telefono: prefill.telefono } : null,
  );
  const [telefono, setTelefono] = useState(prefill?.telefono ?? "");
  const [direccionObra, setDireccionObra] = useState(prefill?.direccionObra ?? "");
  const [tipoObra, setTipoObra] = useState(prefill?.tipoObra ?? "");
  const [vendedor, setVendedor] = useState(prefill?.vendedor ?? "");
  const [datosTecnicosAbiertos, setDatosTecnicosAbiertos] = useState(
    Boolean(
      prefill?.tipoObra ||
      prefill?.vendedor ||
      prefill?.m2Relevados ||
      prefill?.subpiso ||
      prefill?.nivelSubpiso ||
      prefill?.observacionesRiesgos,
    ),
  );
  const hoy = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [fechaVisita, setFechaVisita] = useState(prefill?.fechaVisita ?? hoy);
  const [fechaEmision, setFechaEmision] = useState(prefill?.fechaEmision ?? hoy);
  const [m2Relevados, setM2Relevados] = useState<number>(prefill?.m2Relevados ?? 0);
  const [subpiso, setSubpiso] = useState(prefill?.subpiso ?? "");
  const [nivelSubpiso, setNivelSubpiso] = useState(prefill?.nivelSubpiso ?? "");
  const [observacionesRiesgos, setObservacionesRiesgos] = useState(prefill?.observacionesRiesgos ?? "");

  const [modalidad, setModalidad] = useState<ModalidadPresupuesto>(prefill?.modalidad ?? "integrada");
  const [items, setItems] = useState<ItemRow[]>(
    () =>
      prefill?.items.map((i) => ({
        key: nuevaKey(),
        catalogoId: i.catalogoId,
        codigo: i.codigo,
        nombre: i.nombre,
        rubro: i.rubro,
        unidad: i.unidad,
        cantidad: i.cantidad,
        precioUnitario: i.precioUnitario,
        grupoContable: i.grupoContable,
        m2PorCaja: null,
        requiereVerificacion: i.requiereVerificacion,
      })) ?? [],
  );

  // Alta de ítem manual
  const [manualAbierto, setManualAbierto] = useState(false);
  const [manualNombre, setManualNombre] = useState("");
  const [manualRubro, setManualRubro] = useState("");
  const [manualUnidad, setManualUnidad] = useState("");
  const [manualPrecio, setManualPrecio] = useState(0);
  const [manualGrupo, setManualGrupo] = useState<GrupoContable>("materiales");

  const [formaPago, setFormaPago] = useState(prefill?.formaPago ?? "");
  const [validez, setValidez] = useState(prefill?.validez ?? "");
  const [moneda, setMoneda] = useState(prefill?.moneda ?? "Pesos");
  const [exclusiones, setExclusiones] = useState(prefill?.exclusiones ?? "");

  const [dialogClienteRapido, setDialogClienteRapido] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    return onSnapshot(
      doc(db, "config", "general"),
      (snap) => {
        const cfg = snap.exists() ? (snap.data() as ConfigGeneral) : null;
        setConfig(cfg);
        if (cfg?.validezDefault) {
          setValidez((v) => v || cfg.validezDefault);
        }
      },
      (error) => {
        if (error.code !== "permission-denied") console.error(error);
      },
    );
  }, []);

  function seleccionarCliente(c: ClienteConCodigo) {
    setClienteSeleccionado({ codigo: c.codigo, nombre: c.nombre, telefono: c.telefono });
    setTelefono(c.telefono);
  }

  function agregarItemCatalogo(item: CatalogoConId) {
    const { precio, requiereVerificacion } = precioEfectivo(
      { moneda: item.moneda, precioFinalIva: item.precioFinalIva },
      tcUsd,
    );
    setItems((prev) => [
      ...prev,
      {
        key: nuevaKey(),
        catalogoId: item.id,
        codigo: item.codigo,
        nombre: item.nombre,
        rubro: item.rubro,
        unidad: item.unidad,
        cantidad: 1,
        precioUnitario: precio,
        grupoContable: item.grupoContable,
        m2PorCaja: item.m2PorCaja,
        requiereVerificacion,
      },
    ]);
  }

  function agregarItemManual() {
    if (!manualNombre.trim() || !manualRubro.trim() || !manualUnidad.trim()) {
      toast.error("Completá nombre, rubro y unidad del ítem manual");
      return;
    }
    setItems((prev) => [
      ...prev,
      {
        key: nuevaKey(),
        catalogoId: null,
        codigo: "",
        nombre: manualNombre.trim(),
        rubro: manualRubro.trim(),
        unidad: manualUnidad.trim(),
        cantidad: 1,
        precioUnitario: manualPrecio,
        grupoContable: manualGrupo,
        m2PorCaja: null,
        requiereVerificacion: false,
      },
    ]);
    setManualNombre("");
    setManualRubro("");
    setManualUnidad("");
    setManualPrecio(0);
    setManualGrupo("materiales");
    setManualAbierto(false);
  }

  function actualizarItem(
    key: string,
    cambios: Partial<Pick<ItemRow, "cantidad" | "precioUnitario">>,
  ) {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...cambios } : i)));
  }

  function quitarItem(key: string) {
    setItems((prev) => prev.filter((i) => i.key !== key));
  }

  function actualizarPreciosDesdeCatalogo() {
    if (!catalogo) return;
    const catalogoPorId = new Map(catalogo.map((i) => [i.id, i]));
    let cambios = 0;
    setItems((prev) =>
      prev.map((item) => {
        if (!item.catalogoId) return item;
        const catItem = catalogoPorId.get(item.catalogoId);
        if (!catItem) return item;
        const { precio } = precioEfectivo(
          { moneda: catItem.moneda, precioFinalIva: catItem.precioFinalIva },
          tcUsd,
        );
        if (precio === item.precioUnitario) return item;
        cambios += 1;
        return { ...item, precioUnitario: precio, precioAnterior: item.precioUnitario };
      }),
    );
    if (cambios === 0) toast.info("Los precios ya están actualizados");
    else toast.success(`${cambios} ítem(s) con precio actualizado`);
  }

  const itemsConSubtotal = useMemo(
    () => items.map((i) => ({ ...i, subtotal: i.cantidad * i.precioUnitario })),
    [items],
  );

  const totales = useMemo(
    () => calcularTotales(itemsConSubtotal, modalidad),
    [itemsConSubtotal, modalidad],
  );

  const incluidos = useMemo(() => gruposIncluidos(modalidad), [modalidad]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!clienteSeleccionado) {
      setError("Elegí un cliente");
      return;
    }
    if (items.length === 0) {
      setError("Agregá al menos un ítem");
      return;
    }

    const datosItems: DatosItemPresupuesto[] = items.map((i) => ({
      catalogoId: i.catalogoId,
      cantidad: i.cantidad,
      precioUnitario: i.precioUnitario,
      nombreManual: i.catalogoId ? undefined : i.nombre,
      rubroManual: i.catalogoId ? undefined : i.rubro,
      unidadManual: i.catalogoId ? undefined : i.unidad,
      grupoContableManual: i.catalogoId ? undefined : i.grupoContable,
    }));

    const datos = {
      clienteId: clienteSeleccionado.codigo,
      telefono,
      direccionObra,
      tipoObra,
      vendedor,
      fechaVisita,
      fechaEmision,
      m2Relevados,
      subpiso,
      nivelSubpiso,
      observacionesRiesgos,
      modalidad,
      formaPago,
      validez,
      moneda,
      exclusiones,
      items: datosItems,
    };

    setGuardando(true);

    if (modo === "editar" && presupuestoId) {
      const res = await actualizarPresupuesto(presupuestoId, datos);
      setGuardando(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success("Presupuesto actualizado");
      router.push(`/presupuestos/${presupuestoId}`);
      return;
    }

    if (modo === "duplicar" && obraCodigoDestino) {
      const res = await crearVersionPresupuesto(obraCodigoDestino, datos);
      setGuardando(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success(`Nueva versión creada: ${res.obraCodigo}`);
      router.push(`/presupuestos/${res.presupuestoId}`);
      return;
    }

    const res = await crearPresupuesto(datos);
    setGuardando(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    toast.success(`Presupuesto creado: ${res.obraCodigo} v1`);
    router.push(`/presupuestos/${res.presupuestoId}`);
  }

  const titulo =
    modo === "editar"
      ? "Editar presupuesto"
      : modo === "duplicar"
        ? obraCodigoDestino
          ? "Duplicar — nueva versión"
          : "Duplicar — obra nueva"
        : "Nuevo presupuesto";

  return (
    <form onSubmit={handleSubmit} className="space-y-6 pb-4">
      <div>
        <p className="text-xs font-semibold tracking-[0.16em] text-cobre-oscuro uppercase">Presupuestos</p>
        <h1 className="mt-1 text-[1.75rem] leading-tight font-semibold tracking-[-0.035em]">{titulo}</h1>
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-destructive/8 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <Card>
        <CardHeader className="border-b [.border-b]:pb-4">
          <CardTitle className="text-lg font-semibold">Cliente y obra</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Cliente *</Label>
              {clienteSeleccionado ? (
                <div className="flex min-h-10 items-center justify-between rounded-lg border border-input bg-card px-3 py-2">
                  <div>
                    <p className="text-sm">{clienteSeleccionado.nombre}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {clienteSeleccionado.codigo}
                    </p>
                  </div>
                  {!clienteBloqueado && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setClienteSeleccionado(null)}
                    >
                      Cambiar
                    </Button>
                  )}
                </div>
              ) : (
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Autocomplete
                      items={clientes ?? []}
                      getKey={(c) => c.codigo}
                      getLabel={(c) => c.nombre}
                      getSubLabel={(c) => `${c.codigo} · ${c.telefono}`}
                      onSelect={seleccionarCliente}
                      placeholder="Buscar cliente por nombre, código o teléfono..."
                    />
                  </div>
                  <Button type="button" variant="outline" onClick={() => setDialogClienteRapido(true)}>
                    <UserPlus data-icon="inline-start" />
                    Crear cliente
                  </Button>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="telefono">Teléfono de contacto *</Label>
              <Input
                id="telefono"
                required
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="direccionObra">Dirección de la obra</Label>
              <Input
                id="direccionObra"
                value={direccionObra}
                onChange={(e) => setDireccionObra(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fechaVisita">Fecha de visita</Label>
              <Input
                id="fechaVisita"
                type="date"
                value={fechaVisita}
                onChange={(e) => setFechaVisita(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fechaEmision">Fecha de emisión</Label>
              <Input
                id="fechaEmision"
                type="date"
                value={fechaEmision}
                onChange={(e) => setFechaEmision(e.target.value)}
              />
            </div>
          </div>

          <details
            className="group rounded-xl border border-border bg-hueso/35"
            open={datosTecnicosAbiertos}
            onToggle={(evento) => setDatosTecnicosAbiertos(evento.currentTarget.open)}
          >
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold marker:content-none">
              Más datos técnicos de la obra
              <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <div className="grid gap-4 border-t p-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="tipoObra">Tipo de obra</Label>
                <Input id="tipoObra" value={tipoObra} onChange={(e) => setTipoObra(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vendedor">Vendedor</Label>
                <Input id="vendedor" value={vendedor} onChange={(e) => setVendedor(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="m2Relevados">m² relevados</Label>
                <Input id="m2Relevados" type="number" step="0.01" min="0" value={m2Relevados} onChange={(e) => setM2Relevados(Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="subpiso">Subpiso</Label>
                <Input id="subpiso" value={subpiso} onChange={(e) => setSubpiso(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nivelSubpiso">Nivel de subpiso</Label>
                <Input id="nivelSubpiso" value={nivelSubpiso} onChange={(e) => setNivelSubpiso(e.target.value)} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="observacionesRiesgos">Observaciones / riesgos</Label>
                <Textarea id="observacionesRiesgos" rows={3} value={observacionesRiesgos} onChange={(e) => setObservacionesRiesgos(e.target.value)} />
              </div>
            </div>
          </details>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b [.border-b]:pb-4">
          <CardTitle className="text-lg font-semibold">Modalidad</CardTitle>
        </CardHeader>
        <CardContent>
          <NativeSelect
            value={modalidad}
            onChange={(e) => setModalidad(e.target.value as ModalidadPresupuesto)}
          >
            {(Object.keys(MODALIDAD_LABEL) as ModalidadPresupuesto[]).map((m) => (
              <option key={m} value={m}>
                {MODALIDAD_LABEL[m]}
              </option>
            ))}
          </NativeSelect>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex items-center justify-between border-b [.border-b]:pb-4">
          <CardTitle className="text-lg font-semibold">Ítems</CardTitle>
          {modo === "duplicar" && (
            <Button type="button" variant="outline" size="sm" onClick={actualizarPreciosDesdeCatalogo}>
              <RefreshCw data-icon="inline-start" />
              Actualizar precios desde catálogo
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <div className="flex-1">
              <Autocomplete
                items={catalogo ?? []}
                getKey={(i) => i.id}
                getLabel={(i) => i.nombre}
                getSubLabel={(i) => `${i.codigo} · ${GRUPO_LABEL[i.grupoContable]}`}
                onSelect={agregarItemCatalogo}
                placeholder="Buscar en el catálogo por nombre o código..."
              />
            </div>
            <Button type="button" variant="outline" onClick={() => setManualAbierto((v) => !v)}>
              <Plus data-icon="inline-start" />
              Ítem manual
            </Button>
          </div>

          {manualAbierto && (
            <div className="grid grid-cols-2 gap-2 rounded-lg border border-dashed border-input bg-muted/40 p-3 sm:grid-cols-5">
              <div className="col-span-2 space-y-1">
                <Label htmlFor="manualNombre">Nombre *</Label>
                <Input
                  id="manualNombre"
                  value={manualNombre}
                  onChange={(e) => setManualNombre(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="manualRubro">Rubro *</Label>
                <Input
                  id="manualRubro"
                  value={manualRubro}
                  onChange={(e) => setManualRubro(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="manualUnidad">Unidad *</Label>
                <Input
                  id="manualUnidad"
                  value={manualUnidad}
                  onChange={(e) => setManualUnidad(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="manualPrecio">Precio unitario</Label>
                <Input
                  id="manualPrecio"
                  type="number"
                  step="0.01"
                  min="0"
                  value={manualPrecio}
                  onChange={(e) => setManualPrecio(Number(e.target.value))}
                />
              </div>
              <div className="col-span-2 space-y-1 sm:col-span-4">
                <Label htmlFor="manualGrupo">Grupo contable *</Label>
                <NativeSelect
                  id="manualGrupo"
                  value={manualGrupo}
                  onChange={(e) => setManualGrupo(e.target.value as GrupoContable)}
                >
                  {(Object.keys(GRUPO_LABEL) as GrupoContable[]).map((g) => (
                    <option key={g} value={g}>
                      {GRUPO_LABEL[g]}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="col-span-2 flex items-end sm:col-span-1">
                <Button type="button" className="w-full sm:w-auto" onClick={agregarItemManual}>
                  Agregar
                </Button>
              </div>
            </div>
          )}

          <div className="rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ítem</TableHead>
                  <TableHead>Grupo</TableHead>
                  <TableHead>Cantidad</TableHead>
                  <TableHead>Precio unitario</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {itemsConSubtotal.length === 0 && (
                  <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    <span className="mx-auto flex size-10 items-center justify-center rounded-full bg-muted">
                      <PackagePlus className="size-5" />
                    </span>
                    <span className="mt-3 block font-medium text-foreground">Todavía no agregaste ítems</span>
                    <span className="mt-1 block text-xs">Buscá en el catálogo o cargá un ítem manual.</span>
                    </TableCell>
                  </TableRow>
                )}
                {itemsConSubtotal.map((item) => {
                  const excluido = !incluidos.includes(item.grupoContable);
                  return (
                    <TableRow key={item.key} className={excluido ? "opacity-50" : undefined}>
                      <TableCell>
                        <div className="text-sm font-medium">{item.nombre}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          {item.codigo && <span className="font-mono">{item.codigo}</span>}
                          {item.codigo && <span>·</span>}
                          <span>{item.unidad}</span>
                          {item.requiereVerificacion && <VerificarBadge />}
                          {excluido && <span className="italic">no suma al total</span>}
                          {item.precioAnterior !== undefined && (
                            <Badge variant="secondary">
                              Precio actualizado (antes {fmtMoneda(item.precioAnterior)})
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{GRUPO_LABEL[item.grupoContable]}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            className="w-20"
                            value={item.cantidad}
                            onChange={(e) =>
                              actualizarItem(item.key, { cantidad: Number(e.target.value) })
                            }
                          />
                          {item.m2PorCaja && (
                            <span className="text-xs whitespace-nowrap text-muted-foreground">
                              = {(item.cantidad * item.m2PorCaja).toLocaleString("es-AR", {
                                maximumFractionDigits: 2,
                              })}{" "}
                              m²
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          className="w-28"
                          value={item.precioUnitario}
                          onChange={(e) =>
                            actualizarItem(item.key, { precioUnitario: Number(e.target.value) })
                          }
                        />
                      </TableCell>
                      <TableCell className="tnum text-right font-medium">{fmtMoneda(item.subtotal)}</TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Quitar ${item.nombre}`}
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => quitarItem(item.key)}
                        >
                          <X />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b [.border-b]:pb-4">
          <CardTitle className="text-lg font-semibold">Condiciones</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="formaPago">Forma de pago</Label>
              <Input
                id="formaPago"
                value={formaPago}
                onChange={(e) => setFormaPago(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="validez">Validez</Label>
              <Input id="validez" value={validez} onChange={(e) => setValidez(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="moneda">Moneda</Label>
              <Input id="moneda" value={moneda} onChange={(e) => setMoneda(e.target.value)} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="exclusiones">Exclusiones / observaciones</Label>
              <Textarea
                id="exclusiones"
                rows={2}
                value={exclusiones}
                onChange={(e) => setExclusiones(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Barra fija: total en vivo + guardar, siempre a la vista mientras se carga el presupuesto. */}
      <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-grafito px-5 py-4 text-hueso shadow-[0_18px_45px_-18px_rgba(31,31,31,0.7)]">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <div className="text-xs text-hueso/60">
            Materiales + accesorios{" "}
            <span
              className={`tnum ml-1 font-medium ${
                !incluidos.includes("materiales") && !incluidos.includes("accesorios")
                  ? "text-hueso/40 line-through"
                  : "text-hueso"
              }`}
            >
              {fmtMoneda(totales.subtotalMateriales + totales.subtotalAccesorios)}
            </span>
          </div>
          <div className="text-xs text-hueso/60">
            Mano de obra{" "}
            <span
              className={`tnum ml-1 font-medium ${
                !incluidos.includes("mano_obra") ? "text-hueso/40 line-through" : "text-hueso"
              }`}
            >
              {fmtMoneda(totales.subtotalManoObra)}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-semibold tracking-wide text-hueso/80 uppercase">Total</span>
            <span className="tnum font-mono text-xl font-bold text-cobre">
              {fmtMoneda(totales.total)}
            </span>
          </div>
        </div>
        <Button type="submit" disabled={guardando} className="bg-cobre px-5 text-white hover:bg-cobre/85">
          {guardando ? "Guardando..." : "Guardar presupuesto"}
        </Button>
      </div>

      <ClienteAltaRapidaDialog
        open={dialogClienteRapido}
        onOpenChange={setDialogClienteRapido}
        onCreado={(c) => {
          setClienteSeleccionado(c);
          setTelefono(c.telefono);
        }}
      />
    </form>
  );
}

function timestampAInputDate(ts: Timestamp): string {
  return ts.toDate().toISOString().slice(0, 10);
}

/** Convierte un presupuesto ya persistido en el prefill que consume el form (editar o duplicar). */
export function presupuestoAPrefill(p: Presupuesto): PresupuestoPrefill {
  return {
    clienteId: p.clienteId,
    clienteNombre: p.clienteNombre,
    telefono: p.telefono,
    direccionObra: p.direccionObra,
    tipoObra: p.tipoObra,
    vendedor: p.vendedor,
    fechaVisita: timestampAInputDate(p.fechaVisita as unknown as Timestamp),
    fechaEmision: timestampAInputDate(p.fechaEmision as unknown as Timestamp),
    m2Relevados: p.m2Relevados,
    subpiso: p.subpiso,
    nivelSubpiso: p.nivelSubpiso,
    observacionesRiesgos: p.observacionesRiesgos,
    modalidad: p.modalidad,
    formaPago: p.formaPago,
    validez: p.validez,
    moneda: p.moneda,
    exclusiones: p.exclusiones,
    items: p.items.map((i) => ({
      catalogoId: i.catalogoId,
      codigo: i.codigo,
      nombre: i.nombre,
      rubro: i.rubro,
      unidad: i.unidad,
      cantidad: i.cantidad,
      precioUnitario: i.precioUnitario,
      grupoContable: i.grupoContable,
      requiereVerificacion: i.requiereVerificacion,
    })),
  };
}
