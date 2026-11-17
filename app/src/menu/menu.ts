/**
 * Menú semanal: qué platos se comen, cuántas veces a la semana y para cuántas personas. Con
 * él se calcula cuánto se gasta de cada ingrediente. Funciones puras.
 */
import { SEMANAS, textoCantidad, textoNecesidad, type Necesidad } from '../necesidades/modelo.ts';
import { convertir, type Receta } from './recetas.ts';

export type PlatoMenu = {
  receta: string;
  /** Veces a la semana. */
  veces: number;
  /** Personas que lo comen cada vez (raciones). */
  personas: number;
};

export const MAX_VECES = 21;
export const MAX_PERSONAS = 12;

const redondear = (n: number) => Math.round(n * 1e6) / 1e6;
const entero = (v: unknown, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= max;

/** Lee el menú guardado en los ajustes; descarta lo que no sea válido o esté repetido. */
export function leerMenu(valor: unknown): PlatoMenu[] {
  if (!Array.isArray(valor)) return [];
  const vistas = new Set<string>();
  const menu: PlatoMenu[] = [];
  for (const p of valor) {
    if (typeof p !== 'object' || p === null) continue;
    const { receta, veces, personas } = p as Record<string, unknown>;
    if (typeof receta !== 'string' || vistas.has(receta)) continue;
    if (!entero(veces, MAX_VECES) || !entero(personas, MAX_PERSONAS)) continue;
    vistas.add(receta);
    menu.push({ receta, veces, personas });
  }
  return menu;
}

export type AportePlato = { receta: Receta; veces: number; personas: number; semanal: number };

/** Lo que se gasta de una necesidad a la semana por el menú, en la unidad de la necesidad. */
export type AporteMenu = { semanal: number; platos: AportePlato[] };

/** Cuánto se gasta a la semana de cada necesidad por los platos del menú. */
export function aportesDelMenu(
  menu: readonly PlatoMenu[],
  recetas: readonly Receta[],
  necesidades: readonly Necesidad[],
): Map<string, AporteMenu> {
  const unidades = new Map(necesidades.map((n) => [n.id, n.unidad]));
  const aportes = new Map<string, AporteMenu>();
  for (const plato of menu) {
    const receta = recetas.find((r) => r.id === plato.receta);
    if (!receta) continue;
    for (const ing of receta.ingredientes) {
      const unidad = unidades.get(ing.necesidad);
      if (!unidad) continue;
      const porRacion = convertir(ing.cantidad, ing.unidad, unidad) / receta.raciones;
      const semanal = redondear(porRacion * plato.veces * plato.personas);
      const aporte = aportes.get(ing.necesidad) ?? { semanal: 0, platos: [] };
      aporte.semanal = redondear(aporte.semanal + semanal);
      aporte.platos.push({ receta, veces: plato.veces, personas: plato.personas, semanal });
      aportes.set(ing.necesidad, aporte);
    }
  }
  return aportes;
}

/**
 * Necesidades tal como se compran con el menú: a cada una se le suma lo que gastan los platos
 * (en su misma frecuencia), y las que son solo para recetas pasan a ser lo que pide el menú
 * a la semana. Las que son solo para recetas y no están en el menú no se compran.
 */
export function necesidadesConMenu(
  necesidades: readonly Necesidad[],
  aportes: ReadonlyMap<string, AporteMenu>,
): Necesidad[] {
  const resultado: Necesidad[] = [];
  for (const n of necesidades) {
    const aporte = aportes.get(n.id);
    if (!aporte || aporte.semanal <= 0) {
      if (!n.soloRecetas) resultado.push(n);
      continue;
    }
    if (n.soloRecetas) {
      const delMenu: Necesidad = { ...n, cantidad: aporte.semanal, frecuencia: 'semana' };
      delete delMenu.soloRecetas;
      resultado.push(delMenu);
    } else {
      resultado.push({
        ...n,
        cantidad: redondear(n.cantidad + aporte.semanal * SEMANAS[n.frecuencia]),
      });
    }
  }
  return resultado;
}

const redondearTexto = (n: number) => Math.round(n * 10) / 10;

/**
 * Cuánto se gasta, contando el menú: «6 litros a la semana», «De tu menú: 320 g a la semana»,
 * «6 litros a la semana + 400 ml de tu menú» o «Solo para tus recetas (no está en tu menú)».
 */
export function textoConMenu(n: Necesidad, aporte: AporteMenu | undefined): string {
  if (!aporte || aporte.semanal <= 0) {
    return n.soloRecetas ? 'Solo para tus recetas (no está en tu menú)' : textoNecesidad(n);
  }
  const delMenu = textoCantidad(redondearTexto(aporte.semanal), n.unidad);
  return n.soloRecetas
    ? `De tu menú: ${delMenu} a la semana`
    : `${textoNecesidad(n)} + ${delMenu} a la semana de tu menú`;
}
