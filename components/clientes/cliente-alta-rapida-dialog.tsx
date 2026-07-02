"use client";

import { useState } from "react";
import { toast } from "sonner";
import { crearCliente } from "@/lib/acciones/clientes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface ClienteCreado {
  codigo: string;
  nombre: string;
  telefono: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Usado por el form de presupuesto (Fase 5) para preseleccionar el cliente recién creado. */
  onCreado?: (cliente: ClienteCreado) => void;
}

/**
 * Alta mínima reutilizable: solo nombre + teléfono. Pensada para el flujo
 * "cliente nuevo en el momento" desde el listado y, en Fase 5, desde el
 * formulario de presupuesto.
 */
export function ClienteAltaRapidaDialog({ open, onOpenChange, onCreado }: Props) {
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  function reset() {
    setNombre("");
    setTelefono("");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setGuardando(true);
    try {
      const res = await crearCliente({ nombre, telefono });
      toast.success(`Cliente creado: ${res.codigo}`);
      onCreado?.({ codigo: res.codigo, nombre, telefono });
      onOpenChange(false);
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el cliente");
    } finally {
      setGuardando(false);
    }
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
          <DialogTitle>Alta rápida de cliente</DialogTitle>
          <DialogDescription>Solo nombre y teléfono. Completás el resto después.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nombre-rapido">Nombre *</Label>
            <Input
              id="nombre-rapido"
              required
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="telefono-rapido">Teléfono *</Label>
            <Input
              id="telefono-rapido"
              required
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardando}>
              {guardando ? "Creando..." : "Crear"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
