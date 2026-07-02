import type { ItemPresupuesto, ModalidadPresupuesto } from "@/lib/tipos";

const GRUPOS_INCLUIDOS: Record<ModalidadPresupuesto, Array<ItemPresupuesto["grupoContable"]>> = {
  integrada: ["materiales", "mano_obra", "accesorios"],
  colocacion: ["mano_obra", "accesorios"],
  materiales: ["materiales", "accesorios"],
};

export interface Totales {
  subtotalMateriales: number;
  subtotalManoObra: number;
  subtotalAccesorios: number;
  total: number;
}

/** R3 - Grupos contables que suman al total bajo una modalidad dada. */
export function gruposIncluidos(
  modalidad: ModalidadPresupuesto
): Array<ItemPresupuesto["grupoContable"]> {
  return GRUPOS_INCLUIDOS[modalidad];
}

/**
 * R3 - Subtotales por grupo sobre TODOS los items (incluidos los excluidos
 * por la modalidad), y total sumando solo los subtotales de los grupos que
 * la modalidad incluye.
 */
export function calcularTotales(
  items: Pick<ItemPresupuesto, "grupoContable" | "subtotal">[],
  modalidad: ModalidadPresupuesto
): Totales {
  const subtotalMateriales = sumarGrupo(items, "materiales");
  const subtotalManoObra = sumarGrupo(items, "mano_obra");
  const subtotalAccesorios = sumarGrupo(items, "accesorios");

  const incluidos = GRUPOS_INCLUIDOS[modalidad];
  const subtotalesPorGrupo: Record<ItemPresupuesto["grupoContable"], number> = {
    materiales: subtotalMateriales,
    mano_obra: subtotalManoObra,
    accesorios: subtotalAccesorios,
  };
  const total = incluidos.reduce((acc, grupo) => acc + subtotalesPorGrupo[grupo], 0);

  return { subtotalMateriales, subtotalManoObra, subtotalAccesorios, total };
}

function sumarGrupo(
  items: Pick<ItemPresupuesto, "grupoContable" | "subtotal">[],
  grupo: ItemPresupuesto["grupoContable"]
): number {
  return items.filter((i) => i.grupoContable === grupo).reduce((acc, i) => acc + i.subtotal, 0);
}
