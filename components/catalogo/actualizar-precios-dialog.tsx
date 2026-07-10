"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { actualizarPreciosEnMasa } from "@/lib/acciones/catalogo";
import type { ItemCatalogo, Moneda } from "@/lib/tipos";
import { Button } from "@/components/ui/button";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface ItemConId extends ItemCatalogo {
  id: string;
}

const redondear = (valor: number) => Math.round((valor + Number.EPSILON) * 100) / 100;

export function ActualizarPreciosDialog({
  open,
  onOpenChange,
  items,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: ItemConId[];
}) {
  const [rubro, setRubro] = useState("");
  const [proveedor, setProveedor] = useState("");
  const [moneda, setMoneda] = useState<Moneda | "">("");
  const [porcentajeTexto, setPorcentajeTexto] = useState("");
  const [preview, setPreview] = useState(false);
  const [aplicando, setAplicando] = useState(false);

  const rubros = useMemo(
    () => Array.from(new Set(items.map((item) => item.rubro))).sort(),
    [items],
  );
  const proveedores = useMemo(
    () => Array.from(new Set(items.map((item) => item.proveedor).filter(Boolean))).sort(),
    [items],
  );
  const porcentaje = Number(porcentajeTexto.replace(",", "."));
  const porcentajeValido =
    porcentajeTexto.trim() !== "" && Number.isFinite(porcentaje) && porcentaje >= -100 && porcentaje !== 0;
  const afectados = useMemo(
    () =>
      items.filter(
        (item) =>
          (!rubro || item.rubro === rubro) &&
          (!proveedor || item.proveedor === proveedor) &&
          (!moneda || item.moneda === moneda),
      ),
    [items, rubro, proveedor, moneda],
  );

  function cerrar(openValue: boolean) {
    onOpenChange(openValue);
    if (!openValue) {
      setPreview(false);
      setPorcentajeTexto("");
    }
  }

  async function aplicar() {
    setAplicando(true);
    const res = await actualizarPreciosEnMasa({ rubro, proveedor, moneda }, porcentaje);
    setAplicando(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`${res.cantidad} ítem${res.cantidad === 1 ? "" : "s"} actualizado${res.cantidad === 1 ? "" : "s"}`);
    cerrar(false);
  }

  return (
    <Dialog open={open} onOpenChange={cerrar}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Actualizar precios en masa</DialogTitle>
          <DialogDescription>
            Elegí el alcance y revisá la vista previa antes de aplicar. Los presupuestos existentes no se modifican.
          </DialogDescription>
        </DialogHeader>

        {!preview ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="masivo-rubro">Rubro</Label>
              <NativeSelect id="masivo-rubro" value={rubro} onChange={(e) => setRubro(e.target.value)}>
                <option value="">Todos los rubros</option>
                {rubros.map((valor) => <option key={valor}>{valor}</option>)}
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="masivo-proveedor">Proveedor</Label>
              <NativeSelect id="masivo-proveedor" value={proveedor} onChange={(e) => setProveedor(e.target.value)}>
                <option value="">Todos los proveedores</option>
                {proveedores.map((valor) => <option key={valor}>{valor}</option>)}
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="masivo-moneda">Moneda</Label>
              <NativeSelect id="masivo-moneda" value={moneda} onChange={(e) => setMoneda(e.target.value as Moneda | "")}>
                <option value="">Todas las monedas</option>
                <option value="Pesos">Pesos</option>
                <option value="Dolar">Dólar</option>
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="masivo-porcentaje">Porcentaje</Label>
              <Input
                id="masivo-porcentaje"
                inputMode="decimal"
                placeholder="Ej. 12,5 o -5"
                value={porcentajeTexto}
                onChange={(e) => setPorcentajeTexto(e.target.value)}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm font-medium">{afectados.length} ítem{afectados.length === 1 ? "" : "s"} afectado{afectados.length === 1 ? "" : "s"}</p>
            <div className="max-h-96 overflow-auto rounded-lg border">
              <Table>
                <TableHeader><TableRow><TableHead>Ítem</TableHead><TableHead className="text-right">Precio actual</TableHead><TableHead className="text-right">Precio nuevo</TableHead></TableRow></TableHeader>
                <TableBody>
                  {afectados.map((item) => {
                    const prefijo = item.moneda === "Dolar" ? "US$" : "$";
                    return <TableRow key={item.id}><TableCell><p className="font-medium">{item.nombre}</p><p className="font-mono text-xs text-muted-foreground">{item.codigo}</p></TableCell><TableCell className="tnum text-right">{prefijo} {item.precioFinalIva.toLocaleString("es-AR")}</TableCell><TableCell className="tnum text-right font-medium">{prefijo} {redondear(item.precioFinalIva * (1 + porcentaje / 100)).toLocaleString("es-AR")}</TableCell></TableRow>;
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <DialogFooter>
          {preview ? <Button variant="outline" onClick={() => setPreview(false)} disabled={aplicando}>Volver</Button> : <Button variant="outline" onClick={() => cerrar(false)}>Cancelar</Button>}
          {preview ? (
            <Button onClick={aplicar} disabled={aplicando || afectados.length === 0}>{aplicando ? "Aplicando..." : "Aplicar"}</Button>
          ) : (
            <Button onClick={() => setPreview(true)} disabled={!porcentajeValido || afectados.length === 0}>Ver vista previa ({afectados.length})</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
