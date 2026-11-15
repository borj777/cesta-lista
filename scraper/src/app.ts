import type { Meta } from './meta.ts';
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
  'oferta',
  'ofertaHasta',
] as const satisfies readonly (keyof Producto)[];

export type ProductoApp = Pick<Producto, (typeof CAMPOS_APP)[number]>;

export type EstadoApp = { estado: 'ok' | 'fallida'; actualizado: string | null };

/** Contenido de data/app.json: lo único que descarga la app. */
export type DatosApp = {
  generado: string;
  /** Estado y fecha de los precios de cada tienda, para el aviso "precios de X del día DD/MM". */
  tiendas: Partial<Record<Tienda, EstadoApp>>;
  productos: ProductoApp[];
};

/** Orden fijo de las tiendas en el archivo, para que los commits sean estables. */
const ORDEN: Tienda[] = ['mercadona', 'consum', 'lidl'];

export function aProductoApp(p: Producto): ProductoApp {
  const app: Partial<Record<keyof Producto, unknown>> = {};
  for (const campo of CAMPOS_APP) {
    if (p[campo] !== undefined) app[campo] = p[campo];
  }
  return app as ProductoApp;
}

export function construirApp(meta: Meta, porTienda: Partial<Record<Tienda, Producto[]>>): DatosApp {
  const tiendas: DatosApp['tiendas'] = {};
  const productos: ProductoApp[] = [];
  for (const tienda of ORDEN) {
    const estado = meta.tiendas[tienda];
    if (estado) tiendas[tienda] = { estado: estado.estado, actualizado: estado.actualizado };
    const lista = [...(porTienda[tienda] ?? [])].sort((a, b) =>
      a.id.localeCompare(b.id, 'es', { numeric: true }),
    );
    productos.push(...lista.map(aProductoApp));
  }
  return { generado: meta.generado, tiendas, productos };
}

/** JSON con un producto por línea, como los archivos completos. */
export function serializarApp(datos: DatosApp): string {
  const cabecera = JSON.stringify({ generado: datos.generado, tiendas: datos.tiendas });
  const lineas = datos.productos.map((p) => JSON.stringify(p)).join(',\n');
  return `${cabecera.slice(0, -1)},"productos":[\n${lineas}\n]}\n`;
}
