/** Recetas en memoria, sincronizadas con IndexedDB, para que todas las pantallas las vean. */
import { useEffect, useState } from 'preact/hooks';
import {
  borrarReceta as borrarRecetaBD,
  guardarRecetaYNecesidades,
  listarRecetas,
} from '../almacen.ts';
import { recargarNecesidades } from '../necesidades/estado.ts';
import type { Necesidad } from '../necesidades/modelo.ts';
import type { Receta } from './recetas.ts';

type Estado = { recetas: Receta[] | null; error: string | null };
let estado: Estado = { recetas: null, error: null };
const oyentes = new Set<(e: Estado) => void>();

function publicar(nuevo: Estado) {
  estado = nuevo;
  for (const oyente of oyentes) oyente(estado);
}

export async function recargarRecetas(): Promise<void> {
  try {
    publicar({ recetas: await listarRecetas(), error: null });
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

export async function borrarReceta(id: string): Promise<void> {
  await borrarRecetaBD(id);
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
