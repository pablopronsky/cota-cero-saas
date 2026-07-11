"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { CalendarClock, ClipboardCopy, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  actualizarEstadoComercial,
  programarSeguimiento,
  registrarContacto,
} from "@/lib/acciones/comercial";
import { db } from "@/lib/firebase/client";
import type { CanalContacto, EstadoComercial, MotivoPerdida, Obra } from "@/lib/tipos";
import { EstadoComercialBadge } from "@/components/estado-badge";
import { VigenciaChip } from "@/components/comercial/vigencia-chip";
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

const ESTADO_LABEL: Record<EstadoComercial, string> = {
  PendienteEnvio: "Pendiente de envío",
  Enviado: "Enviado",
  EnNegociacion: "En negociación",
  Ganado: "Ganado",
  Perdido: "Perdido",
};
const MOTIVO_LABEL: Record<MotivoPerdida, string> = {
  precio: "Precio",
  plazo: "Plazo",
  competidor: "Competidor",
  alcance: "Alcance",
  sin_respuesta: "Sin respuesta",
  otro: "Otro",
};
const CANAL_LABEL: Record<CanalContacto, string> = {
  whatsapp: "WhatsApp",
  llamada: "Llamada",
  visita: "Visita",
  email: "Email",
  otro: "Otro",
};

type FechaConToDate = { toDate(): Date };

function fechaInput(fecha: FechaConToDate | null | undefined): string {
  if (!fecha) return "";
  const valor = fecha.toDate();
  const mes = String(valor.getMonth() + 1).padStart(2, "0");
  const dia = String(valor.getDate()).padStart(2, "0");
  return `${valor.getFullYear()}-${mes}-${dia}`;
}

function fechaHora(fecha: FechaConToDate): string {
  return fecha.toDate().toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
}

