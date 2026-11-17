/**
 * La compra en curso y las necesidades adelantadas, guardadas en el almacén `ajustes` (así van
 * en la copia de seguridad) y compartidas entre pantallas.
 */
import { useEffect, useState } from 'preact/hooks';
import { guardarAjuste, guardarNecesidad, leerAjuste } from '../almacen.ts';
import { recargarNecesidades } from '../necesidades/estado.ts';
import type { Necesidad } from '../necesidades/modelo.ts';
import { leerAdelantadas, leerCompra, type CompraEnCurso } from './compra.ts';

export const AJUSTE_COMPRA = 'compraEnCurso';
export const AJUSTE_ADELANTADAS = 'adelantadas';
export const AJUSTE_PANTALLA = 'pantallaEncendida';

export type EstadoCompra = {
  /** false mientras se lee. */
  listo: boolean;
  compra: CompraEnCurso | null;
  adelantadas: string[];
  /** Mantener la pantalla encendida durante la compra (por defecto, sí). */
  pantallaEncendida: boolean;
};

let estado: EstadoCompra = { listo: false, compra: null, adelantadas: [], pantallaEncendida: true };
const oyentes = new Set<(e: EstadoCompra) => void>();

function publicar(cambios: Partial<EstadoCompra>) {
  estado = { ...estado, ...cambios };
  for (const oyente of oyentes) oyente(estado);
}

export async function recargarCompra(): Promise<void> {
  try {
    const [compra, adelantadas, pantalla] = await Promise.all([
      leerAjuste(AJUSTE_COMPRA),
      leerAjuste(AJUSTE_ADELANTADAS),
      leerAjuste(AJUSTE_PANTALLA),
    ]);
    publicar({
      listo: true,
      compra: leerCompra(compra),
      adelantadas: leerAdelantadas(adelantadas),
      pantallaEncendida: pantalla !== false,
    });
  } catch {
    publicar({ listo: true });
  }
}

/** Guarda la compra al momento: lo marcado no se pierde aunque se cierre la app. */
export async function guardarCompra(compra: CompraEnCurso | null): Promise<void> {
  publicar({ compra });
  await guardarAjuste(AJUSTE_COMPRA, compra);
}

export async function guardarAdelantadas(adelantadas: string[]): Promise<void> {
  publicar({ adelantadas });
  await guardarAjuste(AJUSTE_ADELANTADAS, adelantadas);
}

export async function guardarPantallaEncendida(encendida: boolean): Promise<void> {
  publicar({ pantallaEncendida: encendida });
  await guardarAjuste(AJUSTE_PANTALLA, encendida);
}

/** Termina la compra: apunta las fechas de compra y vacía la lista y las adelantadas. */
export async function cerrarCompra(compradas: Necesidad[]): Promise<void> {
  for (const n of compradas) await guardarNecesidad(n);
  await Promise.all([guardarCompra(null), guardarAdelantadas([])]);
  await recargarNecesidades();
}

export function useCompra(): EstadoCompra {
  const [actual, setActual] = useState(estado);
  useEffect(() => {
    oyentes.add(setActual);
    if (!estado.listo) void recargarCompra();
    else setActual(estado);
    return () => {
      oyentes.delete(setActual);
    };
  }, []);
  return actual;
}
