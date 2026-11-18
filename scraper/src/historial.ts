/**
 * Historial de precios de Mercadona y Consum (data/historial/). Por cada producto se apunta su
 * precio y su precioRef solo los días en que cambian, y `null` el día que deja de estar en el
 * catálogo. Cada tienda se reparte en 10 trozos según el último carácter del id, para que la
 * app descargue solo el trozo del producto que mira. Funciones puras, salvo leer y escribir.
 */
import type { Producto, Tienda } from './tipos.ts';

/** Un cambio: [día AAAA-MM-DD en España, precio, precioRef], o [día, null] si deja de estar. */
export type Punto = [string, number, number] | [string, null];
/** Historial de una tienda: los puntos de cada producto, por su id, del más antiguo al último. */
export type Historial = Map<string, Punto[]>;

/** Tiendas con historial: las que tienen catálogo completo (las ofertas de Lidl ya son bajadas). */
export const TIENDAS_HISTORIAL = ['mercadona', 'consum'] as const satisfies readonly Tienda[];
export type TiendaHistorial = (typeof TIENDAS_HISTORIAL)[number];

export const TROZOS = 10;
/** Días que se guardan: lo anterior se resume en el último precio antes de ese plazo. */
export const DIAS_GUARDADOS = 400;
/** Días que dura el resumen del último cambio en app.json. */
export const DIAS_CAMBIO_RECIENTE = 30;

/**
 * Trozo donde va un producto: el código del último carácter de su id, módulo 10 (los ids
 * acaban casi siempre en una cifra, así que se reparten por igual). La app usa la misma regla.
 */
export const trozoDe = (id: string): number => id.charCodeAt(id.length - 1) % TROZOS;

export const nombreTrozo = (tienda: TiendaHistorial, trozo: number) =>
  `historial/${tienda}-${trozo}.json`;

/** Fecha AAAA-MM-DD en hora de España ("en-CA" escribe las fechas en ese orden). */
const fechaEspana = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: 'Europe/Madrid',
});
export const diaEspana = (iso: string): string => fechaEspana.format(Date.parse(iso));

/** Suma (o resta) días a una fecha AAAA-MM-DD. */
export function sumarDias(dia: string, dias: number): string {
  const fecha = new Date(`${dia}T12:00:00Z`);
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha.toISOString().slice(0, 10);
}

const iguales = (a: Punto | undefined, b: Punto): boolean =>
  a !== undefined && a[1] === b[1] && (a[1] === null || a[2] === b[2]);

/**
 * Si la cantidad del envase (precio ÷ precioRef) se multiplica o se divide por esto o más, no
 * es un cambio de precio sino de medida: el precioRef pasa a ir en otra unidad o se calcula de
 * otra forma (p. ej. el 17/11/2026 los detergentes pasaron de €/l a €/lavado y el café en
 * cápsulas, de €/ud. a €/kg). La carne en bandeja (unos gramos más o menos) y los envases que
 * encogen un poco quedan muy por debajo.
 */
export const CAMBIO_DE_MEDIDA = 1.5;

/** Cantidad del envase en la unidad del precioRef, o null si no se puede saber. */
const cantidadDe = (p: Punto | undefined) =>
  p && p[1] !== null && p[1] > 0 && p[2] > 0 ? p[1] / p[2] : null;

/** ¿Ha cambiado la medida entre el último precio apuntado y el nuevo? */
function cambiaLaMedida(puntos: readonly Punto[], nuevo: Punto): boolean {
  const antes = cantidadDe(puntos.findLast((p) => p[1] !== null));
  const ahora = cantidadDe(nuevo);
  return (
    antes !== null && ahora !== null && Math.max(antes / ahora, ahora / antes) >= CAMBIO_DE_MEDIDA
  );
}

/**
 * Añade un punto el día indicado si cambia algo; si ya hay uno de ese día, lo sustituye. Si
 * cambia la medida, el historial vuelve a empezar ese día: los precios de antes no se pueden
 * comparar con los nuevos.
 */
