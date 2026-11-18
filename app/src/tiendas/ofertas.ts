/**
 * Ofertas semanales de las tiendas sin catálogo (hoy, Lidl): vienen en app.json con la tienda
 * 'lidl', su id de Lidl y las fechas en que valen. Una oferta elegida para una necesidad se usa
 * mientras dura, además del producto apuntado a mano, que vuelve solo cuando se acaba.
 * Funciones puras.
 */
import { textoDia, textoPrecio } from '../formato.ts';
import type { Necesidad } from '../necesidades/modelo.ts';
import type { DatosApp, ProductoApp } from '../tipos.ts';
import { esAutomatica, type IdTienda } from './modelo.ts';

/** Oferta elegida para una necesidad en una tienda (por id, como las equivalencias). */
export type OfertaElegida = { id: string };
export type OfertasElegidas = Partial<Record<IdTienda, OfertaElegida>>;

/**
 * ¿Es una oferta semanal? Son los productos de app.json de una tienda sin catálogo: llevan
 * siempre su último día. Los apuntados a mano no tienen fechas.
 */
export const esOfertaSemanal = (p: ProductoApp): boolean =>
  !esAutomatica(p.tienda) && p.ofertaHasta !== undefined;

export type EstadoOferta = 'vigente' | 'proxima' | 'terminada';

/** Si la oferta vale hoy, empieza más adelante o ya ha terminado (fechas de España). */
export function estadoOferta(p: ProductoApp, hoy: string): EstadoOferta {
  if (p.ofertaHasta !== undefined && p.ofertaHasta < hoy) return 'terminada';
  if (p.ofertaDesde !== undefined && p.ofertaDesde > hoy) return 'proxima';
  return 'vigente';
}

/** Ofertas de una tienda que valen hoy o más adelante. */
export function ofertasDe(datos: DatosApp, tienda: IdTienda, hoy: string): ProductoApp[] {
  return datos.productos.filter(
    (p) => p.tienda === tienda && esOfertaSemanal(p) && estadoOferta(p, hoy) !== 'terminada',
  );
}

const redondear = (n: number) => Math.round(n * 10_000) / 10_000;

/**
 * La oferta con el precio de Lidl Plus, para quien tiene la app: ese es el precio que paga, y
 * el normal pasa a ser el tachado.
 */
export function conLidlPlus(p: ProductoApp): ProductoApp {
  if (!p.precioLidlPlus || p.precioLidlPlus >= p.precio) return p;
  return {
    ...p,
    precio: p.precioLidlPlus,
    precioRef: redondear((p.precioRef * p.precioLidlPlus) / p.precio),
    precioAnterior: p.precioAnterior ?? p.precio,
    oferta: 'Con Lidl Plus',
  };
}

/** Los precios con Lidl Plus aplicados, si el usuario la tiene. Sin ella, los mismos datos. */
export function aplicarLidlPlus(datos: DatosApp, lidlPlus: boolean): DatosApp {
  if (!lidlPlus || !datos.productos.some((p) => p.precioLidlPlus)) return datos;
  return {
    ...datos,
    productos: datos.productos.map((p) => (p.precioLidlPlus ? conLidlPlus(p) : p)),
  };
}

/**
 * Texto de la etiqueta de una oferta semanal: «-19 % hasta el 22/11», «Hasta el 22/11» o
 * «Desde el 23/11». Null si no es una oferta semanal.
 */
export function etiquetaOferta(p: ProductoApp, hoy: string): string | null {
  if (!esOfertaSemanal(p)) return null;
  const estado = estadoOferta(p, hoy);
  if (estado === 'proxima' && p.ofertaDesde) return `Desde el ${textoDia(p.ofertaDesde)}`;
  if (estado === 'terminada') return 'Oferta terminada';
  const hasta = p.ofertaHasta ? `hasta el ${textoDia(p.ofertaHasta)}` : '';
  return p.oferta ? `${p.oferta} ${hasta}`.trim() : `Hasta el ${textoDia(p.ofertaHasta ?? hoy)}`;
}

/** «Con Lidl Plus: 0,95 €», si la oferta tiene ese precio y no se está aplicando. */
export function notaLidlPlus(p: ProductoApp): string | null {
  return p.precioLidlPlus && p.precioLidlPlus < p.precio
    ? `Con Lidl Plus: ${textoPrecio(p.precioLidlPlus)}`
    : null;
}

/** La oferta elegida para una necesidad en una tienda, si existe y vale hoy. */
export function ofertaVigente(
  n: Necesidad,
  tienda: IdTienda,
  buscarProducto: (tienda: IdTienda, id: string) => ProductoApp | undefined,
  hoy: string,
): ProductoApp | undefined {
  const elegida = n.ofertas?.[tienda];
  if (!elegida) return undefined;
  const p = buscarProducto(tienda, elegida.id);
  return p && esOfertaSemanal(p) && estadoOferta(p, hoy) === 'vigente' ? p : undefined;
}

/** Elige una oferta para una necesidad en una tienda (sustituye a la que hubiera). */
export function elegirOferta(n: Necesidad, tienda: IdTienda, id: string, ahora: string): Necesidad {
  return { ...n, ofertas: { ...n.ofertas, [tienda]: { id } }, actualizada: ahora };
}

/** Quita la oferta elegida en una tienda. */
export function quitarOferta(n: Necesidad, tienda: IdTienda, ahora: string): Necesidad {
  const ofertas = Object.fromEntries(
    Object.entries(n.ofertas ?? {}).filter(([t]) => t !== tienda),
  ) as OfertasElegidas;
  const resultado: Necesidad = { ...n, ofertas, actualizada: ahora };
  if (Object.keys(ofertas).length === 0) delete resultado.ofertas;
  return resultado;
}

/**
 * Quita de cada necesidad las ofertas que ya han terminado o que ya no están en los precios
 * descargados. Devuelve solo las necesidades que cambian.
 */
export function quitarOfertasTerminadas(
  necesidades: readonly Necesidad[],
  datos: DatosApp,
  hoy: string,
  ahora: string,
): Necesidad[] {
  const vivas = new Set(
    datos.productos
      .filter((p) => esOfertaSemanal(p) && estadoOferta(p, hoy) !== 'terminada')
      .map((p) => `${p.tienda}:${p.id}`),
  );
  const cambiadas: Necesidad[] = [];
  for (const n of necesidades) {
    let nueva = n;
    for (const [tienda, o] of Object.entries(n.ofertas ?? {})) {
      if (o && !vivas.has(`${tienda}:${o.id}`)) nueva = quitarOferta(nueva, tienda, ahora);
    }
    if (nueva !== n) cambiadas.push(nueva);
  }
  return cambiadas;
}
