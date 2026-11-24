/**
 * El Menú (recetas, menú por días y lector del PDF de la dieta) se quitó el 24/11/2026. Lo que
 * se compraba por el menú pasa a ser la cantidad de cada necesidad, para que la lista siga
 * pidiendo lo mismo. Se usa al poner al día la base de datos del iPhone y al importar una copia
 * de seguridad antigua. Funciones puras que no se fían de lo guardado: lo que no se entiende se
 * ignora.
 */
import {
  convertir,
  mismaFamilia,
  SEMANAS,
  UNIDADES_NECESIDAD,
  type Necesidad,
  type UnidadNecesidad,
} from './necesidades/modelo.ts';

/** Ajustes que solo usaba el Menú. */
export const AJUSTES_DEL_MENU = ['menu', 'trozosAprendidos', 'platosSinCompra'] as const;

const redondear = (n: number) => Math.round(n * 1e6) / 1e6;
const esObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const positivo = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
const entero = (v: unknown, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= max;

/**
 * Cuántas veces a la semana salía cada receta y para cuántas personas. El menú por días era
 * `{personas, dias: [[{receta?}]]}`; el de antes del 18/11/2026, `[{receta, veces, personas}]`.
 */
function vecesDelMenu(menu: unknown): Map<string, number> {
  const raciones = new Map<string, number>();
  const sumar = (receta: unknown, n: number) => {
    if (typeof receta === 'string' && receta) raciones.set(receta, (raciones.get(receta) ?? 0) + n);
  };
  if (Array.isArray(menu)) {
    for (const p of menu) {
      if (esObjeto(p) && entero(p.veces, 21) && entero(p.personas, 12)) {
        sumar(p.receta, p.veces * p.personas);
      }
    }
  } else if (esObjeto(menu) && Array.isArray(menu.dias)) {
    const personas = entero(menu.personas, 12) ? menu.personas : 1;
    for (const dia of menu.dias.slice(0, 7)) {
      if (!Array.isArray(dia)) continue;
      for (const plato of dia) if (esObjeto(plato)) sumar(plato.receta, personas);
    }
  }
  return raciones;
}

/** Lo que se gastaba a la semana de cada necesidad por el menú, en la unidad de la necesidad. */
export function gastoDelMenu(
  menu: unknown,
  recetas: readonly unknown[],
  necesidades: readonly Necesidad[],
): Map<string, number> {
  const unidades = new Map(necesidades.map((n) => [n.id, n.unidad]));
  const gasto = new Map<string, number>();
  for (const [id, raciones] of vecesDelMenu(menu)) {
    const receta = recetas.find((r) => esObjeto(r) && r.id === id);
    if (!esObjeto(receta) || !entero(receta.raciones, 50)) continue;
    if (!Array.isArray(receta.ingredientes)) continue;
    for (const ing of receta.ingredientes) {
      if (!esObjeto(ing) || typeof ing.necesidad !== 'string' || !positivo(ing.cantidad)) continue;
      const unidad = unidades.get(ing.necesidad);
      const suya = ing.unidad as UnidadNecesidad;
      if (!unidad || !UNIDADES_NECESIDAD.includes(suya) || !mismaFamilia(suya, unidad)) continue;
      const semanal = (convertir(ing.cantidad, suya, unidad) / receta.raciones) * raciones;
      gasto.set(ing.necesidad, redondear((gasto.get(ing.necesidad) ?? 0) + semanal));
    }
  }
  return gasto;
}

/**
 * Necesidades sin el menú: a cada una se le suma lo que gastaba el menú (en su frecuencia) y
 * las que eran solo para recetas pasan a ser lo que pedía el menú a la semana. Las que eran
 * solo para recetas y no estaban en el menú se quedan sin cantidad (no entran en la lista).
 * Devuelve solo las que cambian.
 */
export function quitarMenu(
  necesidades: readonly Necesidad[],
  recetas: readonly unknown[],
  menu: unknown,
): Necesidad[] {
  const gasto = gastoDelMenu(menu, recetas, necesidades);
  const cambiadas: Necesidad[] = [];
  for (const n of necesidades) {
    const semanal = gasto.get(n.id) ?? 0;
    if (semanal <= 0) continue;
    if (n.soloRecetas) {
      const nueva: Necesidad = { ...n, cantidad: semanal, frecuencia: 'semana' };
      delete nueva.soloRecetas;
      cambiadas.push(nueva);
    } else {
      cambiadas.push({
        ...n,
        cantidad: redondear(n.cantidad + semanal * SEMANAS[n.frecuencia]),
      });
    }
  }
  return cambiadas;
}

/** Las necesidades con lo del menú ya sumado (todas, cambien o no). */
export function necesidadesSinMenu(
  necesidades: readonly Necesidad[],
  recetas: readonly unknown[],
  menu: unknown,
): Necesidad[] {
  const cambiadas = new Map(quitarMenu(necesidades, recetas, menu).map((n) => [n.id, n]));
  return necesidades.map((n) => cambiadas.get(n.id) ?? n);
}
