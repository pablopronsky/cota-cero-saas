"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { doc, onSnapshot, type Timestamp } from "firebase/firestore";
import { toast } from "sonner";
import { db } from "@/lib/firebase/client";
import { puedeEditarse, puedeDuplicarse, puedeConfirmarse, puedeAnularse, telefonoValido } from "@/lib/reglas/validaciones";
import { gruposIncluidos } from "@/lib/reglas/totales";
import { confirmarPresupuesto, anularConfirmacion } from "@/lib/acciones/cuentaCorriente";
import type { GrupoContable, ModalidadPresupuesto, Presupuesto } from "@/lib/tipos";
import { ArrowLeft, Ban, CheckCheck, Copy, FileDown, MessageCircle, SquarePen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { EstadoPresupuestoBadge, VerificarBadge } from "@/components/estado-badge";
import { PanelComercial } from "@/components/comercial/panel-comercial";
import { PanelPlanCobro } from "@/components/cobro/panel-plan-cobro";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const GRUPO_LABEL: Record<GrupoContable, string> = {
  materiales: "Materiales",
  mano_obra: "Mano de obra",
  accesorios: "Accesorios",
};

const MODALIDAD_LABEL: Record<ModalidadPresupuesto, string> = {
  integrada: "Integrada",
  colocacion: "Colocación",
  materiales: "Solo materiales",
};

const fmtMoneda = (n: number) => n.toLocaleString("es-AR", { style: "currency", currency: "ARS" });
const fmtFecha = (ts: Timestamp) => (ts ? ts.toDate().toLocaleDateString("es-AR") : "—");

export function DetallePresupuesto({ id }: { id: string }) {
  const router = useRouter();
  const [presupuesto, setPresupuesto] = useState<Presupuesto | null | undefined>(undefined);
  const [dialogDuplicar, setDialogDuplicar] = useState(false);
  const [dialogAnular, setDialogAnular] = useState(false);
  const [generandoPdf, setGenerandoPdf] = useState(false);
  const [enviandoWhatsApp, setEnviandoWhatsApp] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  useEffect(() => {
    return onSnapshot(
      doc(db, "presupuestos", id),
      (snap) => setPresupuesto(snap.exists() ? (snap.data() as Presupuesto) : null),
      (error) => {
        if (error.code !== "permission-denied") console.error(error);
      },
    );
  }, [id]);

  if (presupuesto === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-2/3 rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }
  if (presupuesto === null) return <p className="text-muted-foreground">Presupuesto no encontrado.</p>;

  const incluidos = gruposIncluidos(presupuesto.modalidad);

  async function confirmar() {
    setConfirmando(true);
    const res = await confirmarPresupuesto(id);
    setConfirmando(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Presupuesto confirmado");
  }

  async function generarPdf() {
    setGenerandoPdf(true);
    try {
      const res = await fetch(`/api/pdf/presupuesto/${id}`, { method: "POST" });
      const datos = await res.json();
      if (!res.ok || !datos.ok) {
        toast.error(datos.error ?? "No se pudo generar el PDF");
        return;
      }
      window.open(datos.url, "_blank");
    } catch (err) {
      console.error(err);
      toast.error("No se pudo generar el PDF");
    } finally {
      setGenerandoPdf(false);
    }
  }

  const telefonoNormalizado = presupuesto.telefono.replace(/\D/g, "");
  const telefonoWhatsApp = telefonoNormalizado.startsWith("54")
    ? telefonoNormalizado
    : `54${telefonoNormalizado}`;
  const telefonoWhatsAppValido = telefonoValido(presupuesto.telefono);
  const presupuestoWhatsApp = presupuesto;

  async function enviarPorWhatsApp() {
    setEnviandoWhatsApp(true);
    try {
      const res = await fetch(`/api/pdf/presupuesto/${id}`, { method: "POST" });
      const datos = await res.json();
      if (!res.ok || !datos.ok) {
        toast.error(datos.error ?? "No se pudo generar el PDF");
        return;
      }
      const mensaje = `Hola, te compartimos el presupuesto ${presupuestoWhatsApp.obraCodigo} versión ${presupuestoWhatsApp.version}, por un total de ${fmtMoneda(presupuestoWhatsApp.total)}.\n\nPDF: ${datos.url}\n\nEl link vence en 15 minutos.`;
      window.open(
        `https://wa.me/${telefonoWhatsApp}?text=${encodeURIComponent(mensaje)}`,
        "_blank",
        "noopener,noreferrer",
      );
    } catch (err) {
      console.error(err);
      toast.error("No se pudo preparar el envío por WhatsApp");
    } finally {
      setEnviandoWhatsApp(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            href="/presupuestos"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            Presupuestos
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-2xl font-semibold tracking-tight text-cobre-oscuro">
              {presupuesto.obraCodigo}
              <span className="ml-2 text-base font-medium text-muted-foreground">
                v{presupuesto.version}
              </span>
            </h1>
            <EstadoPresupuestoBadge estado={presupuesto.estado} />
            {presupuesto.esLegado && <Badge variant="outline">Legado</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{presupuesto.clienteNombre}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-start gap-2">
          {!presupuesto.esLegado && (
            <Button variant="outline" onClick={generarPdf} disabled={generandoPdf}>
              <FileDown data-icon="inline-start" />
              {generandoPdf
                ? "Generando..."
                : presupuesto.pdfPath
                  ? "Descargar PDF"
                  : "Generar PDF"}
            </Button>
          )}
          {!presupuesto.esLegado && (
            <div className="flex flex-col items-start gap-1">
              <span title={telefonoWhatsAppValido ? undefined : "El teléfono debe tener entre 8 y 13 dígitos"}>
                <Button
                  variant="outline"
                  onClick={enviarPorWhatsApp}
                  disabled={!telefonoWhatsAppValido || enviandoWhatsApp}
                >
                  <MessageCircle data-icon="inline-start" />
                  {enviandoWhatsApp ? "Preparando..." : "Enviar por WhatsApp"}
                </Button>
              </span>
              <span className="text-xs text-muted-foreground">El link expira en 15 minutos.</span>
            </div>
          )}
          {!presupuesto.esLegado && puedeEditarse(presupuesto.estado) && (
            <Button variant="outline" asChild>
              <Link href={`/presupuestos/${id}/editar`}>
                <SquarePen data-icon="inline-start" />
                Editar
              </Link>
            </Button>
          )}
          {!presupuesto.esLegado && puedeConfirmarse(presupuesto.estado) && (
            <Button onClick={confirmar} disabled={confirmando}>
              <CheckCheck data-icon="inline-start" />
              {confirmando ? "Confirmando..." : "Confirmar"}
            </Button>
          )}
          {!presupuesto.esLegado && puedeAnularse(presupuesto.estado) && (
            <Button variant="destructive" onClick={() => setDialogAnular(true)}>
              <Ban data-icon="inline-start" />
              Anular
            </Button>
          )}
          {puedeDuplicarse(presupuesto.estado) && (
            <Button variant={puedeConfirmarse(presupuesto.estado) ? "outline" : "default"} onClick={() => setDialogDuplicar(true)}>
              <Copy data-icon="inline-start" />
              Duplicar
            </Button>
          )}
        </div>
      </div>

      {presupuesto.esLegado && (
        <Card>
          <CardContent className="py-4 text-sm text-muted-foreground">
            Presupuesto legado, importado del sistema anterior (solo lectura).
            {presupuesto.linkPdfLegado && (
              <>
                {" · "}
                <a
                  href={presupuesto.linkPdfLegado}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >
                  Ver PDF original
                </a>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Cliente y obra</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm md:grid-cols-3">
          <Campo label="Teléfono" valor={presupuesto.telefono} />
          <Campo label="Dirección de la obra" valor={presupuesto.direccionObra} />
          <Campo label="Tipo de obra" valor={presupuesto.tipoObra} />
          <Campo label="Vendedor" valor={presupuesto.vendedor} />
          <Campo
            label="Fecha de visita"
            valor={fmtFecha(presupuesto.fechaVisita as unknown as Timestamp)}
          />
          <Campo
            label="Fecha de emisión"
            valor={fmtFecha(presupuesto.fechaEmision as unknown as Timestamp)}
          />
          <Campo label="m² relevados" valor={String(presupuesto.m2Relevados)} />
          <Campo label="Subpiso" valor={presupuesto.subpiso} />
          <Campo label="Nivel de subpiso" valor={presupuesto.nivelSubpiso} />
          <Campo label="Modalidad" valor={MODALIDAD_LABEL[presupuesto.modalidad]} />
          {presupuesto.observacionesRiesgos && (
            <div className="col-span-2 md:col-span-3">
              <p className="text-muted-foreground">Observaciones / riesgos</p>
              <p>{presupuesto.observacionesRiesgos}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <PanelComercial
        obraCodigo={presupuesto.obraCodigo}
        versionPresupuesto={presupuesto.version}
        clienteNombre={presupuesto.clienteNombre}
        total={presupuesto.total}
        venceEl={presupuesto.venceEl as unknown as { toDate(): Date } | null}
      />

      {presupuesto.estado === "Confirmado" && (
        <PanelPlanCobro
          modo="presupuesto"
          obraCodigo={presupuesto.obraCodigo}
          presupuestoId={id}
          clienteNombre={presupuesto.clienteNombre}
          total={presupuesto.total}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Ítems</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ítem</TableHead>
                <TableHead>Grupo</TableHead>
                <TableHead>Cantidad</TableHead>
                <TableHead>Precio unitario</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...presupuesto.items]
                .sort((a, b) => a.orden - b.orden)
                .map((item, i) => {
                  const excluido = !incluidos.includes(item.grupoContable);
                  return (
                    <TableRow key={i} className={excluido ? "opacity-50" : undefined}>
                      <TableCell>
                        <div className="text-sm font-medium">{item.nombre}</div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                          {item.codigo && <span className="font-mono">{item.codigo}</span>}
                          {item.codigo && <span>·</span>}
                          <span>{item.unidad}</span>
                          {item.requiereVerificacion && <VerificarBadge />}
                          {excluido && <span className="italic">no suma al total</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{GRUPO_LABEL[item.grupoContable]}</Badge>
                      </TableCell>
                      <TableCell className="tnum">{item.cantidad}</TableCell>
                      <TableCell className="tnum">{fmtMoneda(item.precioUnitario)}</TableCell>
                      <TableCell className="tnum text-right font-medium">{fmtMoneda(item.subtotal)}</TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="overflow-hidden py-0">
        <div className="grid grid-cols-2 gap-4 px-4 py-4 text-sm md:grid-cols-2">
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Materiales + accesorios
            </p>
            <p
              className={`tnum mt-0.5 font-medium ${
                !incluidos.includes("materiales") && !incluidos.includes("accesorios")
                  ? "text-muted-foreground line-through decoration-piedra"
                  : ""
              }`}
            >
              {fmtMoneda(presupuesto.subtotalMateriales + presupuesto.subtotalAccesorios)}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Mano de obra
            </p>
            <p
              className={`tnum mt-0.5 font-medium ${
                !incluidos.includes("mano_obra")
                  ? "text-muted-foreground line-through decoration-piedra"
                  : ""
              }`}
            >
              {fmtMoneda(presupuesto.subtotalManoObra)}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between bg-grafito px-4 py-3">
          <p className="text-sm font-semibold tracking-wide text-hueso uppercase">
            Total de la propuesta
          </p>
          <p className="tnum font-mono text-xl font-bold text-cobre">
            {fmtMoneda(presupuesto.total)}
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Condiciones</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm">
          <Campo label="Forma de pago" valor={presupuesto.formaPago} />
          <Campo label="Validez" valor={presupuesto.validez} />
          <Campo label="Moneda" valor={presupuesto.moneda} />
          {presupuesto.exclusiones && (
            <div className="col-span-2">
              <p className="text-muted-foreground">Exclusiones / observaciones</p>
              <p>{presupuesto.exclusiones}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <DuplicarDialog
        open={dialogDuplicar}
        onOpenChange={setDialogDuplicar}
        onElegir={(destino) => {
          const params = new URLSearchParams({ duplicarDe: id, destino });
          router.push(`/presupuestos/nuevo?${params.toString()}`);
        }}
      />

      <AnularDialog open={dialogAnular} onOpenChange={setDialogAnular} presupuestoId={id} />
    </div>
  );
}

function Campo({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="mt-0.5">{valor || "—"}</p>
    </div>
  );
}

function AnularDialog({
  open,
  onOpenChange,
  presupuestoId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  presupuestoId: string;
}) {
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [anulando, setAnulando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAnulando(true);
    setError(null);
    const res = await anularConfirmacion(presupuestoId, motivo);
    setAnulando(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    toast.success("Confirmación anulada");
    setMotivo("");
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          setMotivo("");
          setError(null);
        }
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Anular confirmación</DialogTitle>
          <DialogDescription>
            El motivo es obligatorio. El presupuesto pasa a Anulado y se revierte el saldo.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="motivo-anular">Motivo *</Label>
            <Textarea
              id="motivo-anular"
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
            <Button type="submit" variant="destructive" disabled={anulando}>
              {anulando ? "Anulando..." : "Anular"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DuplicarDialog({
  open,
  onOpenChange,
  onElegir,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onElegir: (destino: "nuevaVersion" | "obraNueva") => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Duplicar presupuesto</DialogTitle>
          <DialogDescription>Elegí el destino. El original no se modifica.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start"
            onClick={() => onElegir("nuevaVersion")}
          >
            Nueva versión de esta obra
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start"
            onClick={() => onElegir("obraNueva")}
          >
            Obra nueva
          </Button>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
