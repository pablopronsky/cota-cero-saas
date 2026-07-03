"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { toast } from "sonner";
import { db } from "@/lib/firebase/client";
import { actualizarConfigGeneral, type DatosConfigGeneral } from "@/lib/acciones/catalogo";
import type { ConfigGeneral } from "@/lib/tipos";
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

const VACIO: DatosConfigGeneral = {
  tcUsd: 0,
  validezDefault: "",
  membrete: { nombre: "", direccion: "", telefono: "", logoUrl: "" },
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ConfiguracionDialog({ open, onOpenChange }: Props) {
  const [datos, setDatos] = useState<DatosConfigGeneral>(VACIO);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!open) return;
    return onSnapshot(doc(db, "config", "general"), (snap) => {
      if (snap.exists()) {
        const config = snap.data() as ConfigGeneral;
        setDatos({
          tcUsd: config.tcUsd,
          validezDefault: config.validezDefault,
          membrete: config.membrete,
        });
      }
    });
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setGuardando(true);
    const res = await actualizarConfigGeneral(datos);
    setGuardando(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    toast.success("Configuración actualizada");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Configuración general</DialogTitle>
          <DialogDescription>
            El tipo de cambio se usa para convertir ítems en dólares al emitir presupuestos.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="tcUsd">Tipo de cambio USD *</Label>
              <Input
                id="tcUsd"
                type="number"
                step="0.01"
                min="0"
                required
                value={datos.tcUsd}
                onChange={(e) => setDatos((d) => ({ ...d, tcUsd: Number(e.target.value) }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="validezDefault">Validez por defecto</Label>
              <Input
                id="validezDefault"
                value={datos.validezDefault}
                onChange={(e) => setDatos((d) => ({ ...d, validezDefault: e.target.value }))}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="membreteNombre">Membrete — Nombre</Label>
              <Input
                id="membreteNombre"
                value={datos.membrete.nombre}
                onChange={(e) =>
                  setDatos((d) => ({ ...d, membrete: { ...d.membrete, nombre: e.target.value } }))
                }
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="membreteDireccion">Membrete — Dirección</Label>
              <Input
                id="membreteDireccion"
                value={datos.membrete.direccion}
                onChange={(e) =>
                  setDatos((d) => ({
                    ...d,
                    membrete: { ...d.membrete, direccion: e.target.value },
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="membreteTelefono">Membrete — Teléfono</Label>
              <Input
                id="membreteTelefono"
                value={datos.membrete.telefono}
                onChange={(e) =>
                  setDatos((d) => ({
                    ...d,
                    membrete: { ...d.membrete, telefono: e.target.value },
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="membreteLogoUrl">Membrete — Logo (URL)</Label>
              <Input
                id="membreteLogoUrl"
                value={datos.membrete.logoUrl}
                onChange={(e) =>
                  setDatos((d) => ({ ...d, membrete: { ...d.membrete, logoUrl: e.target.value } }))
                }
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
