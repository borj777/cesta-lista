/**
 * Historial de precios de Mercadona y Consum (data/historial/, lo genera el scraper en
 * scraper/src/historial.ts). Por producto, [día, precio, precioRef] los días en que cambia y
 * [día, null] el día que deja de estar. Funciones puras.
 */
import { textoDia, textoPrecio, textoPrecioRef } from '../formato.ts';
import type { Unidad } from '../tipos.ts';

export type Punto = [string, number, number] | [string, null];
export type Historial = Map<string, Punto[]>;

export const TROZOS = 10;

/** Trozo donde está un producto: la misma regla que el scraper (`trozoDe`). */
export const trozoDe = (id: string): number => id.charCodeAt(id.length - 1) % TROZOS;

const esPunto = (x: unknown): x is Punto =>
  Array.isArray(x) &&
  typeof x[0] === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(x[0]) &&
  ((x.length === 2 && x[1] === null) ||
    (x.length === 3 && typeof x[1] === 'number' && typeof x[2] === 'number'));

/** Lee un trozo descargado; null si no tiene la forma esperada. */
export function leerTrozo(datos: unknown): Historial | null {
  if (typeof datos !== 'object' || datos === null) return null;
  const productos = (datos as { productos?: unknown }).productos;
  if (typeof productos !== 'object' || productos === null) return null;
  const historial: Historial = new Map();
  for (const [id, puntos] of Object.entries(productos)) {
    if (Array.isArray(puntos) && puntos.length > 0 && puntos.every(esPunto)) {
      historial.set(id, puntos);
    }
  }
  return historial;
}

/** Un precio del historial: el día desde el que vale y su precio y precioRef. */
export type Precio = { dia: string; precio: number; precioRef: number };

/**
 * Por debajo de este cambio del precioRef no se cuenta como subida ni bajada: los productos
 * de peso variable (carne en bandeja) cambian unos céntimos por kg por el redondeo.
 */
export const CAMBIO_MINIMO = 0.01;

const distinto = (a: number, b: number) => Math.abs(a - b) / b >= CAMBIO_MINIMO;

export type Resumen = {
  /** Primer día del historial. */
  desde: string;
  /** Precio de hoy (el último apuntado), o null si ya no está en la tienda. */
  actual: Precio | null;
  minimo: number;
  maximo: number;
  /** Último cambio de precioRef de al menos un 1 %. */
  ultimoCambio: { dia: string; antesRef: number; ahoraRef: number } | null;
};

/** Resumen del historial de un producto, o null si no hay ningún precio. */
export function resumenHistorial(puntos: readonly Punto[]): Resumen | null {
  const precios = puntos.filter((p): p is [string, number, number] => p[1] !== null);
  const primero = puntos[0];
  if (!primero || precios.length === 0) return null;
  const ultimo = puntos.at(-1);
  const refs = precios.map((p) => p[2]);
  let ultimoCambio: Resumen['ultimoCambio'] = null;
  let referencia = precios[0]?.[2] ?? 0;
  for (const [dia, , ref] of precios.slice(1)) {
    if (distinto(ref, referencia)) {
      ultimoCambio = { dia, antesRef: referencia, ahoraRef: ref };
      referencia = ref;
    }
  }
  return {
    desde: primero[0],
    actual:
      ultimo && ultimo[1] !== null
        ? { dia: ultimo[0], precio: ultimo[1], precioRef: ultimo[2] }
        : null,
    minimo: Math.min(...refs),
    maximo: Math.max(...refs),
    ultimoCambio,
  };
}

const porcentaje = (antes: number, ahora: number) =>
  Math.max(1, Math.round((Math.abs(ahora - antes) / antes) * 100));

/**
 * Frases del resumen para la ficha: el último cambio («Bajó un 8 % el 17/11, antes 2,40 €/kg»)
 * o «El mismo precio desde el 15/11», y si hoy es el más bajo o el más alto.
 */
