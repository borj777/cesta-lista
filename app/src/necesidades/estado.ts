/** Necesidades en memoria, sincronizadas con IndexedDB, para que todas las pantallas las vean. */
import { useEffect, useState } from 'preact/hooks';
import { borrarNecesidad, guardarNecesidad, listarNecesidades } from '../almacen.ts';
import type { Necesidad } from './modelo.ts';

type Estado = { necesidades: Necesidad[] | null; error: string | null };
let estado: Estado = { necesidades: null, error: null };
const oyentes = new Set<(e: Estado) => void>();

function publicar(nuevo: Estado) {
  estado = nuevo;
  for (const oyente of oyentes) oyente(estado);
}

export async function recargarNecesidades(): Promise<void> {
  try {
    publicar({ necesidades: await listarNecesidades(), error: null });
  } catch (error) {
    const motivo = error instanceof Error ? error.message : String(error);
    publicar({ ...estado, error: `No se han podido leer tus datos del iPhone (${motivo}).` });
  }
}

export async function guardar(n: Necesidad): Promise<void> {
  await guardarNecesidad(n);
  await recargarNecesidades();
}

/** Borra la necesidad (y la quita de las recetas que la usaban). */
export async function borrar(id: string): Promise<void> {
  await borrarNecesidad(id);
  await recargarNecesidades();
  // Import diferido: el estado de las recetas importa este módulo.
  const { recargarRecetas } = await import('../menu/estado.ts');
  await recargarRecetas();
}

export function useNecesidades(): Estado {
  const [actual, setActual] = useState(estado);
  useEffect(() => {
    oyentes.add(setActual);
    if (estado.necesidades === null) void recargarNecesidades();
    else setActual(estado);
    return () => {
      oyentes.delete(setActual);
    };
  }, []);
  return actual;
}
