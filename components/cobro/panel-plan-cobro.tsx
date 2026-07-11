"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { CalendarPlus, ClipboardCopy, ListPlus, Pencil, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/firebase/client";
import {
  actualizarCuota,
  anularCuota,
  crearCuota,
  generarPlan,
  registrarPagoDeCuota,
  type TipoPlan,
} from "@/lib/acciones/cuotas";
import type { Cuota } from "@/lib/tipos";
import { EstadoCuotaBadge } from "@/components/estado-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

interface CuotaConId extends Cuota {
  id: string;
}

/** El venceEl de la cuota tipa como Timestamp del admin SDK; en runtime el cliente
 * SDK devuelve el suyo. Ambos exponen toDate(), así que alcanza con lo estructural. */
type ConToDate = { toDate(): Date };

const fmtMoneda = (n: number) => n.toLocaleString("es-AR", { style: "currency", currency: "ARS" });
const fmtFecha = (ts: ConToDate | null | undefined) =>
  ts ? ts.toDate().toLocaleDateString("es-AR") : "—";

/** "YYYY-MM-DD" para inputs date, a partir de un Timestamp. */
function fechaInput(ts: ConToDate | null | undefined): string {
  if (!ts) return "";
  const d = ts.toDate();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function estaVencida(cuota: CuotaConId): boolean {
  if (cuota.estado !== "Pendiente" || !cuota.venceEl) return false;
  return cuota.venceEl.toDate().getTime() < Date.now();
}

type Props =
  | {
      modo: "presupuesto";
      obraCodigo: string;
      presupuestoId: string;
      clienteNombre: string;
      total: number;
    }
  | { modo: "cliente"; clienteId: string; clienteNombre: string };

export function PanelPlanCobro(props: Props) {
  const [cuotas, setCuotas] = useState<CuotaConId[] | null>(null);
  const [dialogGenerar, setDialogGenerar] = useState(false);
  const [dialogCuota, setDialogCuota] = useState<{ modo: "crear" } | { modo: "editar"; cuota: CuotaConId } | null>(null);
  const [cuotaAPagar, setCuotaAPagar] = useState<CuotaConId | null>(null);
  const [cuotaAAnular, setCuotaAAnular] = useState<CuotaConId | null>(null);

  const clave = props.modo === "presupuesto" ? props.obraCodigo : props.clienteId;

  useEffect(() => {
    const q =
      props.modo === "presupuesto"
        ? query(collection(db, "cuotas"), where("obraCodigo", "==", clave), orderBy("orden", "asc"))
        : query(collection(db, "cuotas"), where("clienteId", "==", clave), orderBy("venceEl", "asc"));
    return onSnapshot(
      q,
      (snap) => setCuotas(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Cuota) }))),
      (error) => {
        if (error.code !== "permission-denied") console.error(error);
      },
    );
  }, [props.modo, clave]);

  const gestionable = props.modo === "presupuesto";
  const activas = useMemo(() => (cuotas ?? []).filter((c) => c.estado !== "Anulada"), [cuotas]);
  const hayActivas = activas.length > 0;
  const sumaActivas = useMemo(() => activas.reduce((acc, c) => acc + c.monto, 0), [activas]);
  const diferencia =
    props.modo === "presupuesto" ? Math.round((sumaActivas - props.total) * 100) / 100 : 0;

  function copiarRecordatorio(cuota: CuotaConId) {
    const nombre = props.clienteNombre;
    const vence = cuota.venceEl ? ` con vencimiento ${fmtFecha(cuota.venceEl)}` : "";
    const mensaje = `Hola ${nombre}, te recordamos la cuota "${cuota.concepto}" del presupuesto ${cuota.obraCodigo}, por ${fmtMoneda(cuota.monto)}${vence}. ¡Gracias!`;
    navigator.clipboard
      .writeText(mensaje)
      .then(() => toast.success("Recordatorio copiado"))
      .catch(() => toast.error("No se pudo copiar el recordatorio"));
  }

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle>Plan de cobro</CardTitle>
        {gestionable && (
          <div className="flex flex-wrap items-center gap-2">
            {!hayActivas && (
              <Button variant="outline" size="sm" onClick={() => setDialogGenerar(true)}>
                <ListPlus data-icon="inline-start" /> Generar plan
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setDialogCuota({ modo: "crear" })}>
              <CalendarPlus data-icon="inline-start" /> Agregar cuota
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {gestionable && hayActivas && diferencia !== 0 && (
          <p className="rounded-lg border border-cobre/40 bg-cobre/10 px-3 py-2 text-sm text-cobre-oscuro">
            La suma de las cuotas ({fmtMoneda(sumaActivas)}) difiere del total del presupuesto (
            {fmtMoneda(props.total)}) en {fmtMoneda(Math.abs(diferencia))}
            {diferencia > 0 ? " de más" : " de menos"}.
          </p>
        )}

        {cuotas === null && <p className="text-sm text-muted-foreground">Cargando cuotas…</p>}
        {cuotas !== null && cuotas.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Todavía no hay cuotas.{" "}
            {gestionable && "Generá un plan o agregá una cuota para empezar."}
          </p>
        )}

        {cuotas !== null && cuotas.length > 0 && (
          <ul className="space-y-2">
            {cuotas.map((cuota) => {
              const vencida = estaVencida(cuota);
              const anulada = cuota.estado === "Anulada";
              return (
                <li
                  key={cuota.id}
                  className={`rounded-lg border border-border px-3 py-2.5 ${anulada ? "opacity-55" : ""}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{cuota.concepto}</span>
                        <EstadoCuotaBadge estado={cuota.estado} />
                        {vencida && (
                          <span className="text-xs font-medium text-destructive">Vencida</span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Vence {fmtFecha(cuota.venceEl)}
                        {props.modo === "cliente" && ` · ${cuota.obraCodigo}`}
                        {cuota.notas && ` · ${cuota.notas}`}
                      </p>
                    </div>
                    <span className="tnum text-sm font-semibold whitespace-nowrap">
                      {fmtMoneda(cuota.monto)}
                    </span>
                  </div>

                  {cuota.estado === "Pendiente" && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
                      <Button size="sm" variant="outline" onClick={() => setCuotaAPagar(cuota)}>
                        <Wallet data-icon="inline-start" /> Registrar pago
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => copiarRecordatorio(cuota)}>
                        <ClipboardCopy data-icon="inline-start" /> Recordatorio
                      </Button>
                      {gestionable && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDialogCuota({ modo: "editar", cuota })}
                          >
                            <Pencil data-icon="inline-start" /> Editar
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setCuotaAAnular(cuota)}
                          >
                            <Trash2 data-icon="inline-start" /> Anular
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      {props.modo === "presupuesto" && (
        <>
          <GenerarPlanDialog
            open={dialogGenerar}
            onOpenChange={setDialogGenerar}
            presupuestoId={props.presupuestoId}
            total={props.total}
          />
          <CuotaDialog
            key={dialogCuota ? (dialogCuota.modo === "editar" ? `edit-${dialogCuota.cuota.id}` : "crear") : "cerrado"}
            estado={dialogCuota}
            onOpenChange={(o) => !o && setDialogCuota(null)}
            presupuestoId={props.presupuestoId}
          />
        </>
      )}

      <RegistrarPagoCuotaDialog
        key={cuotaAPagar?.id ?? "cerrado"}
        cuota={cuotaAPagar}
        onOpenChange={(o) => !o && setCuotaAPagar(null)}
      />
      <AnularCuotaDialog cuota={cuotaAAnular} onOpenChange={(o) => !o && setCuotaAAnular(null)} />
    </Card>
  );
}

function GenerarPlanDialog({
  open,
  onOpenChange,
  presupuestoId,
  total,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  presupuestoId: string;
  total: number;
}) {
  const hoy = new Date().toISOString().slice(0, 10);
  const [tipo, setTipo] = useState<TipoPlan>("anticipoSaldo");
  const [porcentaje, setPorcentaje] = useState(50);
  const [cantidad, setCantidad] = useState(3);
  const [fechaInicial, setFechaInicial] = useState(hoy);
  const [intervalo, setIntervalo] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    const res = await generarPlan({
      presupuestoId,
      tipo,
      porcentajeAnticipo: tipo === "anticipoSaldo" ? porcentaje : undefined,
      cantidad: tipo === "cuotasIguales" ? cantidad : undefined,
      fechaInicial,
      intervaloDias: intervalo,
    });
    setGuardando(false);
    if (!res.ok) return setError(res.error);
    toast.success("Plan de cobro generado");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Generar plan de cobro</DialogTitle>
          <DialogDescription>Total del presupuesto: {fmtMoneda(total)}.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tipo-plan">Tipo de plan</Label>
            <NativeSelect id="tipo-plan" value={tipo} onChange={(e) => setTipo(e.target.value as TipoPlan)}>
              <option value="anticipoSaldo">Anticipo + saldo</option>
              <option value="cuotasIguales">N cuotas iguales</option>
            </NativeSelect>
          </div>
          {tipo === "anticipoSaldo" ? (
            <div className="space-y-2">
              <Label htmlFor="porcentaje-anticipo">Anticipo (%)</Label>
              <Input
                id="porcentaje-anticipo"
                type="number"
                min="1"
                max="99"
                step="1"
                required
                value={porcentaje}
                onChange={(e) => setPorcentaje(Number(e.target.value))}
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="cantidad-cuotas">Cantidad de cuotas</Label>
              <Input
                id="cantidad-cuotas"
                type="number"
                min="1"
                step="1"
                required
                value={cantidad}
                onChange={(e) => setCantidad(Number(e.target.value))}
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="fecha-inicial">Primer vencimiento</Label>
              <Input
                id="fecha-inicial"
                type="date"
                required
                value={fechaInicial}
                onChange={(e) => setFechaInicial(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="intervalo-dias">Días entre cuotas</Label>
              <Input
                id="intervalo-dias"
                type="number"
                min="0"
                step="1"
                value={intervalo}
                onChange={(e) => setIntervalo(Number(e.target.value))}
              />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardando}>
              {guardando ? "Generando…" : "Generar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CuotaDialog({
  estado,
  onOpenChange,
  presupuestoId,
}: {
  estado: { modo: "crear" } | { modo: "editar"; cuota: CuotaConId } | null;
  onOpenChange: (open: boolean) => void;
  presupuestoId: string;
}) {
  // El padre remonta este dialog por `key` al abrirlo, así que inicializar el
  // estado desde la cuota en edición alcanza (sin efecto de sincronización).
  const editando = estado?.modo === "editar" ? estado.cuota : null;
  const [concepto, setConcepto] = useState(editando?.concepto ?? "");
  const [monto, setMonto] = useState(editando?.monto ?? 0);
  const [venceEl, setVenceEl] = useState(
    editando ? fechaInput(editando.venceEl) : new Date().toISOString().slice(0, 10),
  );
  const [notas, setNotas] = useState(editando?.notas ?? "");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    const res = editando
      ? await actualizarCuota({ cuotaId: editando.id, concepto, monto, venceEl, notas })
      : await crearCuota({ presupuestoId, concepto, monto, venceEl, notas });
    setGuardando(false);
    if (!res.ok) return setError(res.error);
    toast.success(editando ? "Cuota actualizada" : "Cuota agregada");
    onOpenChange(false);
  }

  return (
    <Dialog open={estado !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{editando ? "Editar cuota" : "Agregar cuota"}</DialogTitle>
          <DialogDescription>Las cuotas organizan el cobro; no mueven el saldo.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="concepto-cuota">Concepto *</Label>
            <Input
              id="concepto-cuota"
              required
              placeholder="Anticipo, Contra entrega…"
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="monto-cuota">Monto *</Label>
              <Input
                id="monto-cuota"
                type="number"
                min="0"
                step="0.01"
                required
                value={monto}
                onChange={(e) => setMonto(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vence-cuota">Vencimiento *</Label>
              <Input
                id="vence-cuota"
                type="date"
                required
                value={venceEl}
                onChange={(e) => setVenceEl(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notas-cuota">Notas</Label>
            <Textarea
              id="notas-cuota"
              rows={2}
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardando}>
              {guardando ? "Guardando…" : editando ? "Guardar" : "Agregar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RegistrarPagoCuotaDialog({
  cuota,
  onOpenChange,
}: {
  cuota: CuotaConId | null;
  onOpenChange: (open: boolean) => void;
}) {
  // Remontado por `key` desde el padre al elegir una cuota: estado inicial limpio.
  const [medioPago, setMedioPago] = useState("");
  const [referencia, setReferencia] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [avisoSaldoAFavor, setAvisoSaldoAFavor] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function enviar(permitirSaldoAFavor: boolean) {
    if (!cuota) return;
    setGuardando(true);
    setError(null);
    const res = await registrarPagoDeCuota({
      cuotaId: cuota.id,
      medioPago,
      referencia,
      permitirSaldoAFavor,
    });
    setGuardando(false);
    if (!res.ok) {
      if (res.codigoError === "SALDO_A_FAVOR") return setAvisoSaldoAFavor(res.error);
      return setError(res.error);
    }
    toast.success("Pago registrado");
    onOpenChange(false);
  }

  return (
    <Dialog open={cuota !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Registrar pago de cuota</DialogTitle>
          <DialogDescription>
            {cuota && `${cuota.concepto} · ${fmtMoneda(cuota.monto)}`}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setAvisoSaldoAFavor(null);
            enviar(false);
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="medio-pago-cuota">Medio de pago</Label>
            <Input
              id="medio-pago-cuota"
              placeholder="Efectivo, transferencia…"
              value={medioPago}
              onChange={(e) => setMedioPago(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="referencia-pago-cuota">Referencia</Label>
            <Input
              id="referencia-pago-cuota"
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
            />
          </div>
          {avisoSaldoAFavor && (
            <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
              <p className="text-sm text-destructive">{avisoSaldoAFavor}</p>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={guardando}
                onClick={() => enviar(true)}
              >
                {guardando ? "Registrando…" : "Registrar igual"}
              </Button>
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardando}>
              {guardando ? "Registrando…" : "Registrar pago"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AnularCuotaDialog({
  cuota,
  onOpenChange,
}: {
  cuota: CuotaConId | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [guardando, setGuardando] = useState(false);

  async function confirmar() {
    if (!cuota) return;
    setGuardando(true);
    const res = await anularCuota(cuota.id);
    setGuardando(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Cuota anulada");
    onOpenChange(false);
  }

  return (
    <Dialog open={cuota !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Anular cuota</DialogTitle>
          <DialogDescription>
            {cuota && `Se anula "${cuota.concepto}" (${fmtMoneda(cuota.monto)}). No afecta el saldo.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" variant="destructive" disabled={guardando} onClick={confirmar}>
            {guardando ? "Anulando…" : "Anular cuota"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
