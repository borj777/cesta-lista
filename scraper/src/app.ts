import type { Meta } from './meta.ts';
import { seccionesUsadas } from './normalizar.ts';
import type { Producto, Tienda } from './tipos.ts';

/**
 * Campos que necesita la app. Se quedan fuera url e imagen, que son casi la mitad del peso
 * y solo hacen falta para enlazar o enseñar la foto (están en los archivos completos).
 */
export const CAMPOS_APP = [
  'tienda',
  'id',
  'ean',
  'nombre',
  'marca',
  'formato',
  'precio',
  'precioRef',
  'precioAnterior',
  'precioLidlPlus',
  'oferta',
  'ofertaDesde',
  'ofertaHasta',
  'seccion',
] as const satisfies readonly (keyof Producto)[];

export type ProductoApp = Pick<Producto, (typeof CAMPOS_APP)[number]>;

export type EstadoApp = { estado: 'ok' | 'fallida'; actualizado: string | null };

/** Contenido de data/app.json: lo único que descarga la app. */
export type DatosApp = {
  generado: string;
  /** Estado y fecha de los precios de cada tienda, para el aviso "precios de X del día DD/MM". */
  tiendas: Partial<Record<Tienda, EstadoApp>>;
  /** Nombre completo de cada sección usada, por tienda y por id. */
  secciones: Partial<Record<Tienda, Record<string, string>>>;
  productos: ProductoApp[];
};

/** Contenido de data/secciones.json: nombre de cada sección por tienda y por id. */
export type Secciones = Partial<Record<Tienda, Record<string, string>>>;

/** Orden fijo de las tiendas en el archivo, para que los commits sean estables. */
const ORDEN: Tienda[] = ['mercadona', 'consum', 'lidl'];

export function aProductoApp(p: Producto): ProductoApp {
  const app: Partial<Record<keyof Producto, unknown>> = {};
  for (const campo of CAMPOS_APP) {
    if (p[campo] !== undefined) app[campo] = p[campo];
  }
  return app as ProductoApp;
}

export function construirApp(
  meta: Meta,
  porTienda: Partial<Record<Tienda, Producto[]>>,
  nombres: Secciones = {},
): DatosApp {
  const tiendas: DatosApp['tiendas'] = {};
  const secciones: DatosApp['secciones'] = {};
  const productos: ProductoApp[] = [];
  for (const tienda of ORDEN) {
    const estado = meta.tiendas[tienda];
    if (estado) tiendas[tienda] = { estado: estado.estado, actualizado: estado.actualizado };
    const lista = [...(porTienda[tienda] ?? [])].sort((a, b) =>
      a.id.localeCompare(b.id, 'es', { numeric: true }),
    );
    productos.push(...lista.map(aProductoApp));
    const usadas = seccionesUsadas(lista, nombres[tienda] ?? {});
    if (Object.keys(usadas).length > 0) secciones[tienda] = usadas;
  }
  return { generado: meta.generado, tiendas, secciones, productos };
}

/** JSON con un producto por línea, como los archivos completos. */
export function serializarApp(datos: DatosApp): string {
  const cabecera = JSON.stringify({
    generado: datos.generado,
    tiendas: datos.tiendas,
    secciones: datos.secciones,
  });
  const lineas = datos.productos.map((p) => JSON.stringify(p)).join(',\n');
  return `${cabecera.slice(0, -1)},"productos":[\n${lineas}\n]}\n`;
}

/**
 * Fotos de los productos para la app (data/imagenes.json), aparte de app.json para que la
 * lista de precios cargue rápido: la app solo lo descarga al elegir productos.
 * Un producto por línea, como los demás archivos, para que los commits sean pequeños.
 */
export function serializarImagenes(
  generado: string,
  porTienda: Partial<Record<Tienda, Producto[]>>,
): string {
  const partes: string[] = [];
  for (const tienda of ORDEN) {
    const lineas = [...(porTienda[tienda] ?? [])]
      .filter((p) => p.imagen)
      .sort((a, b) => a.id.localeCompare(b.id, 'es', { numeric: true }))
      .map((p) => `${JSON.stringify(p.id)}:${JSON.stringify(p.imagen)}`);
    if (lineas.length > 0) partes.push(`${JSON.stringify(tienda)}:{\n${lineas.join(',\n')}\n}`);
  }
  return `{"generado":${JSON.stringify(generado)},"imagenes":{\n${partes.join(',\n')}\n}}\n`;
}

/**
 * Junta los nombres de secciones de hoy con los guardados: si hoy falta alguno (p. ej. porque
 * el árbol de Consum no ha respondido), se conserva el de otros días.
 */
export function unirSecciones(
  guardadas: Secciones,
  tienda: Tienda,
  nuevas: Record<string, string> | undefined,
): Secciones {
  const todas = { ...guardadas[tienda], ...nuevas };
  const ordenadas = Object.fromEntries(
    Object.entries(todas).sort(([a], [b]) => a.localeCompare(b, 'es', { numeric: true })),
  );
  return { ...guardadas, [tienda]: ordenadas };
}

/** data/secciones.json con una sección por línea, para que los commits sean pequeños. */
export function serializarSecciones(secciones: Secciones): string {
  const partes: string[] = [];
  for (const tienda of ORDEN) {
    const lineas = Object.entries(secciones[tienda] ?? {}).map(
      ([id, nombre]) => `${JSON.stringify(id)}:${JSON.stringify(nombre)}`,
    );
    if (lineas.length > 0) partes.push(`${JSON.stringify(tienda)}:{\n${lineas.join(',\n')}\n}`);
  }
  return `{\n${partes.join(',\n')}\n}\n`;
}

/** Lee data/secciones.json; si no existe o no es válido, devuelve un objeto vacío. */
export function leerSecciones(datos: unknown): Secciones {
  if (typeof datos !== 'object' || datos === null) return {};
  const secciones: Secciones = {};
  for (const tienda of ORDEN) {
    const mapa = (datos as Record<string, unknown>)[tienda];
    if (typeof mapa !== 'object' || mapa === null) continue;
    secciones[tienda] = Object.fromEntries(
      Object.entries(mapa).filter((e): e is [string, string] => typeof e[1] === 'string'),
    );
  }
  return secciones;
}
