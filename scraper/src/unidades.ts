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
  if (['u', 'ud', 'uds', 'unid', 'unidad', 'unidades'].includes(a)) {
    return { unidad: 'ud', factor: 1 };
  }
  // Consum: "Do" son dosis (una bolsita, una pastilla...): se cuentan como unidades.
  if (['do', 'dosis'].includes(a)) return { unidad: 'ud', factor: 1 };
  // Consum: "Dc" son docenas ("0,5 Dc" = 6 huevos; "0,83 Dc" = una decena).
  if (a === 'dc') return { unidad: 'ud', factor: 12 };
  if (['lv', 'lavado', 'lavados'].includes(a)) return { unidad: 'lavado', factor: 1 };
  if (['m', 'metro', 'metros'].includes(a)) return { unidad: 'm', factor: 1 };
  return null;
}

/** Número que no forma parte de una fracción ni de otro número ("1/2 Docena" no es "2 Docena"). */
const NUM = String.raw`(?<![\d/.,])(\d+(?:[.,]\d+)?)`;
const PALABRA = String.raw`([a-záéíóú]+)\.?`;
const FIN = String.raw`(?=[\s.,)]|$)`;
const RE_PACK = new RegExp(String.raw`(?<![\d/.,])(\d+)\s*x\s*${NUM}\s*${PALABRA}${FIN}`, 'gi');
const RE_MEDIDA = new RegExp(String.raw`${NUM}\s*${PALABRA}${FIN}`, 'gi');

/** Las unidades se redondean al entero si están muy cerca ("0,83 Dc" = 9,96 → 10 huevos). */
function ajustar(formato: Formato): Formato {
  const { cantidad, unidad } = formato;
  const entero = Math.round(cantidad);
  if (unidad === 'ud' && entero > 0 && Math.abs(cantidad - entero) <= 0.1) {
    return { cantidad: entero, unidad };
  }
  return { cantidad: redondear(cantidad, 6), unidad };
}

/** Interpreta una cantidad con unidad, p. ej. "1 Kg", "100 Gr", "0,75 L", "1 U", "1 Dc". */
export function parsearCantidad(texto: string): Formato | null {
  const m = new RegExp(String.raw`^\s*${NUM}\s*${PALABRA}\s*$`, 'i').exec(texto);
  if (!m?.[1] || !m[2]) return null;
  const base = unidadBase(m[2]);
  if (!base) return null;
  const cantidad = numero(m[1]) * base.factor;
  return cantidad > 0 ? { cantidad, unidad: base.unidad } : null;
}

/**
 * Extrae el formato de la descripción de un producto de Consum en la unidad pedida.
 * Ejemplos: "Leche Brik 1 L" → 1 l; "Postre Pack de 2 Unidades 2 x 125 Gr" → 0,25 kg;
 * "Lechuga Peso Aproximado 350 Gr. 0,35 Kg" → 0,35 kg (vale la última medida);
 * "Pila Recargable AAA Pack de 4 Unidades 4 x 1 U" → 4 ud; "Huevos 1/2 Docena 0,5 Dc" → 6 ud;
 * "Detergente Líquido 50 Lv" → 50 lavados; "Aluminio 30 M" → 30 m.
 * Un pack "N x cantidad" tiene preferencia. Devuelve null si no hay medida de esa unidad.
 */
export function parsearFormatoDescripcion(descripcion: string, unidad: Unidad): Formato | null {
  const ultima = <T>(lista: T[]): T | undefined => lista[lista.length - 1];
  const deLaUnidad = (f: Formato | null): f is Formato =>
    !!f && f.unidad === unidad && f.cantidad > 0;

  const pack = ultima(
    [...descripcion.matchAll(RE_PACK)]
      .map((m) => {
        const base = unidadBase(m[3] ?? '');
        const cantidad = Number(m[1]) * numero(m[2] ?? '');
        return base && { cantidad: cantidad * base.factor, unidad: base.unidad };
      })
      .filter(deLaUnidad),
  );
  if (pack) return ajustar(pack);

  const medida = ultima(
    [...descripcion.matchAll(RE_MEDIDA)]
      .map((m) => {
        const base = unidadBase(m[2] ?? '');
        return base && { cantidad: numero(m[1] ?? '') * base.factor, unidad: base.unidad };
      })
      .filter(deLaUnidad),
  );
  return medida ? ajustar(medida) : null;
}
