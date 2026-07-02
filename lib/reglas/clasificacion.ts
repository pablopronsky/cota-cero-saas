import { normalizar } from "./normalizar";
import type { GrupoContable } from "@/lib/tipos";

const KEYWORDS_MANO_OBRA = ["servicio", "coloc", "restaur", "lijado"];

const KEYWORDS_ACCESORIOS = [
  "adhesivo",
  "accesorio",
  "insumo",
  "manta",
  "varilla",
  "lija",
  "hidrolaca",
  "laca",
  "terminacion",
  "fenolico",
  "zocalo",
  "clip",
  "tornillo",
  "perfil",
  "angulo",
  "cuarta",
  "cubre",
];

interface ItemParaClasificar {
  rubro: string;
  esManual?: boolean;
  grupoContableExplicito?: boolean;
  grupoContable?: GrupoContable;
}

/**
 * R2 - Clasificacion rubro -> grupo contable. El orden de evaluacion importa:
 * flete -> mano de obra -> accesorios -> materiales (ej.: "lijado" cae en
 * mano_obra aunque contiene "lija", keyword de accesorios).
 */
export function clasificarGrupoContable(item: ItemParaClasificar): GrupoContable {
  if (item.esManual && item.grupoContableExplicito && item.grupoContable) {
    return item.grupoContable;
  }

  const rubro = normalizar(item.rubro);

  if (rubro.includes("flete")) return "accesorios";
  if (KEYWORDS_MANO_OBRA.some((k) => rubro.includes(k))) return "mano_obra";
  if (KEYWORDS_ACCESORIOS.some((k) => rubro.includes(k))) return "accesorios";
  return "materiales";
}
