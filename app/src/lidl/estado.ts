/** Precios de Lidl en memoria, sincronizados con IndexedDB, para que todas las pantallas los vean. */
import { useEffect, useState } from 'preact/hooks';
import { borrarProductoLidl, guardarProductoLidl, listarLidl } from '../almacen.ts';
import type { ProductoLidl } from './modelo.ts';

type Estado = { productos: ProductoLidl[] | null; error: string | null };
let estado: Estado = { productos: null, error: null };
const oyentes = new Set<(e: Estado) => void>();

function publicar(nuevo: Estado) {
  estado = nuevo;
  for (const oyente of oyentes) oyente(estado);
}

export async function recargarLidl(): Promise<void> {
  try {
    publicar({ productos: await listarLidl(), error: null });
  } catch (error) {
    const motivo = error instanceof Error ? error.message : String(error);
    publicar({ ...estado, error: `No se han podido leer los precios de Lidl (${motivo}).` });
  }
}

export async function guardarLidl(p: ProductoLidl): Promise<void> {
  await guardarProductoLidl(p);
  await recargarLidl();
}

export async function borrarLidl(id: string): Promise<void> {
  await borrarProductoLidl(id);
  await recargarLidl();
}

export function useLidl(): Estado {
  const [actual, setActual] = useState(estado);
  useEffect(() => {
    oyentes.add(setActual);
    if (estado.productos === null) void recargarLidl();
    else setActual(estado);
    return () => {
      oyentes.delete(setActual);
    };
  }, []);
  return actual;
}
