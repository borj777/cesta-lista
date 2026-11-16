/** Textos de formato, precio y precio por unidad, siempre a la española. */
import type { UnidadNecesidad } from './necesidades/modelo.ts';
import type { ProductoApp, Unidad } from './tipos.ts';

const euros = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const numero = (decimales: number) =>
  new Intl.NumberFormat('es-ES', { maximumFractionDigits: decimales });

/** "4,98 €". */
export function textoPrecio(precio: number): string {
  return euros.format(precio);
}

const SUFIJO_REF: Record<Unidad, string> = {
  kg: '€/kg',
  l: '€/l',
  ud: '€/ud.',
  lavado: '€/lavado',
  m: '€/m',
};

/** "0,83 €/l". Los importes muy pequeños llevan más decimales: "0,0077 €/ud.". */
export function textoPrecioRef(precioRef: number, unidad: Unidad): string {
  const decimales = precioRef < 0.1 ? 4 : 2;
  const valor = new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: decimales,
  }).format(precioRef);
  return `${valor} ${SUFIJO_REF[unidad]}`;
}

/** "6 l", "250 g", "500 ml", "12 ud.", "50 lavados", "30 m". */
export function textoFormato(formato: ProductoApp['formato']): string {
  const { cantidad, unidad } = formato;
  switch (unidad) {
    case 'kg':
      return cantidad < 1
        ? `${numero(0).format(cantidad * 1000)} g`
        : `${numero(3).format(cantidad)} kg`;
    case 'l':
      return cantidad < 1
        ? `${numero(0).format(cantidad * 1000)} ml`
        : `${numero(3).format(cantidad)} l`;
    case 'ud':
      return `${numero(2).format(cantidad)} ud.`;
    case 'lavado':
      return cantidad === 1 ? '1 lavado' : `${numero(0).format(cantidad)} lavados`;
    case 'm':
      return `${numero(2).format(cantidad)} m`;
  }
}

/** Unidad de precioRef con la que se compara una necesidad (g → kg, ml → l). */
export function unidadDeComparacion(unidad: UnidadNecesidad): Unidad {
  if (unidad === 'g') return 'kg';
  if (unidad === 'ml') return 'l';
  return unidad;
}

/** "AAAA-MM-DD" de hoy en España. */
export function hoyEnEspana(ahora = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Europe/Madrid',
  }).format(ahora);
}

/** "18/11" a partir de "2026-11-18". */
export function textoDia(fecha: string): string {
  const [, mes, dia] = fecha.split('-');
  return `${dia}/${mes}`;
}

export type PrecioVigente = {
  precio: number;
  precioRef: number;
  /** Texto de la oferta si sigue vigente: "Ahora más barato hasta el 18/11". */
  oferta?: string;
  precioAnterior?: number;
};

/**
 * Precio que se pagará hoy. Si la oferta ya ha terminado (los precios se descargan por la
 * mañana y pueden ser de ayer), se vuelve al precio normal.
 */
export function precioVigente(p: ProductoApp, hoy: string): PrecioVigente {
  const caducada = p.ofertaHasta !== undefined && p.ofertaHasta < hoy;
  if (caducada && p.precioAnterior) {
    return {
      precio: p.precioAnterior,
      precioRef: Math.round(((p.precioRef * p.precioAnterior) / p.precio) * 10_000) / 10_000,
    };
  }
  const vigente: PrecioVigente = { precio: p.precio, precioRef: p.precioRef };
  if (p.precioAnterior) vigente.precioAnterior = p.precioAnterior;
  if (p.oferta && !caducada) {
    vigente.oferta = p.ofertaHasta ? `${p.oferta} hasta el ${textoDia(p.ofertaHasta)}` : p.oferta;
  } else if (p.precioAnterior && !caducada) {
    vigente.oferta = 'Precio rebajado';
  }
  return vigente;
}
