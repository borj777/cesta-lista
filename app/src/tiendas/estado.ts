/**
 * Tiendas propias, sus productos y las tiendas apagadas, en memoria y sincronizados con
 * IndexedDB, para que todas las pantallas los vean.
 */
import { useEffect, useState } from 'preact/hooks';
import {
  AJUSTE_APAGADAS,
  borrarProducto as borrarProductoBD,
  borrarTiendaPropia,
  guardarAjuste,
  guardarProducto as guardarProductoBD,
  guardarTiendaPropia,
  leerAjuste,
  listarProductos,
  listarTiendas,
} from '../almacen.ts';
import { recargarNecesidades } from '../necesidades/estado.ts';
import {
  leerApagadas,
  listaTiendas,
  type IdTienda,
  type InfoTienda,
  type TiendaPropia,
} from './modelo.ts';
import type { ProductoPropio } from './productos.ts';

export type EstadoTiendas = {
  /** null mientras se leen. */
  propias: TiendaPropia[] | null;
  productos: ProductoPropio[] | null;
  apagadas: IdTienda[];
  /** Todas las tiendas en orden (Mercadona, Consum y las propias), o null mientras se leen. */
  lista: InfoTienda[] | null;
  error: string | null;
};

let estado: EstadoTiendas = {
  propias: null,
  productos: null,
  apagadas: [],
  lista: null,
  error: null,
};
const oyentes = new Set<(e: EstadoTiendas) => void>();

function publicar(cambios: Partial<EstadoTiendas>) {
  const nuevo = { ...estado, ...cambios };
  nuevo.lista = nuevo.propias ? listaTiendas(nuevo.propias, nuevo.apagadas) : null;
  estado = nuevo;
  for (const oyente of oyentes) oyente(estado);
}

export async function recargarTiendas(): Promise<void> {
  try {
    const [propias, productos, apagadas] = await Promise.all([
      listarTiendas(),
      listarProductos(),
      leerAjuste(AJUSTE_APAGADAS),
    ]);
    publicar({ propias, productos, apagadas: leerApagadas(apagadas), error: null });
  } catch (error) {
    const motivo = error instanceof Error ? error.message : String(error);
    publicar({ error: `No se han podido leer tus tiendas (${motivo}).` });
  }
}

export async function guardarTienda(t: TiendaPropia): Promise<void> {
  await guardarTiendaPropia(t);
  await recargarTiendas();
}

/** Borra la tienda, sus productos y lo elegido en ella en cada necesidad. */
export async function borrarTienda(id: string): Promise<void> {
  await borrarTiendaPropia(id);
  await Promise.all([recargarTiendas(), recargarNecesidades()]);
}

/** Enciende o apaga una tienda: apagada, no se tiene en cuenta al repartir la compra. */
export async function cambiarActiva(id: IdTienda, activa: boolean): Promise<void> {
  const apagadas = activa
    ? estado.apagadas.filter((t) => t !== id)
    : [...new Set([...estado.apagadas, id])];
  publicar({ apagadas });
  await guardarAjuste(AJUSTE_APAGADAS, apagadas);
}

export async function guardarProducto(p: ProductoPropio): Promise<void> {
  await guardarProductoBD(p);
  await recargarTiendas();
}

export async function borrarProducto(id: string): Promise<void> {
  await borrarProductoBD(id);
  await recargarTiendas();
}

export function useTiendas(): EstadoTiendas {
  const [actual, setActual] = useState(estado);
  useEffect(() => {
    oyentes.add(setActual);
    if (estado.propias === null) void recargarTiendas();
    else setActual(estado);
    return () => {
      oyentes.delete(setActual);
    };
  }, []);
  return actual;
}
