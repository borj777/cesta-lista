import type { Unidad } from './tipos.ts';

export type Formato = { cantidad: number; unidad: Unidad };

/** Redondea a un número de decimales evitando errores de coma flotante. */
export function redondear(n: number, decimales = 4): number {
  const f = 10 ** decimales;
  return Math.round((n + Number.EPSILON) * f) / f;
}

/** Precio por kg, litro o unidad. */
export function calcularPrecioRef(precio: number, cantidad: number): number {
  return redondear(precio / cantidad);
}

/**
 * ¿Coincide el precioRef calculado con el que publica la tienda?
 * Las tiendas redondean a céntimos, así que se tolera medio céntimo más un 2 %.
 */
export function coincidePrecioRef(calculado: number, tienda: number): boolean {
  return Math.abs(calculado - tienda) <= 0.005 + 0.02 * Math.abs(tienda);
}

/** Convierte un número escrito en español ("0,75") a número. */
function numero(texto: string): number {
  return Number(texto.replace(',', '.'));
}

/** Unidad base y factor de conversión de cada abreviatura que usan las tiendas. */
function unidadBase(abreviatura: string): { unidad: Unidad; factor: number } | null {
  const a = abreviatura.toLowerCase().replace(/\.$/, '');
  if (['kg', 'kgs', 'kilo', 'kilos'].includes(a)) return { unidad: 'kg', factor: 1 };
  if (['g', 'gr', 'grs', 'gramos'].includes(a)) return { unidad: 'kg', factor: 0.001 };
  if (['l', 'lt', 'litro', 'litros'].includes(a)) return { unidad: 'l', factor: 1 };
  if (a === 'cl') return { unidad: 'l', factor: 0.01 };
  if (a === 'ml') return { unidad: 'l', factor: 0.001 };
  if (['u', 'ud', 'uds', 'unidad', 'unidades'].includes(a)) return { unidad: 'ud', factor: 1 };
  return null;
}

const NUM = String.raw`(\d+(?:[.,]\d+)?)`;
const MEDIDA = String.raw`(kgs?|kilos?|grs?|g|gramos|litros?|lt|l|cl|ml)`;
const FIN = String.raw`(?=[\s.,)]|$)`;
const RE_PACK = new RegExp(String.raw`(\d+)\s*x\s*${NUM}\s*${MEDIDA}${FIN}`, 'gi');
const RE_MEDIDA = new RegExp(String.raw`${NUM}\s*${MEDIDA}${FIN}`, 'gi');
const RE_UNIDADES = new RegExp(String.raw`(\d+)\s*(unidades|unidad|uds|ud|u)${FIN}`, 'gi');

/** Interpreta una cantidad con unidad, p. ej. "1 Kg", "100 Gr", "0,75 L", "1 U". */
export function parsearCantidad(texto: string): Formato | null {
  const m = new RegExp(String.raw`^\s*${NUM}\s*([a-záéíóú]+)\.?\s*$`, 'i').exec(texto);
  if (!m?.[1] || !m[2]) return null;
  const base = unidadBase(m[2]);
  if (!base) return null;
  const cantidad = numero(m[1]) * base.factor;
  return cantidad > 0 ? { cantidad, unidad: base.unidad } : null;
}

/**
 * Extrae el formato de la descripción de un producto de Consum en la unidad pedida.
 * Ejemplos: "Leche Brik 1 L" → 1 l; "Postre Pack de 2 Unidades 2 x 125 Gr" → 0,25 kg;
 * "Lechuga Peso Aproximado 350 Gr. 0,35 Kg" → 0,35 kg (vale la última medida).
 * Devuelve null si la descripción no indica una medida de esa unidad.
 */
export function parsearFormatoDescripcion(descripcion: string, unidad: Unidad): Formato | null {
  const ultima = <T>(lista: T[]): T | undefined => lista[lista.length - 1];

  if (unidad === 'ud') {
    const m = ultima([...descripcion.matchAll(RE_UNIDADES)]);
    return m?.[1] ? { cantidad: Number(m[1]), unidad: 'ud' } : null;
  }

  const packs = [...descripcion.matchAll(RE_PACK)]
    .map((m) => {
      const base = unidadBase(m[3] ?? '');
      return base && { cantidad: Number(m[1]) * numero(m[2] ?? '') * base.factor, unidad: base.unidad };
    })
    .filter((f): f is Formato => !!f && f.unidad === unidad && f.cantidad > 0);
  const pack = ultima(packs);
  if (pack) return { cantidad: redondear(pack.cantidad, 6), unidad };

  const medidas = [...descripcion.matchAll(RE_MEDIDA)]
    .map((m) => {
      const base = unidadBase(m[2] ?? '');
      return base && { cantidad: numero(m[1] ?? '') * base.factor, unidad: base.unidad };
    })
    .filter((f): f is Formato => !!f && f.unidad === unidad && f.cantidad > 0);
  const medida = ultima(medidas);
  return medida ? { cantidad: redondear(medida.cantidad, 6), unidad } : null;
}