function anotar(puntos: Punto[], nuevo: Punto): Punto[] {
  const ultimo = puntos.at(-1);
  if (ultimo && ultimo[0] > nuevo[0]) return puntos; // nunca se reescribe el pasado
  const previos = ultimo?.[0] === nuevo[0] ? puntos.slice(0, -1) : puntos;
  if (cambiaLaMedida(previos, nuevo)) return [nuevo];
  return iguales(previos.at(-1), nuevo) ? previos : [...previos, nuevo];
}

/**
 * Quita los puntos de hace más de `DIAS_GUARDADOS`, salvo el último anterior a ese plazo (el
 * precio que había entonces). Si eso deja solo un «ya no está», el producto se olvida.
 */
function recortar(puntos: Punto[], limite: string): Punto[] {
  const viejos = puntos.filter((p) => p[0] < limite).length;
  const recortados = viejos > 1 ? puntos.slice(viejos - 1) : puntos;
  return recortados.length === 1 && recortados[0]?.[1] === null && recortados[0][0] < limite
    ? []
    : recortados;
}

/**
 * Apunta en el historial los precios de un día. Los productos que no vienen ese día reciben un
 * punto «ya no está» (una sola vez). Devuelve un historial nuevo.
 */
export function anotarDia(historial: Historial, productos: readonly Producto[], dia: string) {
  const nuevo: Historial = new Map();
  const hoy = new Map(productos.map((p) => [p.id, p]));
  const limite = sumarDias(dia, -DIAS_GUARDADOS);
  for (const id of new Set([...historial.keys(), ...hoy.keys()])) {
    const p = hoy.get(id);
    const anteriores = historial.get(id) ?? [];
    const punto: Punto = p ? [dia, p.precio, p.precioRef] : [dia, null];
    const puntos = recortar(p || anteriores.length > 0 ? anotar(anteriores, punto) : [], limite);
    if (puntos.length > 0) nuevo.set(id, puntos);
  }
  return nuevo;
}

/** Último cambio de precio de un producto, para los avisos de bajadas de la app. */
export type Cambio = {
  /** Día en que cambió el precio. */
  dia: string;
  /** Precio y precioRef de antes de ese día. */
  antes: number;
  antesRef: number;
};

/**
 * Último cambio de precio o de precioRef de un producto, si es de los últimos
 * `DIAS_CAMBIO_RECIENTE` días y antes tenía precio (no cuenta volver al catálogo).
 */
export function cambioReciente(puntos: readonly Punto[] | undefined, dia: string): Cambio | null {
  if (!puntos || puntos.length < 2) return null;
  const ultimo = puntos.at(-1);
  const previo = puntos.at(-2);
  if (!ultimo || !previo || ultimo[1] === null || previo[1] === null) return null;
  if (ultimo[0] < sumarDias(dia, -DIAS_CAMBIO_RECIENTE)) return null;
  return { dia: ultimo[0], antes: previo[1], antesRef: previo[2] };
}

const esPunto = (x: unknown): x is Punto =>
  Array.isArray(x) &&
  typeof x[0] === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(x[0]) &&
  ((x.length === 2 && x[1] === null) ||
    (x.length === 3 && typeof x[1] === 'number' && typeof x[2] === 'number'));

/** Lee un trozo guardado; si no existe o no tiene la forma esperada, devuelve null. */
export function leerTrozo(datos: unknown): Historial | null {
  if (typeof datos !== 'object' || datos === null) return null;
  const productos = (datos as { productos?: unknown }).productos;
  if (typeof productos !== 'object' || productos === null) return null;
  const historial: Historial = new Map();
  for (const [id, puntos] of Object.entries(productos)) {
    if (!Array.isArray(puntos) || !puntos.every(esPunto)) return null;
    historial.set(id, puntos);
  }
  return historial;
}

/** Reparte el historial de una tienda en sus trozos, con un producto por línea y por id. */
export function serializarTrozos(tienda: TiendaHistorial, historial: Historial): string[] {
  const ids = [...historial.keys()].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
  const lineas: string[][] = Array.from({ length: TROZOS }, () => []);
  for (const id of ids) {
    lineas[trozoDe(id)]?.push(`${JSON.stringify(id)}:${JSON.stringify(historial.get(id))}`);
  }
  return lineas.map(
    (l) =>
      `{"tienda":${JSON.stringify(tienda)},"productos":{${l.length > 0 ? `\n${l.join(',\n')}\n` : ''}}}\n`,
  );
}
