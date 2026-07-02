"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { doc, onSnapshot, type Timestamp } from "firebase/firestore";
import { toast } from "sonner";
import { db } from "@/lib/firebase/client";
import { puedeEditarse, puedeDuplicarse, puedeConfirmarse, puedeAnularse } from "@/lib/reglas/validaciones";
import { gruposIncluidos } from "@/lib/reglas/totales";
import { confirmarPresupuesto, anularConfirmacion } from "@/lib/acciones/cuentaCorriente";
import type { EstadoPresupuesto, GrupoContable, ModalidadPresupuesto, Presupuesto } from "@/lib/tipos";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

const ESTADO_VARIANT: Record<
  EstadoPresupuesto,
  "default" | "secondary" | "destructive" | "outline"
> = {
  Emitido: "default",
  Confirmado: "secondary",
  Anulado: "destructive",
  Superado: "outline",
};

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

  if (presupuesto === undefined) return <p className="text-muted-foreground">Cargando...</p>;
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/presupuestos" className="text-sm text-muted-foreground hover:underline">
            ← Presupuestos
          </Link>
          <h1 className="text-xl font-semibold">
            {presupuesto.obraCodigo} · v{presupuesto.version}
          </h1>
          <p className="text-sm text-muted-foreground">{presupuesto.clienteNombre}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={ESTADO_VARIANT[presupuesto.estado]}>{presupuesto.estado}</Badge>
          {presupuesto.esLegado && <Badge variant="outline">Legado</Badge>}
          {!presupuesto.esLegado && (
            <Button variant="outline" onClick={generarPdf} disabled={generandoPdf}>
              {generandoPdf
                ? "Generando..."
                : presupuesto.pdfPath
                  ? "Descargar PDF"
                  : "Generar PDF"}
            </Button>
          )}
          {!presupuesto.esLegado && puedeEditarse(presupuesto.estado) && (
            <Button variant="outline" asChild>
              <Link href={`/presupuestos/${id}/editar`}>Editar</Link>
            </Button>
          )}
          {!presupuesto.esLegado && puedeConfirmarse(presupuesto.estado) && (
            <Button onClick={confirmar} disabled={confirmando}>
              {confirmando ? "Confirmando..." : "Confirmar"}
            </Button>
          )}
          {!presupuesto.esLegado && puedeAnularse(presupuesto.estado) && (
            <Button variant="destructive" onClick={() => setDialogAnular(true)}>
              Anular
            </Button>
          )}
          {puedeDuplicarse(presupuesto.estado) && (
            <Button onClick={() => setDialogDuplicar(true)}>Duplicar</Button>
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
                        <div className="text-sm">{item.nombre}</div>
                        <div className="text-xs text-muted-foreground">
                          {item.codigo && `${item.codigo} · `}
                          {item.unidad}
                          {item.requiereVerificacion && (
                            <Badge variant="destructive" className="ml-1">
                              Verificar
                            </Badge>
                          )}
                          {excluido && <span className="ml-1 italic">no suma al total</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{GRUPO_LABEL[item.grupoContable]}</Badge>
                      </TableCell>
                      <TableCell>{item.cantidad}</TableCell>
                      <TableCell>{fmtMoneda(item.precioUnitario)}</TableCell>
                      <TableCell className="text-right">{fmtMoneda(item.subtotal)}</TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Totales</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-3">
            <div>
              <p className="text-muted-foreground">Materiales + accesorios</p>
              <p
                className={
                  !incluidos.includes("materiales") && !incluidos.includes("accesorios")
                    ? "text-muted-foreground"
                    : ""
                }
              >
                {fmtMoneda(presupuesto.subtotalMateriales + presupuesto.subtotalAccesorios)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Mano de obra</p>
              <p className={!incluidos.includes("mano_obra") ? "text-muted-foreground" : ""}>
                {fmtMoneda(presupuesto.subtotalManoObra)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Total</p>
              <p className="text-lg font-semibold">{fmtMoneda(presupuesto.total)}</p>
            </div>
          </div>
        </CardContent>
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
      <p className="text-muted-foreground">{label}</p>
      <p>{valor || "—"}</p>
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
            <textarea
              id="motivo-anular"
              className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
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
