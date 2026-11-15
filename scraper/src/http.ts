import { ErrorFormato } from './tipos.ts';

/** Identifica el scraper ante las tiendas, con un enlace al repositorio público. */
export const USER_AGENT =
  'CestaLista/1.0 (uso personal; una pasada al día; +https://github.com/borj777/cesta-lista)';

export type Respuesta = { estado: number; cabeceras: Headers; datos: unknown };
export type OpcionesPeticion = { metodo?: 'GET' | 'PUT'; cuerpo?: unknown };
export type Pedir = (url: string, opciones?: OpcionesPeticion) => Promise<Respuesta>;

/** La tienda ha respondido con un error o no ha respondido. */
export class ErrorHttp extends Error {
  override name = 'ErrorHttp';
  estado: number;
  constructor(mensaje: string, estado: number) {
    super(mensaje);
    this.estado = estado;
  }
}

export type OpcionesCliente = {
  /** Pausa mínima y máxima entre peticiones (aleatoria dentro del intervalo). */
  pausaMinMs?: number;
  pausaMaxMs?: number;
  /** Reintentos ante fallos pasajeros (sin conexión, 429 o 5xx). */
  reintentos?: number;
  /** Primera espera antes de reintentar; se duplica en cada intento. */
  esperaBaseMs?: number;
  timeoutMs?: number;
  fetch?: typeof fetch;
  esperar?: (ms: number) => Promise<void>;
  azar?: () => number;
};

export type Cliente = { pedir: Pedir; readonly peticiones: number };

const dormir = (ms: number) => new Promise<void>((resolver) => setTimeout(resolver, ms));

/**
 * Cliente HTTP respetuoso: una petición cada vez, con una pausa de 1 a 2 s entre ellas,
 * reintentos con espera creciente (2 s, 4 s, 8 s) y User-Agent identificable.
 */
export function crearCliente(opciones: OpcionesCliente = {}): Cliente {
  const {
    pausaMinMs = 1000,
    pausaMaxMs = 2000,
    reintentos = 3,
    esperaBaseMs = 2000,
    timeoutMs = 30_000,
    fetch: hacerFetch = globalThis.fetch,
    esperar = dormir,
    azar = Math.random,
  } = opciones;
  let peticiones = 0;

  const pedir: Pedir = async (url, { metodo = 'GET', cuerpo } = {}) => {
    for (let intento = 0; ; intento++) {
      if (peticiones > 0) await esperar(pausaMinMs + azar() * (pausaMaxMs - pausaMinMs));
      peticiones++;

      let respuesta: Response;
      try {
        respuesta = await hacerFetch(url, {
          method: metodo,
          headers: {
            'User-Agent': USER_AGENT,
            Accept: 'application/json',
            'Accept-Language': 'es-ES,es;q=0.9',
            ...(cuerpo === undefined ? {} : { 'Content-Type': 'application/json' }),
          },
          body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        if (intento < reintentos) {
          await esperar(esperaBaseMs * 2 ** intento);
          continue;
        }
        const motivo = error instanceof Error ? error.message : String(error);
        throw new ErrorHttp(`Sin respuesta de ${url} tras ${intento + 1} intentos (${motivo})`, 0);
      }

      if (respuesta.status === 429 || respuesta.status >= 500) {
        if (intento < reintentos) {
          const pideEsperar = Number(respuesta.headers.get('retry-after')) * 1000 || 0;
          await esperar(Math.min(Math.max(esperaBaseMs * 2 ** intento, pideEsperar), 60_000));
          continue;
        }
        throw new ErrorHttp(
          `${url} responde ${respuesta.status} tras ${intento + 1} intentos`,
          respuesta.status,
        );
      }
      if (!respuesta.ok) {
        throw new ErrorHttp(`${url} responde ${respuesta.status}`, respuesta.status);
      }

      const texto = await respuesta.text();
      let datos: unknown;
      try {
        datos = texto ? JSON.parse(texto) : null;
      } catch {
        throw new ErrorFormato(`${url} no devuelve JSON (¿página de bloqueo?)`);
      }
      return { estado: respuesta.status, cabeceras: respuesta.headers, datos };
    }
  };

  return {
    pedir,
    get peticiones() {
      return peticiones;
    },
  };
}
