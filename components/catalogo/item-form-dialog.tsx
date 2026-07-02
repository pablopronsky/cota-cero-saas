"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  crearItemCatalogo,
  actualizarItemCatalogo,
  type DatosItemCatalogo,
} from "@/lib/acciones/catalogo";
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

const VACIO: DatosItemCatalogo = {
  codigo: "",
  rubro: "",
  nombre: "",
  unidad: "",
  especificacion: "",
  precioLista: 0,
  precioFinalIva: 0,
  moneda: "Pesos",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Si viene, el diálogo edita ese ítem (doc ID de Firestore) en vez de crear uno nuevo. */
  id?: string;
  datosIniciales?: DatosItemCatalogo;
  onGuardado?: () => void;
}

export function ItemFormDialog({ open, onOpenChange, id, datosIniciales, onGuardado }: Props) {
  const [datos, setDatos] = useState<DatosItemCatalogo>(datosIniciales ?? VACIO);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  function campoTexto(nombre: "codigo" | "rubro" | "nombre" | "unidad" | "especificacion") {
    return {
      value: datos[nombre] ?? "",
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setDatos((d) => ({ ...d, [nombre]: e.target.value })),
    };
  }

  function campoNumero(nombre: "precioLista" | "precioFinalIva") {
    return {
      value: datos[nombre],
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setDatos((d) => ({ ...d, [nombre]: Number(e.target.value) })),
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setGuardando(true);

    if (id) {
      const res = await actualizarItemCatalogo(id, datos);
      setGuardando(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success("Ítem actualizado");
    } else {
      const res = await crearItemCatalogo(datos);
      setGuardando(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success(`Ítem creado: ${res.id}`);
    }

    onOpenChange(false);
    onGuardado?.();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{id ? "Editar ítem" : "Nuevo ítem"}</DialogTitle>
          <DialogDescription>
            El grupo contable y los m²/caja se recalculan automáticamente al guardar.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="codigo">Código *</Label>
              <Input id="codigo" required {...campoTexto("codigo")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rubro">Rubro *</Label>
              <Input id="rubro" required {...campoTexto("rubro")} />
            </div>
            <div className="col-span-2 space-y-2">
              <Label htmlFor="nombre">Nombre *</Label>
              <Input id="nombre" required {...campoTexto("nombre")} />
            </div>
            <div className="col-span-2 space-y-2">
              <Label htmlFor="especificacion">Especificación</Label>
              <Input id="especificacion" {...campoTexto("especificacion")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="unidad">Unidad *</Label>
              <Input id="unidad" required {...campoTexto("unidad")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="moneda">Moneda</Label>
              <select
                id="moneda"
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                value={datos.moneda}
                onChange={(e) =>
                  setDatos((d) => ({ ...d, moneda: e.target.value as "Pesos" | "Dolar" }))
                }
              >
                <option value="Pesos">Pesos</option>
                <option value="Dolar">Dólar</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="precioLista">Precio de lista *</Label>
              <Input id="precioLista" type="number" step="0.01" min="0" required {...campoNumero("precioLista")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="precioFinalIva">Precio final c/IVA *</Label>
              <Input
                id="precioFinalIva"
                type="number"
                step="0.01"
                min="0"
                required
                {...campoNumero("precioFinalIva")}
              />
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
