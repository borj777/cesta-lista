/**
 * Tiendas: Mercadona y Consum, con precios automáticos, y las tiendas propias que añade el
 * usuario (Lidl, la frutería del barrio...), con los precios apuntados a mano. Cada tienda se
 * puede apagar: entonces la app no la tiene en cuenta al repartir la compra.
 */

/** Tiendas cuyos precios llegan en app.json. */
export const TIENDAS_AUTOMATICAS = ['mercadona', 'consum'] as const;
export type TiendaAutomatica = (typeof TIENDAS_AUTOMATICAS)[number];

/** Id de cualquier tienda: 'mercadona', 'consum' o el de una tienda propia ('lidl'...). */
export type IdTienda = string;

export const esAutomatica = (id: IdTienda): id is TiendaAutomatica =>
  (TIENDAS_AUTOMATICAS as readonly string[]).includes(id);

export const NOMBRE_AUTOMATICA: Record<TiendaAutomatica, string> = {
  mercadona: 'Mercadona',
  consum: 'Consum',
};

export const COLOR_AUTOMATICA: Record<TiendaAutomatica, string> = {
  mercadona: '#3e8e2f',
  consum: '#e0612b',
};

/** Colores para las tiendas propias, en el orden en que se reparten. */
export const COLORES = [
  '#1d5fb0', // azul
  '#8e44ad', // morado
  '#c0392b', // rojo
  '#16867a', // verde azulado
  '#b7860b', // mostaza
  '#c2407f', // rosa
  '#5d6d7e', // gris azulado
  '#7b5135', // marrón
] as const;

/** Como máximo, tantas tiendas propias como colores. */
export const MAX_TIENDAS_PROPIAS = COLORES.length;

export type TiendaPropia = {
  id: string;
  nombre: string;
  /** Color del punto que la identifica en la lista. */
  color: string;
  creada: string;
};

/** Lidl viene creada desde el principio, con el id 'lidl' de las versiones anteriores. */
export const crearLidl = (ahora: string): TiendaPropia => ({
  id: 'lidl',
  nombre: 'Lidl',
  color: COLORES[0],
  creada: ahora,
});

/** Una tienda tal como la ven las pantallas y el optimizador. */
export type InfoTienda = {
  id: IdTienda;
  nombre: string;
  color: string;
  automatica: boolean;
  /** false si el usuario la ha apagado: no se tiene en cuenta al repartir la compra. */
  activa: boolean;
};

/** Todas las tiendas en orden: Mercadona, Consum y las propias por fecha de creación. */
export function listaTiendas(
  propias: readonly TiendaPropia[],
  apagadas: readonly IdTienda[],
): InfoTienda[] {
  const automaticas = TIENDAS_AUTOMATICAS.map((id) => ({
    id,
    nombre: NOMBRE_AUTOMATICA[id],
    color: COLOR_AUTOMATICA[id],
    automatica: true,
  }));
  const ordenadas = [...propias]
    .sort((a, b) => a.creada.localeCompare(b.creada) || a.nombre.localeCompare(b.nombre, 'es'))
    .map((t) => ({ id: t.id, nombre: t.nombre, color: t.color, automatica: false }));
  return [...automaticas, ...ordenadas].map((t) => ({ ...t, activa: !apagadas.includes(t.id) }));
}

/** Nombre sin tildes, mayúsculas ni espacios de más, para detectar repetidos. */
const clave = (nombre: string) =>
  nombre
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/** Error del nombre de una tienda, o null si vale. `propia` es la tienda que se edita. */
export function validarNombreTienda(
  nombre: string,
  propias: readonly TiendaPropia[],
  propia?: TiendaPropia,
): string | null {
  const limpio = nombre.trim();
  if (!limpio) return 'Escribe el nombre de la tienda.';
  if (limpio.length > 40) return 'Usa un nombre más corto (40 letras).';
  const nombres = [
    ...Object.values(NOMBRE_AUTOMATICA),
    ...propias.filter((t) => t.id !== propia?.id).map((t) => t.nombre),
  ];
  if (nombres.some((n) => clave(n) === clave(limpio))) {
    return `Ya tienes una tienda llamada «${limpio}».`;
  }
  return null;
}

/** El primer color que no usa ninguna otra tienda (o el siguiente en la rueda). */
export function colorLibre(propias: readonly TiendaPropia[]): string {
  const usados = new Set(propias.map((t) => t.color));
  return (
    COLORES.find((c) => !usados.has(c)) ?? COLORES[propias.length % COLORES.length] ?? COLORES[0]
  );
}

export function crearTienda(
  nombre: string,
  propias: readonly TiendaPropia[],
  ahora: string,
  id: string,
): TiendaPropia {
  return { id, nombre: nombre.trim(), color: colorLibre(propias), creada: ahora };
}

export function renombrarTienda(t: TiendaPropia, nombre: string): TiendaPropia {
  return { ...t, nombre: nombre.trim() };
}

const esFecha = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));

/** Motivo por el que una tienda de una copia no es válida, o null si lo es. */
export function problemaTienda(t: Record<string, unknown>): string | null {
  if (typeof t.id !== 'string' || !t.id) return 'le falta el identificador';
  if (esAutomatica(t.id)) return 'usa el identificador de Mercadona o Consum';
  if (typeof t.nombre !== 'string' || !t.nombre.trim()) return 'le falta el nombre';
  if (typeof t.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(t.color)) {
    return 'el color no es válido';
  }
  if (!esFecha(t.creada)) return 'la fecha no es válida';
  return null;
}

/** Lee la lista de tiendas apagadas guardada en los ajustes (descarta lo que no sea válido). */
export function leerApagadas(valor: unknown): IdTienda[] {
  return Array.isArray(valor)
    ? [...new Set(valor.filter((v): v is string => typeof v === 'string' && v.length > 0))]
    : [];
}
