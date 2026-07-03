"use client";

import { useState } from "react";
import { toast } from "sonner";
import { crearCliente, actualizarCliente, type DatosCliente } from "@/lib/acciones/clientes";
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

const VACIO: DatosCliente = {
  nombre: "",
  telefono: "",
  email: "",
  direccion: "",
  localidad: "",
  tipo: "",
  cuitDni: "",
  condicionIva: "",
  origen: "",
  notas: "",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Si viene, el diálogo edita ese cliente en vez de crear uno nuevo. */
  codigo?: string;
  datosIniciales?: DatosCliente;
  onGuardado?: () => void;
}

export function ClienteFormDialog({
  open,
  onOpenChange,
  codigo,
  datosIniciales,
  onGuardado,
}: Props) {
  const [datos, setDatos] = useState<DatosCliente>(datosIniciales ?? VACIO);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  function campo(nombre: keyof DatosCliente) {
    return {
      value: datos[nombre] ?? "",
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setDatos((d) => ({ ...d, [nombre]: e.target.value })),
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setGuardando(true);

    if (codigo) {
      const res = await actualizarCliente(codigo, datos);
      setGuardando(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success("Cliente actualizado");
    } else {
      const res = await crearCliente(datos);
      setGuardando(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success(`Cliente creado: ${res.codigo}`);
    }

    onOpenChange(false);
    onGuardado?.();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{codigo ? "Editar cliente" : "Nuevo cliente"}</DialogTitle>
          <DialogDescription>
            {codigo ? `Código ${codigo}` : "Se asigna un código correlativo al guardar."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2 space-y-2">
              <Label htmlFor="nombre">Nombre *</Label>
              <Input id="nombre" required {...campo("nombre")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="telefono">Teléfono *</Label>
              <Input id="telefono" required {...campo("telefono")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" {...campo("email")} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="direccion">Dirección</Label>
              <Input id="direccion" {...campo("direccion")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="localidad">Localidad</Label>
              <Input id="localidad" {...campo("localidad")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tipo">Tipo</Label>
              <Input id="tipo" placeholder="Particular / Empresa" {...campo("tipo")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cuitDni">CUIT / DNI</Label>
              <Input id="cuitDni" {...campo("cuitDni")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="condicionIva">Condición IVA</Label>
              <Input id="condicionIva" {...campo("condicionIva")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="origen">Origen</Label>
              <Input id="origen" {...campo("origen")} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="notas">Notas</Label>
              <Input id="notas" {...campo("notas")} />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardando}>
              {guardando ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
