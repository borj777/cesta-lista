import { esDatosApp } from './estado.ts';
import type { DatosApp } from './tipos.ts';

export const URL_DATOS = `${import.meta.env.BASE_URL}data/app.json`;
const CACHE_DATOS = 'datos';
/** Si la descarga tarda más que esto, se usa la copia guardada en el iPhone. */
const ESPERA_MS = 20_000;

export type ResultadoCarga = {
  datos: DatosApp;
  /** true si son los precios guardados porque la descarga ha fallado. */
  guardados: boolean;
};

async function descargar(): Promise<DatosApp> {
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), ESPERA_MS);
  try {
    const respuesta = await fetch(URL_DATOS, { signal: controlador.signal });
    if (!respuesta.ok) throw new Error(`el servidor responde ${respuesta.status}`);
    const datos: unknown = await respuesta.json();
    if (!esDatosApp(datos)) throw new Error('el archivo no tiene el formato esperado');
    return datos;
  } finally {
    clearTimeout(temporizador);
  }
}

/** Lee la copia de los precios que guarda el service worker, sin pasar por la red. */
async function leerGuardados(): Promise<DatosApp | null> {
  if (!('caches' in window)) return null;
  try {
    const cache = await caches.open(CACHE_DATOS);
    const guardada =
      (await cache.match(new URL(URL_DATOS, location.href).href)) ?? (await cache.match(URL_DATOS));
    if (!guardada) return null;
    const datos: unknown = await guardada.json();
    return esDatosApp(datos) ? datos : null;
  } catch {
    return null;
  }
}

/**
 * Carga los precios (data/app.json). Si la descarga falla o tarda demasiado, usa la última
 * copia guardada en el iPhone, así que la app funciona también dentro del supermercado.
 */
export async function cargarDatos(): Promise<ResultadoCarga> {
  try {
    return { datos: await descargar(), guardados: false };
  } catch (error) {
    const guardados = await leerGuardados();
    if (guardados) return { datos: guardados, guardados: true };
    const motivo =
      error instanceof DOMException && error.name === 'AbortError'
        ? 'la descarga ha tardado demasiado'
        : error instanceof Error
          ? error.message
          : String(error);
    throw new Error(`No se han podido cargar los precios (${motivo}).`, { cause: error });
  }
}
