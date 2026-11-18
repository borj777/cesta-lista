import { describe, expect, it } from 'vitest';
import { crearCliente, ErrorHttp, USER_AGENT } from '../src/http.ts';
import { ErrorFormato } from '../src/tipos.ts';

function preparar(respuestas: (Response | Error)[]) {
  const esperas: number[] = [];
  const peticiones: { url: string; init: RequestInit | undefined }[] = [];
  const cola = [...respuestas];
  const cliente = crearCliente({
    fetch: async (url, init) => {
      peticiones.push({ url: String(url), init });
      const siguiente = cola.shift();
      if (!siguiente) throw new Error('No quedan respuestas preparadas');
      if (siguiente instanceof Error) throw siguiente;
      return siguiente;
    },
    esperar: async (ms) => {
      esperas.push(ms);
    },
    azar: () => 0.5,
  });
  return { cliente, esperas, peticiones };
}

const json = (datos: unknown, estado = 200) =>
  new Response(JSON.stringify(datos), {
    status: estado,
    headers: { 'Content-Type': 'application/json' },
  });

describe('cliente HTTP', () => {
  it('se identifica con el User-Agent y pide JSON', async () => {
    const { cliente, peticiones } = preparar([json({ ok: 1 })]);
    const r = await cliente.pedir('https://ejemplo.test/a');
    expect(r.datos).toEqual({ ok: 1 });
    const cabeceras = peticiones[0]?.init?.headers as Record<string, string>;
    expect(cabeceras['User-Agent']).toBe(USER_AGENT);
    expect(cabeceras['Accept']).toBe('application/json');
  });

  it('puede pedir una página HTML y devolverla como texto', async () => {
    const html = new Response('<html>hola</html>', { headers: { 'Content-Type': 'text/html' } });
    const { cliente, peticiones } = preparar([html]);
    const r = await cliente.pedir('https://ejemplo.test/a', { como: 'texto' });
    expect(r.datos).toBe('<html>hola</html>');
    const cabeceras = peticiones[0]?.init?.headers as Record<string, string>;
    expect(cabeceras['Accept']).toBe('text/html');
  });

  it('hace una pausa de 1 a 2 s entre peticiones, pero no antes de la primera', async () => {
    const { cliente, esperas } = preparar([json(1), json(2), json(3)]);
    await cliente.pedir('https://ejemplo.test/1');
    await cliente.pedir('https://ejemplo.test/2');
    await cliente.pedir('https://ejemplo.test/3');
    expect(esperas).toEqual([1500, 1500]);
    expect(cliente.peticiones).toBe(3);
  });

  it('reintenta los errores 5xx con espera creciente', async () => {
    const { cliente, esperas } = preparar([json({}, 503), json({}, 502), json({ ok: 1 })]);
    const r = await cliente.pedir('https://ejemplo.test/a');
    expect(r.datos).toEqual({ ok: 1 });
    // Pausa normal + espera de reintento (2 s, luego 4 s).
    expect(esperas).toEqual([2000, 1500, 4000, 1500]);
  });

  it('reintenta si no hay conexión y se rinde tras 4 intentos', async () => {
    const fallo = new Error('ECONNRESET');
    const { cliente } = preparar([fallo, fallo, fallo, fallo]);
    await expect(cliente.pedir('https://ejemplo.test/a')).rejects.toBeInstanceOf(ErrorHttp);
    expect(cliente.peticiones).toBe(4);
  });

  it('no reintenta un 404', async () => {
    const { cliente } = preparar([json({}, 404)]);
    await expect(cliente.pedir('https://ejemplo.test/a')).rejects.toMatchObject({ estado: 404 });
    expect(cliente.peticiones).toBe(1);
  });

  it('detecta una página HTML en lugar de JSON (posible bloqueo)', async () => {
    const { cliente } = preparar([new Response('<html>Acceso denegado</html>', { status: 200 })]);
    await expect(cliente.pedir('https://ejemplo.test/a')).rejects.toBeInstanceOf(ErrorFormato);
  });

  it('envía el cuerpo en JSON en las peticiones PUT', async () => {
    const { cliente, peticiones } = preparar([json({})]);
    await cliente.pedir('https://ejemplo.test/a', { metodo: 'PUT', cuerpo: { a: 1 } });
    expect(peticiones[0]?.init?.method).toBe('PUT');
    expect(peticiones[0]?.init?.body).toBe('{"a":1}');
  });
});
