/** Lectura y escritura de los archivos de /data. */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { construirApp, leerSecciones, serializarApp, serializarImagenes } from './app.ts';
import {
  leerTrozo,
  nombreTrozo,
  serializarTrozos,
  TIENDAS_HISTORIAL,
  TROZOS,
  type Historial,
  type TiendaHistorial,
} from './historial.ts';
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
  const destino = new URL(nombre, DATOS);
  await mkdir(new URL('.', destino), { recursive: true });
  const temporal = new URL(`${nombre}.tmp`, DATOS);
  await writeFile(temporal, contenido, 'utf8');
  await rename(temporal, destino);
}

/** Lee todos los trozos del historial de una tienda (los que falten o estén mal, vacíos). */
export async function leerHistorial(tienda: TiendaHistorial): Promise<Historial> {
  const historial: Historial = new Map();
  for (let trozo = 0; trozo < TROZOS; trozo++) {
    const leido = leerTrozo(await leerJson(nombreTrozo(tienda, trozo)));
    for (const [id, puntos] of leido ?? []) historial.set(id, puntos);
  }
  return historial;
}

export async function escribirHistorial(
  tienda: TiendaHistorial,
  historial: Historial,
): Promise<void> {
  const trozos = serializarTrozos(tienda, historial);
  for (const [trozo, contenido] of trozos.entries()) {
    await escribir(nombreTrozo(tienda, trozo), contenido);
  }
}

export async function leerMeta(): Promise<Meta | null> {
  const r = MetaSchema.safeParse(await leerJson('meta.json'));
  return r.success ? r.data : null;
}

/**
 * Regenera data/app.json y data/imagenes.json a partir de los archivos completos guardados.
 * Si una tienda ha fallado hoy, sus productos son los del último día bueno. Los productos que
 * han cambiado de precio hace poco llevan el precio de antes (del historial).
 * Devuelve el tamaño del archivo en bytes.
 */
export async function actualizarApp(meta: Meta): Promise<number> {
  const porTienda: Partial<Record<Tienda, Producto[]>> = {};
  for (const tienda of TIENDAS) {
    const productos = leerProductos(await leerJson(`${tienda}.json`));
    if (productos) porTienda[tienda] = productos;
  }
  const secciones = leerSecciones(await leerJson('secciones.json'));
  const historiales: Partial<Record<Tienda, Historial>> = {};
  for (const tienda of TIENDAS_HISTORIAL) historiales[tienda] = await leerHistorial(tienda);
  const contenido = serializarApp(construirApp(meta, porTienda, secciones, historiales));
  await escribir('app.json', contenido);
  await escribir('imagenes.json', serializarImagenes(meta.generado, porTienda));
  return Buffer.byteLength(contenido);
}
