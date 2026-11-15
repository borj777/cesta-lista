import { readFileSync } from 'node:fs';
import type { OpcionesPeticion, Pedir, Respuesta } from '../src/http.ts';

export const AHORA = '2026-11-15T06:00:00.000Z';

/** Lee una respuesta real guardada en scraper/fixtures. */
export function fixture(nombre: string): unknown {
  return JSON.parse(readFileSync(new URL(`../fixtures/${nombre}`, import.meta.url), 'utf8'));
}

/** Respuesta falsa para los tests. */
export function respuesta(datos: unknown, cabeceras: Record<string, string> = {}): Respuesta {
  return { estado: 200, cabeceras: new Headers(cabeceras), datos };
}

/** Cliente falso que responde según la URL y apunta todas las peticiones. */
export function pedirFalso(responder: (url: string, opciones?: OpcionesPeticion) => Respuesta) {
  const llamadas: { url: string; opciones?: OpcionesPeticion }[] = [];
  const pedir: Pedir = async (url, opciones) => {
    llamadas.push(opciones ? { url, opciones } : { url });
    return responder(url, opciones);
  };
  return { pedir, llamadas };
}
