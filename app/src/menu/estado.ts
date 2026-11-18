/** Recetas en memoria, sincronizadas con IndexedDB, para que todas las pantallas las vean. */
import { useEffect, useState } from 'preact/hooks';
import {
  borrarReceta as borrarRecetaBD,
  guardarAjuste,
  guardarDieta,
  guardarRecetaYNecesidades,
  leerAjuste,
  listarRecetas,
} from '../almacen.ts';
import { recargarNecesidades } from '../necesidades/estado.ts';
import type { Necesidad } from '../necesidades/modelo.ts';
import { clavePlato } from './dieta/leer.ts';
import { AJUSTE_SIN_COMPRA } from './dieta/revision.ts';
import { leerMenu, menuVacio, quitarRecetaDelMenu, vecesPorReceta, type Menu } from './menu.ts';
import type { Receta } from './recetas.ts';

export const AJUSTE_MENU = 'menu';

type Estado = {
  recetas: Receta[] | null;
  menu: Menu;
  /** Platos de la dieta para los que no se compra nada. */
  sinCompra: string[];
  error: string | null;
};
let estado: Estado = { recetas: null, menu: menuVacio(), sinCompra: [], error: null };

const textos = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
const oyentes = new Set<(e: Estado) => void>();

function publicar(nuevo: Estado) {
  estado = nuevo;
  for (const oyente of oyentes) oyente(estado);
}

export async function recargarRecetas(): Promise<void> {
  try {
    const [recetas, menu, sinCompra] = await Promise.all([
      listarRecetas(),
      leerAjuste(AJUSTE_MENU),
      leerAjuste(AJUSTE_SIN_COMPRA),
    ]);
    publicar({ recetas, menu: leerMenu(menu), sinCompra: textos(sinCompra), error: null });
  } catch (error) {
    const motivo = error instanceof Error ? error.message : String(error);
    publicar({ ...estado, error: `No se han podido leer tus recetas (${motivo}).` });
  }
}

/** Guarda la receta y crea las necesidades nuevas de sus ingredientes. */
export async function guardarReceta(r: Receta, nuevas: Necesidad[] = []): Promise<void> {
  await guardarRecetaYNecesidades(r, nuevas);
  await Promise.all([recargarRecetas(), nuevas.length > 0 ? recargarNecesidades() : null]);
}

/** Borra la receta y la quita del menú (sus platos se quedan con su nombre, sin comprar nada). */
export async function borrarReceta(id: string): Promise<void> {
  await borrarRecetaBD(id);
  if (vecesPorReceta(estado.menu).has(id)) {
    await guardarMenu(quitarRecetaDelMenu(estado.menu, id));
  }
  await recargarRecetas();
}

/** Guarda lo que sale de la dieta (necesidades, recetas y menú) y lo recarga todo. */
export async function usarDieta(cambios: {
  necesidades: Necesidad[];
  recetas: Receta[];
  menu: Menu;
}): Promise<void> {
  await guardarDieta({
    necesidades: cambios.necesidades,
    recetas: cambios.recetas,
    ajustes: { [AJUSTE_MENU]: cambios.menu },
  });
  await Promise.all([recargarRecetas(), recargarNecesidades()]);
}

/** Guarda el menú al momento (cada plato añadido o quitado y cada cambio de personas). */
export async function guardarMenu(menu: Menu): Promise<void> {
  publicar({ ...estado, menu });
  await guardarAjuste(AJUSTE_MENU, menu);
}

/**
 * Decide qué es un plato de la dieta: una receta (se guarda el texto del PDF en ella para
 * reconocerlo otros meses y se quita de las demás), «no se compra nada» o nada todavía (null).
 */
export async function asignarPlato(
  texto: string,
  destino: { receta: string } | 'sin-compra' | null,
): Promise<void> {
  const k = clavePlato(texto);
  const recetas = estado.recetas ?? (await listarRecetas());
  const receta = destino && destino !== 'sin-compra' ? destino.receta : null;
  for (const r of recetas) {
    const tiene = r.alias?.some((a) => clavePlato(a) === k) ?? false;
    const debe = r.id === receta;
    if (tiene === debe) continue;
    const alias = (r.alias ?? []).filter((a) => clavePlato(a) !== k);
    if (debe) alias.push(texto);
    const cambiada: Receta = { ...r, alias };
    if (alias.length === 0) delete cambiada.alias;
    await guardarRecetaYNecesidades(cambiada, []);
  }
  const sinCompra = estado.sinCompra.filter((s) => clavePlato(s) !== k);
  if (destino === 'sin-compra') sinCompra.push(texto);
  if (sinCompra.length !== estado.sinCompra.length || destino === 'sin-compra') {
    await guardarAjuste(AJUSTE_SIN_COMPRA, sinCompra);
  }
  await recargarRecetas();
}

export function useRecetas(): Estado {
  const [actual, setActual] = useState(estado);
  useEffect(() => {
    oyentes.add(setActual);
    if (estado.recetas === null) void recargarRecetas();
    else setActual(estado);
    return () => {
      oyentes.delete(setActual);
    };
  }, []);
  return actual;
}
