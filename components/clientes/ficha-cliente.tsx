"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { doc, onSnapshot } from "firebase/firestore";
import { toast } from "sonner";
import { db } from "@/lib/firebase/client";
import { cambiarEstadoCliente } from "@/lib/acciones/clientes";
import type { Cliente } from "@/lib/tipos";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClienteFormDialog } from "@/components/clientes/cliente-form-dialog";

export function FichaCliente({ codigo }: { codigo: string }) {
  const [cliente, setCliente] = useState<Cliente | null | undefined>(undefined);
  const [dialogEditar, setDialogEditar] = useState(false);
  const [cambiandoEstado, setCambiandoEstado] = useState(false);

  useEffect(() => {
    return onSnapshot(doc(db, "clientes", codigo), (snap) => {
      setCliente(snap.exists() ? (snap.data() as Cliente) : null);
    });
  }, [codigo]);

  if (cliente === undefined) {
    return <p className="text-muted-foreground">Cargando...</p>;
  }
  if (cliente === null) {
    return <p className="text-muted-foreground">Cliente no encontrado.</p>;
  }

  async function toggleEstado() {
    if (!cliente) return;
    setCambiandoEstado(true);
    try {
      const nuevo = cliente.estado === "Activo" ? "Inactivo" : "Activo";
      await cambiarEstadoCliente(codigo, nuevo);
      toast.success(`Cliente ${nuevo.toLowerCase()}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo cambiar el estado");
    } finally {
      setCambiandoEstado(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/clientes" className="text-sm text-muted-foreground hover:underline">
            ← Clientes
          </Link>
          <h1 className="text-xl font-semibold">{cliente.nombre}</h1>
          <p className="font-mono text-xs text-muted-foreground">{codigo}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={cliente.estado === "Activo" ? "default" : "secondary"}>
            {cliente.estado}
          </Badge>
          <Button variant="outline" onClick={toggleEstado} disabled={cambiandoEstado}>
            Marcar {cliente.estado === "Activo" ? "Inactivo" : "Activo"}
          </Button>
          <Button onClick={() => setDialogEditar(true)}>Editar</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Teléfono</CardTitle>
          </CardHeader>
          <CardContent>{cliente.telefono}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Email</CardTitle>
          </CardHeader>
          <CardContent>{cliente.email || "—"}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Dirección</CardTitle>
          </CardHeader>
          <CardContent>
            {cliente.direccion || "—"}
            {cliente.localidad ? `, ${cliente.localidad}` : ""}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Tipo</CardTitle>
          </CardHeader>
          <CardContent>{cliente.tipo || "—"}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">CUIT / DNI</CardTitle>
          </CardHeader>
          <CardContent>{cliente.cuitDni || "—"}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Condición IVA</CardTitle>
          </CardHeader>
          <CardContent>{cliente.condicionIva || "—"}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Saldo</CardTitle>
          </CardHeader>
          <CardContent className="text-lg font-semibold">
            {cliente.saldo.toLocaleString("es-AR", { style: "currency", currency: "ARS" })}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Presupuestos</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Próximamente (Fase 6).
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Cuenta corriente</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Próximamente (Fase 8).
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
