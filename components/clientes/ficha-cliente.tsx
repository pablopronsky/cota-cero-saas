"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { doc, onSnapshot } from "firebase/firestore";
import { ArrowLeft, SquarePen } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/firebase/client";
import { cambiarEstadoCliente } from "@/lib/acciones/clientes";
import type { Cliente } from "@/lib/tipos";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EstadoClienteBadge } from "@/components/estado-badge";
import { ClienteFormDialog } from "@/components/clientes/cliente-form-dialog";
import { HistorialPresupuestosCliente } from "@/components/presupuestos/historial-cliente";
import { CuentaCorrienteCliente } from "@/components/cuenta-corriente/cuenta-corriente-cliente";

function Dato({ label, valor }: { label: string; valor: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="mt-0.5 text-sm">{valor || "—"}</p>
    </div>
  );
}

export function FichaCliente({ codigo }: { codigo: string }) {
  const [cliente, setCliente] = useState<Cliente | null | undefined>(undefined);
  const [dialogEditar, setDialogEditar] = useState(false);
  const [cambiandoEstado, setCambiandoEstado] = useState(false);

  useEffect(() => {
    return onSnapshot(
      doc(db, "clientes", codigo),
      (snap) => {
        setCliente(snap.exists() ? (snap.data() as Cliente) : null);
      },
      (error) => {
        // permission-denied esperado cuando el listener sigue activo al cerrar sesión.
        if (error.code !== "permission-denied") console.error(error);
      },
    );
  }, [codigo]);

  if (cliente === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-1/2 rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }
  if (cliente === null) {
    return <p className="text-muted-foreground">Cliente no encontrado.</p>;
  }

  async function toggleEstado() {
    if (!cliente) return;
    setCambiandoEstado(true);
    const nuevo = cliente.estado === "Activo" ? "Inactivo" : "Activo";
    const res = await cambiarEstadoCliente(codigo, nuevo);
    setCambiandoEstado(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`Cliente ${nuevo.toLowerCase()}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            href="/clientes"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            Clientes
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{cliente.nombre}</h1>
            <EstadoClienteBadge estado={cliente.estado} />
          </div>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{codigo}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" onClick={toggleEstado} disabled={cambiandoEstado}>
            Marcar {cliente.estado === "Activo" ? "Inactivo" : "Activo"}
          </Button>
          <Button onClick={() => setDialogEditar(true)}>
            <SquarePen data-icon="inline-start" />
            Editar
          </Button>
        </div>
      </div>

      <Card size="sm">
        <CardContent className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-3 lg:grid-cols-4">
          <Dato label="Teléfono" valor={cliente.telefono} />
          <Dato label="Email" valor={cliente.email} />
          <Dato
            label="Dirección"
            valor={
              cliente.direccion
                ? `${cliente.direccion}${cliente.localidad ? `, ${cliente.localidad}` : ""}`
                : cliente.localidad
            }
          />
          <Dato label="Tipo" valor={cliente.tipo} />
          <Dato label="CUIT / DNI" valor={cliente.cuitDni} />
          <Dato label="Condición IVA" valor={cliente.condicionIva} />
          <Dato label="Origen" valor={cliente.origen} />
          <Dato
            label="Saldo"
            valor={
              <span
                className={`tnum font-semibold ${
                  cliente.saldo > 0
                    ? "text-destructive"
                    : cliente.saldo < 0
                      ? "text-exito"
                      : ""
                }`}
              >
                {cliente.saldo.toLocaleString("es-AR", { style: "currency", currency: "ARS" })}
              </span>
            }
          />
          {cliente.notas && (
            <div className="col-span-2 md:col-span-3 lg:col-span-4">
              <Dato label="Notas" valor={cliente.notas} />
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Presupuestos</CardTitle>
          </CardHeader>
          <CardContent>
            <HistorialPresupuestosCliente clienteId={codigo} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Cuenta corriente</CardTitle>
          </CardHeader>
          <CardContent>
            <CuentaCorrienteCliente clienteId={codigo} />
          </CardContent>
        </Card>
      </div>

      <ClienteFormDialog
        key={dialogEditar ? "abierto" : "cerrado"}
        open={dialogEditar}
        onOpenChange={setDialogEditar}
        codigo={codigo}
        datosIniciales={{
          nombre: cliente.nombre,
          telefono: cliente.telefono,
          email: cliente.email,
          direccion: cliente.direccion,
          localidad: cliente.localidad,
          tipo: cliente.tipo,
          cuitDni: cliente.cuitDni,
          condicionIva: cliente.condicionIva,
          origen: cliente.origen,
          notas: cliente.notas,
        }}
      />
    </div>
  );
}
