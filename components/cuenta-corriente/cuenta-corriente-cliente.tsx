"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  where,
  type Timestamp,
} from "firebase/firestore";
import { toast } from "sonner";
import { db } from "@/lib/firebase/client";
import {
  anularConfirmacion,
  anularPago,
  confirmarPresupuesto,
  registrarAjuste,
  registrarPago,
} from "@/lib/acciones/cuentaCorriente";
import type { Cliente, Movimiento, Presupuesto } from "@/lib/tipos";
import { Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TipoMovimientoBadge } from "@/components/estado-badge";

interface MovimientoConId extends Movimiento {
  id: string;
}

interface PresupuestoConId extends Presupuesto {
  id: string;
}

const fmtMoneda = (n: number) => n.toLocaleString("es-AR", { style: "currency", currency: "ARS" });
const fmtFecha = (ts: Timestamp) => (ts ? ts.toDate().toLocaleDateString("es-AR") : "—");

export function CuentaCorrienteCliente({ clienteId }: { clienteId: string }) {
  const [cliente, setCliente] = useState<Cliente | null | undefined>(undefined);
  const [movimientos, setMovimientos] = useState<MovimientoConId[] | null>(null);
  const [presupuestos, setPresupuestos] = useState<PresupuestoConId[] | null>(null);
  const [dialogAbierto, setDialogAbierto] = useState<
    "confirmar" | "pago" | "anularConfirmacion" | "anularPago" | "ajuste" | null
  >(null);
  const [generandoRecibo, setGenerandoRecibo] = useState<string | null>(null);

  useEffect(() => {
    return onSnapshot(
      doc(db, "clientes", clienteId),
      (snap) => setCliente(snap.exists() ? (snap.data() as Cliente) : null),
      (error) => {
        if (error.code !== "permission-denied") console.error(error);
      },
    );
  }, [clienteId]);

  useEffect(() => {
    return onSnapshot(
      query(
        collection(db, "movimientos"),
        where("clienteId", "==", clienteId),
        orderBy("fechaHora", "asc"),
      ),
      (snap) => setMovimientos(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Movimiento) }))),
      (error) => {
        if (error.code !== "permission-denied") console.error(error);
      },
    );
  }, [clienteId]);

  useEffect(() => {
    return onSnapshot(
      query(
        collection(db, "presupuestos"),
        where("clienteId", "==", clienteId),
        orderBy("creadoEn", "desc"),
      ),
      (snap) => setPresupuestos(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Presupuesto) }))),
      (error) => {
        if (error.code !== "permission-denied") console.error(error);
      },
    );
  }, [clienteId]);

  const movimientosConAcumulado = useMemo(() => {
    if (!movimientos) return [];
    let acumulado = 0;
    const conAcumulado = movimientos.map((m) => {
      acumulado += m.debe - m.haber;
      return { ...m, acumulado };
    });
    return [...conAcumulado].reverse();
  }, [movimientos]);

  const anuladoPagoIds = useMemo(
    () =>
      new Set(
        (movimientos ?? [])
          .filter((m) => m.tipo === "ANULACION_PAGO" && m.movAnuladoId)
          .map((m) => m.movAnuladoId as string),
      ),
    [movimientos],
  );
  const pagosAnulables = useMemo(
    () =>
      [...(movimientos ?? [])]
        .filter((m) => m.tipo === "PAGO" && !anuladoPagoIds.has(m.id))
        .reverse(),
    [movimientos, anuladoPagoIds],
  );

  const presupuestosEmitidos = useMemo(
    () => (presupuestos ?? []).filter((p) => p.estado === "Emitido"),
    [presupuestos],
  );
  const presupuestosConfirmados = useMemo(
    () => (presupuestos ?? []).filter((p) => p.estado === "Confirmado"),
    [presupuestos],
  );

  async function descargarRecibo(movimientoId: string) {
    setGenerandoRecibo(movimientoId);
    try {
      const res = await fetch(`/api/pdf/recibo/${movimientoId}`, { method: "POST" });
      const datos = await res.json();
      if (!res.ok || !datos.ok) {
        toast.error(datos.error ?? "No se pudo generar el recibo");
        return;
      }
      window.open(datos.url, "_blank");
    } catch (err) {
      console.error(err);
      toast.error("No se pudo generar el recibo");
    } finally {
      setGenerandoRecibo(null);
    }
  }

  if (cliente === undefined) return <Skeleton className="h-40 w-full rounded-lg" />;
  if (cliente === null) return <p className="text-sm text-muted-foreground">Cliente no encontrado.</p>;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Saldo actual
        </p>
        <p
          className={`tnum mt-0.5 text-xl font-semibold ${
            cliente.saldo > 0 ? "text-destructive" : cliente.saldo < 0 ? "text-exito" : ""
          }`}
        >
          {fmtMoneda(cliente.saldo)}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setDialogAbierto("confirmar")}>
          Confirmar presupuesto
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setDialogAbierto("pago")}>
          Registrar pago
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setDialogAbierto("anularConfirmacion")}
        >
          Anular confirmación
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setDialogAbierto("anularPago")}>
          Anular pago
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setDialogAbierto("ajuste")}>
          Ajuste manual
        </Button>
      </div>

      {/* Tabla — desktop/tablet */}
      <div className="hidden overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-4">Fecha</TableHead>
              <TableHead>Movimiento</TableHead>
              <TableHead className="text-right">Debe</TableHead>
              <TableHead className="text-right">Haber</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
              <TableHead className="pr-4" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {movimientos === null && (
              <TableRow>
                <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                  Cargando movimientos...
                </TableCell>
              </TableRow>
            )}
            {movimientos !== null && movimientos.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                  Sin movimientos todavía.
                </TableCell>
              </TableRow>
            )}
            {movimientosConAcumulado.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="pl-4 text-xs whitespace-nowrap text-muted-foreground">
                  {fmtFecha(m.fechaHora as unknown as Timestamp)}
                </TableCell>
                <TableCell className="whitespace-normal">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <TipoMovimientoBadge tipo={m.tipo} />
                    <span className="text-sm">{m.concepto}</span>
                  </div>
                  {m.motivo && <p className="mt-0.5 text-xs text-muted-foreground">Motivo: {m.motivo}</p>}
                  <p className="mt-0.5 font-mono text-xs text-muted-foreground/70">{m.codigo}</p>
                </TableCell>
                <TableCell className="tnum text-right">
                  {m.debe > 0 ? fmtMoneda(m.debe) : <span className="text-muted-foreground/50">—</span>}
                </TableCell>
                <TableCell className="tnum text-right">
                  {m.haber > 0 ? fmtMoneda(m.haber) : <span className="text-muted-foreground/50">—</span>}
                </TableCell>
                <TableCell className="tnum text-right font-medium">{fmtMoneda(m.acumulado)}</TableCell>
                <TableCell className="pr-4">
                  <div className="flex items-center justify-end gap-1">
                    {m.presupuestoId && (
                      <Button type="button" variant="ghost" size="sm" asChild>
                        <Link href={`/presupuestos/${m.presupuestoId}`}>Ver</Link>
                      </Button>
                    )}
                    {m.tipo === "PAGO" && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={generandoRecibo === m.id}
                        onClick={() => descargarRecibo(m.id)}
                      >
                        <Receipt data-icon="inline-start" />
                        {generandoRecibo === m.id ? "Generando..." : "Recibo"}
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Tarjetas — mobile */}
      <div className="space-y-2 md:hidden">
        {movimientos === null && (
          <p className="py-6 text-center text-sm text-muted-foreground">Cargando movimientos...</p>
        )}
        {movimientos !== null && movimientos.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">Sin movimientos todavía.</p>
        )}
        {movimientosConAcumulado.map((m) => (
          <div key={m.id} className="rounded-xl bg-card p-3 ring-1 ring-foreground/10">
            <div className="flex items-start justify-between gap-2">
              <TipoMovimientoBadge tipo={m.tipo} />
              <span className="text-xs whitespace-nowrap text-muted-foreground">
                {fmtFecha(m.fechaHora as unknown as Timestamp)}
              </span>
            </div>
            <p className="mt-1.5 text-sm">{m.concepto}</p>
            {m.motivo && <p className="mt-0.5 text-xs text-muted-foreground">Motivo: {m.motivo}</p>}
            <p className="mt-0.5 font-mono text-xs text-muted-foreground/70">{m.codigo}</p>
            <div className="mt-2.5 flex items-center justify-between gap-3 border-t border-border pt-2.5 text-xs">
              <div className="flex gap-4">
                {m.debe > 0 && (
                  <span className="text-muted-foreground">
                    Debe <span className="tnum font-medium text-foreground">{fmtMoneda(m.debe)}</span>
                  </span>
                )}
                {m.haber > 0 && (
                  <span className="text-muted-foreground">
                    Haber <span className="tnum font-medium text-foreground">{fmtMoneda(m.haber)}</span>
                  </span>
                )}
              </div>
              <span className="text-muted-foreground">
                Saldo <span className="tnum font-semibold text-foreground">{fmtMoneda(m.acumulado)}</span>
              </span>
            </div>
            {(m.presupuestoId || m.tipo === "PAGO") && (
              <div className="mt-1 flex items-center justify-end gap-1">
                {m.presupuestoId && (
                  <Button type="button" variant="ghost" size="sm" asChild>
                    <Link href={`/presupuestos/${m.presupuestoId}`}>Ver</Link>
                  </Button>
                )}
                {m.tipo === "PAGO" && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={generandoRecibo === m.id}
                    onClick={() => descargarRecibo(m.id)}
                  >
                    <Receipt data-icon="inline-start" />
                    {generandoRecibo === m.id ? "Generando..." : "Recibo"}
                  </Button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <ConfirmarPresupuestoDialog
        key={`confirmar-${dialogAbierto === "confirmar" ? "abierto" : "cerrado"}`}
        open={dialogAbierto === "confirmar"}
        onOpenChange={(o) => setDialogAbierto(o ? "confirmar" : null)}
        presupuestos={presupuestosEmitidos}
      />
      <RegistrarPagoDialog
        open={dialogAbierto === "pago"}
        onOpenChange={(o) => setDialogAbierto(o ? "pago" : null)}
        clienteId={clienteId}
        presupuestos={presupuestos ?? []}
      />
      <AnularConfirmacionDialog
        key={`anularConfirmacion-${dialogAbierto === "anularConfirmacion" ? "abierto" : "cerrado"}`}
        open={dialogAbierto === "anularConfirmacion"}
        onOpenChange={(o) => setDialogAbierto(o ? "anularConfirmacion" : null)}
        presupuestos={presupuestosConfirmados}
      />
      <AnularPagoDialog
        key={`anularPago-${dialogAbierto === "anularPago" ? "abierto" : "cerrado"}`}
        open={dialogAbierto === "anularPago"}
        onOpenChange={(o) => setDialogAbierto(o ? "anularPago" : null)}
        pagos={pagosAnulables}
      />
      <AjusteDialog
        open={dialogAbierto === "ajuste"}
        onOpenChange={(o) => setDialogAbierto(o ? "ajuste" : null)}
        clienteId={clienteId}
      />
    </div>
  );
}

function ConfirmarPresupuestoDialog({
  open,
  onOpenChange,
  presupuestos,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  presupuestos: PresupuestoConId[];
}) {
  const [presupuestoId, setPresupuestoId] = useState(() => presupuestos[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!presupuestoId) return;
    setGuardando(true);
    setError(null);
    const res = await confirmarPresupuesto(presupuestoId);
    setGuardando(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    toast.success("Presupuesto confirmado");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Confirmar presupuesto</DialogTitle>
          <DialogDescription>Registra el debe en la cuenta corriente del cliente.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {presupuestos.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Este cliente no tiene presupuestos en estado Emitido.
            </p>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="presupuesto-confirmar">Presupuesto</Label>
              <NativeSelect
                id="presupuesto-confirmar"
                value={presupuestoId}
                onChange={(e) => setPresupuestoId(e.target.value)}
              >
                {presupuestos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.obraCodigo} v{p.version} · {fmtMoneda(p.total)}
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardando || presupuestos.length === 0}>
              {guardando ? "Confirmando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RegistrarPagoDialog({
  open,
  onOpenChange,
  clienteId,
  presupuestos,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clienteId: string;
  presupuestos: PresupuestoConId[];
}) {
  const [monto, setMonto] = useState(0);
  const [medioPago, setMedioPago] = useState("");
  const [referencia, setReferencia] = useState("");
  const [presupuestoId, setPresupuestoId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [avisoSaldoAFavor, setAvisoSaldoAFavor] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  function reset() {
    setMonto(0);
    setMedioPago("");
    setReferencia("");
    setPresupuestoId("");
    setError(null);
    setAvisoSaldoAFavor(null);
  }

  async function enviar(permitirSaldoAFavor: boolean) {
    setGuardando(true);
    setError(null);
    const res = await registrarPago({
      clienteId,
      monto,
      medioPago,
      referencia,
      presupuestoId: presupuestoId || null,
      permitirSaldoAFavor,
    });
    setGuardando(false);
    if (!res.ok) {
      if (res.codigoError === "SALDO_A_FAVOR") {
        setAvisoSaldoAFavor(res.error);
        return;
      }
      setError(res.error);
      return;
    }
    toast.success("Pago registrado");
    onOpenChange(false);
    reset();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!(monto > 0)) {
      setError("Ingresá un monto mayor a cero");
      return;
    }
    setAvisoSaldoAFavor(null);
    await enviar(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Registrar pago</DialogTitle>
          <DialogDescription>Se descuenta del saldo del cliente.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="monto-pago">Monto *</Label>
            <Input
              id="monto-pago"
              type="number"
              step="0.01"
              min="0"
              required
              value={monto}
              onChange={(e) => setMonto(Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="medio-pago">Medio de pago</Label>
            <Input
              id="medio-pago"
              placeholder="Efectivo, transferencia..."
              value={medioPago}
              onChange={(e) => setMedioPago(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="referencia-pago">Referencia</Label>
            <Input
              id="referencia-pago"
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
            />
          </div>
          {presupuestos.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="presupuesto-pago">Presupuesto asociado</Label>
              <NativeSelect
                id="presupuesto-pago"
                value={presupuestoId}
                onChange={(e) => setPresupuestoId(e.target.value)}
              >
                <option value="">— Sin presupuesto asociado —</option>
                {presupuestos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.obraCodigo} v{p.version} · {fmtMoneda(p.total)}
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}
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
                {guardando ? "Registrando..." : "Registrar igual"}
              </Button>
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardando}>
              {guardando ? "Registrando..." : "Registrar pago"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AnularConfirmacionDialog({
  open,
  onOpenChange,
  presupuestos,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  presupuestos: PresupuestoConId[];
}) {
  const [presupuestoId, setPresupuestoId] = useState(() => presupuestos[0]?.id ?? "");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!presupuestoId) return;
    setGuardando(true);
    setError(null);
    const res = await anularConfirmacion(presupuestoId, motivo);
    setGuardando(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    toast.success("Confirmación anulada");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Anular confirmación</DialogTitle>
          <DialogDescription>
            El motivo es obligatorio. El presupuesto pasa a Anulado y se revierte el saldo.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {presupuestos.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Este cliente no tiene presupuestos en estado Confirmado.
            </p>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="presupuesto-anular-confirmacion">Presupuesto</Label>
              <NativeSelect
                id="presupuesto-anular-confirmacion"
                value={presupuestoId}
                onChange={(e) => setPresupuestoId(e.target.value)}
              >
                {presupuestos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.obraCodigo} v{p.version} · {fmtMoneda(p.total)}
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="motivo-anular-confirmacion">Motivo *</Label>
            <Textarea
              id="motivo-anular-confirmacion"
              rows={2}
              required
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="destructive" disabled={guardando || presupuestos.length === 0}>
              {guardando ? "Anulando..." : "Anular"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AnularPagoDialog({
  open,
  onOpenChange,
  pagos,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pagos: MovimientoConId[];
}) {
  const [movimientoId, setMovimientoId] = useState(() => pagos[0]?.id ?? "");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!movimientoId) return;
    setGuardando(true);
    setError(null);
    const res = await anularPago(movimientoId, motivo);
    setGuardando(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    toast.success("Pago anulado");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Anular pago</DialogTitle>
          <DialogDescription>El motivo es obligatorio. Se restaura el saldo.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {pagos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Este cliente no tiene pagos para anular.</p>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="pago-anular">Pago</Label>
              <NativeSelect
                id="pago-anular"
                value={movimientoId}
                onChange={(e) => setMovimientoId(e.target.value)}
              >
                {pagos.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.codigo} · {fmtFecha(m.fechaHora as unknown as Timestamp)} · {fmtMoneda(m.haber)}
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="motivo-anular-pago">Motivo *</Label>
            <Textarea
              id="motivo-anular-pago"
              rows={2}
              required
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="destructive" disabled={guardando || pagos.length === 0}>
              {guardando ? "Anulando..." : "Anular pago"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AjusteDialog({
  open,
  onOpenChange,
  clienteId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clienteId: string;
}) {
  const [tipo, setTipo] = useState<"debe" | "haber">("debe");
  const [monto, setMonto] = useState(0);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  function reset() {
    setTipo("debe");
    setMonto(0);
    setMotivo("");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!(monto > 0)) {
      setError("Ingresá un monto mayor a cero");
      return;
    }
    setGuardando(true);
    setError(null);
    const res = await registrarAjuste({
      clienteId,
      debe: tipo === "debe" ? monto : 0,
      haber: tipo === "haber" ? monto : 0,
      motivo,
    });
    setGuardando(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    toast.success("Ajuste registrado");
    onOpenChange(false);
    reset();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Ajuste manual</DialogTitle>
          <DialogDescription>El motivo es obligatorio.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tipo-ajuste">Tipo</Label>
            <NativeSelect
              id="tipo-ajuste"
              value={tipo}
              onChange={(e) => setTipo(e.target.value as "debe" | "haber")}
            >
              <option value="debe">Debe (aumenta la deuda)</option>
              <option value="haber">Haber (reduce la deuda)</option>
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor="monto-ajuste">Monto *</Label>
            <Input
              id="monto-ajuste"
              type="number"
              step="0.01"
              min="0"
              required
              value={monto}
              onChange={(e) => setMonto(Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="motivo-ajuste">Motivo *</Label>
            <Textarea
              id="motivo-ajuste"
              rows={2}
              required
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardando}>
              {guardando ? "Registrando..." : "Registrar ajuste"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