export function textosResumen(r: Resumen, unidad: Unidad): string[] {
  if (!r.actual) return ['Ya no está en la tienda.'];
  const textos: string[] = [];
  const c = r.ultimoCambio;
  if (c) {
    const verbo = c.ahoraRef < c.antesRef ? 'Bajó' : 'Subió';
    textos.push(
      `${verbo} un ${porcentaje(c.antesRef, c.ahoraRef)} % el ${textoDia(c.dia)} (antes, ${textoPrecioRef(c.antesRef, unidad)}).`,
    );
  } else {
    textos.push(`El mismo precio desde el ${textoDia(r.desde)}.`);
  }
  if (distinto(r.maximo, r.minimo)) {
    const hoy = r.actual.precioRef;
    if (!distinto(hoy, r.minimo)) textos.push(`Es el más bajo desde el ${textoDia(r.desde)}.`);
    else if (!distinto(hoy, r.maximo)) textos.push(`Es el más alto desde el ${textoDia(r.desde)}.`);
    else
      textos.push(
        `Desde el ${textoDia(r.desde)} ha estado entre ${textoPrecioRef(r.minimo, unidad)} y ${textoPrecioRef(r.maximo, unidad)}.`,
      );
  }
  return textos;
}

/** Cambios para la lista «Ver los cambios», del más reciente al más antiguo. */
export function textosCambios(puntos: readonly Punto[], unidad: Unidad): string[] {
  return [...puntos]
    .reverse()
    .map(([dia, precio, ref]) =>
      precio === null
        ? `${textoDia(dia)}: deja de estar en la tienda`
        : `${textoDia(dia)}: ${textoPrecio(precio)} (${textoPrecioRef(ref ?? 0, unidad)})`,
    );
}

const diasEntre = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** Un tramo de la gráfica: el precio que hubo desde `x1` hasta `x2`. */
export type Tramo = { x1: number; x2: number; y: number; dia: string; precioRef: number };

export type Grafica = {
  /** Tramos horizontales (escalones); entre dos tramos seguidos, un salto vertical. */
  tramos: Tramo[];
  /** Caminos SVG: uno por cada racha sin huecos (un hueco = días que no estuvo). */
  caminos: string[];
};

/**
 * Gráfica de escalones del precioRef en un lienzo de `ancho` × `alto`, desde el primer día
 * hasta hoy (incluido). El más alto va arriba (al 15 % del alto) y el más bajo abajo (al 85 %); si no ha
 * cambiado, la línea va por la mitad.
 */
export function graficaHistorial(
  puntos: readonly Punto[],
  hoy: string,
  ancho: number,
  alto: number,
): Grafica {
  const primero = puntos[0];
  if (!primero) return { tramos: [], caminos: [] };
  // Hoy también ocupa su día: así se ve un cambio de hoy.
  const total = diasEntre(primero[0], hoy) + 1;
  const refs = puntos.flatMap((p) => (p[1] === null ? [] : [p[2]]));
  const min = Math.min(...refs);
  const max = Math.max(...refs);
  const x = (dia: string) =>
    (Math.min(total, Math.max(0, diasEntre(primero[0], dia))) / total) * ancho;
  const y = (ref: number) =>
    max === min ? alto / 2 : alto * 0.85 - ((ref - min) / (max - min)) * alto * 0.7;
  const redondear = (n: number) => Math.round(n * 100) / 100;

  const tramos: Tramo[] = [];
  const caminos: string[] = [];
  let camino = '';
  puntos.forEach((p, i) => {
    const siguiente = puntos[i + 1]?.[0];
    if (p[1] === null) {
      if (camino) caminos.push(camino);
      camino = '';
      return;
    }
    const t: Tramo = {
      x1: redondear(x(p[0])),
      // El último llega hasta hoy, al borde derecho.
      x2: siguiente ? redondear(Math.max(x(siguiente), x(p[0]))) : ancho,
      y: redondear(y(p[2])),
      dia: p[0],
      precioRef: p[2],
    };
    tramos.push(t);
    camino += camino ? ` V${t.y} H${t.x2}` : `M${t.x1} ${t.y} H${t.x2}`;
  });
  if (camino) caminos.push(camino);
  return { tramos, caminos };
}

/**
 * El tramo que hay en una posición x de la gráfica (para tocarla y ver el precio). Antes del
 * primero, el primero; en un hueco (días que no estuvo), ninguno.
 */
export function tramoEn(tramos: readonly Tramo[], x: number): Tramo | null {
  let elegido = tramos[0] ?? null;
  for (const t of tramos) if (t.x1 <= x) elegido = t;
  return elegido && x > elegido.x2 ? null : elegido;
}
