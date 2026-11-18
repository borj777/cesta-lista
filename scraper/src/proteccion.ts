import type { Producto, ResultadoAdaptador } from './tipos.ts';

/** Umbrales para decidir si los datos nuevos son de fiar (ver CLAUDE.md). */
export const LIMITES = {
  /** Un precio "varía mucho" si cambia más de un 50 %... */
  variacionPrecio: 0.5,
  /** ...y la descarga se rechaza si eso le pasa a más del 20 % de los productos. */
  proporcionVariaciones: 0.2,
  /** Se rechaza si hay más de un 30 % menos de productos que el último día bueno. */
  caidaProductos: 0.3,
  /** Cambio de formato: más del 5 % de los productos recibidos no se puede leer. */
  descartados: 0.05,
  /** Descarga incompleta: se recibe menos del 95 % de lo que la tienda dice tener. */
  completitud: 0.95,
} as const;

export type Veredicto = { valido: true } | { valido: false; motivo: string };

const pct = (n: number) => `${Math.round(n * 100)} %`;

/**
 * Decide si los datos nuevos de una tienda pueden sustituir a los anteriores.
 * Si no, la tienda se marca como fallida y se conservan los datos buenos.
 * Con `semanal` (ofertas de Lidl, que cambian enteras cada semana) no se compara con el
 * último día bueno: solo se rechazan 0 productos o un cambio de formato.
 */
export function evaluar(
  nuevo: ResultadoAdaptador,
  anteriores: Producto[] | null,
  { semanal = false }: { semanal?: boolean } = {},
): Veredicto {
  const n = nuevo.productos.length;
  if (n === 0) return { valido: false, motivo: 'La tienda ha devuelto 0 productos' };

  if (nuevo.recibidos > 0 && nuevo.descartados / nuevo.recibidos > LIMITES.descartados) {
    return {
      valido: false,
      motivo: `Cambio de formato: ${nuevo.descartados} de ${nuevo.recibidos} productos no se han podido leer`,
    };
  }

  if (nuevo.esperados && nuevo.recibidos < nuevo.esperados * LIMITES.completitud) {
    return {
      valido: false,
      motivo: `Descarga incompleta: ${nuevo.recibidos} productos de los ${nuevo.esperados} que indica la tienda`,
    };
  }

  if (semanal || !anteriores || anteriores.length === 0) return { valido: true };

  if (n < anteriores.length * (1 - LIMITES.caidaProductos)) {
    return {
      valido: false,
      motivo: `Solo ${n} productos, frente a ${anteriores.length} del último día bueno`,
    };
  }

  const previos = new Map(anteriores.map((p) => [p.id, p]));
  let comunes = 0;
  let variaciones = 0;
  for (const p of nuevo.productos) {
    const previo = previos.get(p.id);
    if (!previo) continue;
    comunes++;
    if (Math.abs(p.precio - previo.precio) / previo.precio > LIMITES.variacionPrecio) variaciones++;
  }

  if (comunes < Math.min(n, anteriores.length) * 0.5) {
    return {
      valido: false,
      motivo: `Cambio de formato: solo ${comunes} productos coinciden con los del último día bueno`,
    };
  }

  if (variaciones / comunes > LIMITES.proporcionVariaciones) {
    return {
      valido: false,
      motivo: `El ${pct(variaciones / comunes)} de los precios (${variaciones} de ${comunes}) ha variado más de un ${pct(LIMITES.variacionPrecio)}`,
    };
  }

  return { valido: true };
}
