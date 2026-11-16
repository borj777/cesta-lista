import { esDatosApp } from './estado.ts';
import type { DatosApp } from './tipos.ts';

const URL_DATOS = `${import.meta.env.BASE_URL}data/app.json`;

/**
 * Descarga los precios (data/app.json). Sin conexión, el service worker devuelve la última
 * copia guardada, así que la app sigue funcionando dentro del supermercado.
 */
export async function cargarDatos(): Promise<DatosApp> {
  const respuesta = await fetch(URL_DATOS);
  if (!respuesta.ok) throw new Error(`No se han podido cargar los precios (${respuesta.status}).`);
  const datos: unknown = await respuesta.json();
  if (!esDatosApp(datos)) throw new Error('El archivo de precios no tiene el formato esperado.');
  return datos;
}
