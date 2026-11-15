/** Lectura y escritura de los archivos de /data. */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { construirApp, serializarApp } from './app.ts';
import { leerProductos, MetaSchema, type Meta } from './meta.ts';
import { TIENDAS, type Producto, type Tienda } from './tipos.ts';

export const DATOS = new URL('../../data/', import.meta.url);

export async function leerJson(nombre: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(new URL(nombre, DATOS), 'utf8'));
  } catch {
    return null;
  }
}

/** Escribe primero en un archivo temporal y luego lo renombra: nunca deja un archivo a medias. */
export async function escribir(nombre: string, contenido: string): Promise<void> {
  await mkdir(DATOS, { recursive: true });
  const temporal = new URL(`${nombre}.tmp`, DATOS);
  await writeFile(temporal, contenido, 'utf8');
  await rename(temporal, new URL(nombre, DATOS));
}

export async function leerMeta(): Promise<Meta | null> {
  const r = MetaSchema.safeParse(await leerJson('meta.json'));
  return r.success ? r.data : null;
}

/**
 * Regenera data/app.json a partir de los archivos completos guardados.
 * Si una tienda ha fallado hoy, sus productos son los del último día bueno.
 * Devuelve el tamaño del archivo en bytes.
 */
export async function actualizarApp(meta: Meta): Promise<number> {
  const porTienda: Partial<Record<Tienda, Producto[]>> = {};
  for (const tienda of TIENDAS) {
    const productos = leerProductos(await leerJson(`${tienda}.json`));
    if (productos) porTienda[tienda] = productos;
  }
  const contenido = serializarApp(construirApp(meta, porTienda));
  await escribir('app.json', contenido);
  return Buffer.byteLength(contenido);
}