export function PanelComercial({
  obraCodigo,
  versionPresupuesto,
  clienteNombre,
  total,
  venceEl,
  abrirContactoInicial = false,
}: {
  obraCodigo: string;
  versionPresupuesto: number;
  clienteNombre: string;
  total: number;
  venceEl: FechaConToDate | null;
  abrirContactoInicial?: boolean;
}) {
  const [obra, setObra] = useState<Obra | null | undefined>(undefined);
  const [estado, setEstado] = useState<EstadoComercial | null>(null);
  const [motivo, setMotivo] = useState<MotivoPerdida | null>(null);
  const [detalleMotivo, setDetalleMotivo] = useState<string | null>(null);
  const [fechaSeguimiento, setFechaSeguimiento] = useState<string | null>(null);
  const [guardandoEstado, setGuardandoEstado] = useState(false);
  const [guardandoSeguimiento, setGuardandoSeguimiento] = useState(false);
  const [dialogContacto, setDialogContacto] = useState(abrirContactoInicial);

  useEffect(() => {
    return onSnapshot(doc(db, "obras", obraCodigo), (snap) => {
      setObra(snap.exists() ? (snap.data() as Obra) : null);
    });
  }, [obraCodigo]);

  const estadosDisponibles: EstadoComercial[] = (() => {
    if (!obra?.estadoComercial) return [];
    if (obra.estadoComercial === "Ganado" || obra.estadoComercial === "Perdido") {
      return [obra.estadoComercial, "EnNegociacion"];
    }
    return ["PendienteEnvio", "Enviado", "EnNegociacion", "Perdido"] as EstadoComercial[];
  })();

  const estadoSeleccionado = estado ?? obra?.estadoComercial ?? "Enviado";
  const motivoSeleccionado = motivo ?? obra?.motivoPerdida ?? "otro";
  const detalleSeleccionado = detalleMotivo ?? obra?.motivoPerdidaDetalle ?? "";
  const seguimientoSeleccionado = fechaSeguimiento ?? fechaInput(obra?.proximoSeguimiento);

  async function guardarEstado() {
    setGuardandoEstado(true);
    const res = await actualizarEstadoComercial({
      obraCodigo,
      estado: estadoSeleccionado,
      motivoPerdida: estadoSeleccionado === "Perdido" ? motivoSeleccionado : null,
      motivoPerdidaDetalle: estadoSeleccionado === "Perdido" ? detalleSeleccionado : "",
    });
    setGuardandoEstado(false);
    if (!res.ok) return toast.error(res.error);
    const estabaCerrada = obra?.estadoComercial === "Ganado" || obra?.estadoComercial === "Perdido";
    toast.success(estadoSeleccionado === "EnNegociacion" && estabaCerrada ? "Obra reabierta" : "Estado comercial actualizado");
  }

  async function guardarSeguimiento() {
    setGuardandoSeguimiento(true);
    const res = await programarSeguimiento(obraCodigo, seguimientoSeleccionado || null);
    setGuardandoSeguimiento(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(seguimientoSeleccionado ? "Seguimiento programado" : "Seguimiento eliminado");
  }

  async function copiarMensaje() {
    const vigencia = venceEl ? ` Vigencia: hasta ${venceEl.toDate().toLocaleDateString("es-AR")}.` : "";
    const monto = total.toLocaleString("es-AR", { style: "currency", currency: "ARS" });
    const mensaje = `Hola ${clienteNombre}, queríamos hacer seguimiento del presupuesto ${obraCodigo} v${versionPresupuesto}, por ${monto}.${vigencia}`;
    try {
      await navigator.clipboard.writeText(mensaje);
      toast.success("Mensaje de seguimiento copiado");
    } catch {
      toast.error("No se pudo copiar el mensaje");
    }
  }

  if (obra === undefined) return <Card><CardContent className="py-5 text-sm text-muted-foreground">Cargando información comercial…</CardContent></Card>;
  if (obra === null) return null;
  if (!obra.estadoComercial) {
    return <Card><CardContent className="py-5 text-sm text-muted-foreground">Esta obra aún no tiene datos comerciales. Ejecutá la migración de Fase A antes de modificarla.</CardContent></Card>;
  }

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle>Comercial</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <EstadoComercialBadge estado={obra.estadoComercial} />
          <VigenciaChip venceEl={venceEl} estadoComercial={obra.estadoComercial} />
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <div className="space-y-2">
            <Label htmlFor="estado-comercial">Estado comercial</Label>
            <NativeSelect id="estado-comercial" value={estadoSeleccionado} onChange={(e) => setEstado(e.target.value as EstadoComercial)}>
              {estadosDisponibles.map((item) => <option key={item} value={item}>{ESTADO_LABEL[item]}</option>)}
            </NativeSelect>
          </div>
          <Button className="self-end" variant="outline" onClick={guardarEstado} disabled={guardandoEstado || estadoSeleccionado === obra.estadoComercial}>
            {guardandoEstado ? "Guardando…" : "Guardar estado"}
          </Button>
        </div>

        {estadoSeleccionado === "Perdido" && (
          <div className="grid gap-3 rounded-lg border border-border p-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="motivo-perdida">Motivo de pérdida *</Label>
              <NativeSelect id="motivo-perdida" value={motivoSeleccionado} onChange={(e) => setMotivo(e.target.value as MotivoPerdida)}>
                {Object.entries(MOTIVO_LABEL).map(([valor, label]) => <option key={valor} value={valor}>{label}</option>)}
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="detalle-perdida">Detalle</Label>
              <Input id="detalle-perdida" value={detalleSeleccionado} onChange={(e) => setDetalleMotivo(e.target.value)} />
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-2 border-t pt-4">
          <div className="space-y-2">
            <Label htmlFor="proximo-seguimiento">Próximo seguimiento</Label>
            <Input id="proximo-seguimiento" type="date" value={seguimientoSeleccionado} onChange={(e) => setFechaSeguimiento(e.target.value)} />
          </div>
          <Button variant="outline" onClick={guardarSeguimiento} disabled={guardandoSeguimiento}>
            <CalendarClock data-icon="inline-start" />
            {guardandoSeguimiento ? "Guardando…" : "Programar"}
          </Button>
          <Button variant="outline" onClick={() => setDialogContacto(true)}>
            <Plus data-icon="inline-start" /> Registrar contacto
          </Button>
          <Button variant="outline" onClick={copiarMensaje}>
            <ClipboardCopy data-icon="inline-start" /> Copiar mensaje de WhatsApp
          </Button>
        </div>

        <div className="space-y-2 border-t pt-4">
          <p className="text-sm font-medium">Historial de contactos</p>
          {(obra.contactos ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no hay contactos registrados.</p>
          ) : (
            <ul className="space-y-2">
              {[...(obra.contactos ?? [])].reverse().map((contacto, index) => (
                <li key={`${contacto.fechaHora.toDate().getTime()}-${index}`} className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
                  <div className="flex flex-wrap justify-between gap-x-3 text-muted-foreground">
                    <span>{CANAL_LABEL[contacto.canal]} · v{contacto.versionPresupuesto}</span>
                    <span>{fechaHora(contacto.fechaHora)}</span>
                  </div>
                  <p className="mt-1">{contacto.nota}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{contacto.usuario}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
      <ContactoDialog open={dialogContacto} onOpenChange={setDialogContacto} obraCodigo={obraCodigo} versionPresupuesto={versionPresupuesto} />
    </Card>
  );
}

function ContactoDialog({ open, onOpenChange, obraCodigo, versionPresupuesto }: { open: boolean; onOpenChange: (open: boolean) => void; obraCodigo: string; versionPresupuesto: number }) {
  const [canal, setCanal] = useState<CanalContacto>("whatsapp");
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    const res = await registrarContacto({ obraCodigo, canal, nota, versionPresupuesto });
    setGuardando(false);
    if (!res.ok) return setError(res.error);
    toast.success("Contacto registrado");
    setNota("");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(valor) => { onOpenChange(valor); if (!valor) setError(null); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Registrar contacto</DialogTitle><DialogDescription>Dejá un registro breve del seguimiento con el cliente.</DialogDescription></DialogHeader>
        <form onSubmit={guardar} className="space-y-4">
          <div className="space-y-2"><Label htmlFor="canal-contacto">Canal</Label><NativeSelect id="canal-contacto" value={canal} onChange={(e) => setCanal(e.target.value as CanalContacto)}>{Object.entries(CANAL_LABEL).map(([valor, label]) => <option key={valor} value={valor}>{label}</option>)}</NativeSelect></div>
          <div className="space-y-2"><Label htmlFor="nota-contacto">Nota *</Label><Textarea id="nota-contacto" value={nota} onChange={(e) => setNota(e.target.value)} required rows={3} /></div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button type="submit" disabled={guardando}>{guardando ? "Guardando…" : "Registrar"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
