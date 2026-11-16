import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  cerrar,
  guardarAjuste,
  guardarNecesidad,
  leerTodo,
  listarNecesidades,
  reemplazarTodo,
} from '../src/almacen.ts';
import { crearCopia, leerCopia, nombreArchivo, textoCopia, VERSION_COPIA } from '../src/copia.ts';
import { crearNecesidad, type Necesidad } from '../src/necesidades/modelo.ts';

const AHORA = '2026-11-16T10:00:00.000Z';

const pollo = crearNecesidad(
  {
    nombre: 'Pechuga de pollo',
    categoria: 'alimentacion',
    cantidad: 1.5,
    unidad: 'kg',
    frecuencia: 'semana',
  },
  AHORA,
  'pollo',
);
const detergente = crearNecesidad(
  {
    nombre: 'Detergente',
    categoria: 'limpieza',
    cantidad: 50,
    unidad: 'lavado',
    frecuencia: 'mes',
    notas: 'líquido',
  },
  AHORA,
  'detergente',
);

/** Copia válida con las necesidades dadas, como texto. */
const copiaTexto = (necesidades: unknown[], extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    app: 'cesta-lista',
    version: 1,
    exportada: AHORA,
    necesidades,
    lidl: [],
    ajustes: {},
    ...extra,
  });

describe('leerCopia', () => {
  it('acepta una copia creada por la app', () => {
    const copia = crearCopia({ necesidades: [pollo, detergente], lidl: [], ajustes: {} }, AHORA);
    const leida = leerCopia(textoCopia(copia));
    expect(leida).toEqual({ ok: true, copia });
  });

  it('acepta una copia sin la parte de Lidl ni ajustes (versiones antiguas)', () => {
    const texto = JSON.stringify({
      app: 'cesta-lista',
      version: 1,
      exportada: AHORA,
      necesidades: [pollo],
    });
    expect(leerCopia(texto)).toMatchObject({ ok: true, copia: { lidl: [], ajustes: {} } });
  });

  it.each([
    ['un archivo que no es JSON', 'hola', 'no se puede leer'],
    ['un JSON de otra app', JSON.stringify({ app: 'otra' }), 'no es una copia de seguridad'],
    ['una copia sin versión', JSON.stringify({ app: 'cesta-lista' }), 'no indica su versión'],
    [
      'una copia de una versión más nueva',
      copiaTexto([], { version: VERSION_COPIA + 1 }),
      'versión más nueva',
    ],
    ['una copia sin necesidades', copiaTexto([], { necesidades: 'x' }), 'no contiene la lista'],
  ])('rechaza %s', (_caso, texto, mensaje) => {
    const r = leerCopia(texto);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain(mensaje);
  });

  it.each([
    ['sin nombre', { ...pollo, nombre: ' ' }, 'le falta el nombre'],
    ['con cantidad negativa', { ...pollo, cantidad: -1 }, 'la cantidad no es válida'],
    ['con cantidad en texto', { ...pollo, cantidad: '1,5' }, 'la cantidad no es válida'],
    ['con una unidad desconocida', { ...pollo, unidad: 'docena' }, 'la unidad no es válida'],
    ['con una categoría desconocida', { ...pollo, categoria: 'ropa' }, 'la categoría no es válida'],
    [
      'con una frecuencia desconocida',
      { ...pollo, frecuencia: 'año' },
      'la frecuencia no es válida',
    ],
    ['sin fechas', { ...pollo, creada: 'ayer' }, 'las fechas no son válidas'],
  ])('rechaza una necesidad %s y dice cuál es', (_caso, mala, motivo) => {
    const r = leerCopia(copiaTexto([detergente, mala]));
    expect(r).toEqual({
      ok: false,
      error: `La necesidad n.º 2 («${(mala as Necesidad).nombre}») no es válida: ${motivo}.`,
    });
  });

  it('acepta y conserva los productos elegidos en cada tienda', () => {
    const conElegidos = {
      ...pollo,
      equivalencias: { mercadona: { id: '3819' }, consum: { noCompro: true } },
    };
    const r = leerCopia(copiaTexto([conElegidos]));
    expect(r).toMatchObject({ ok: true, copia: { necesidades: [conElegidos] } });
  });

  it.each([
    ['una tienda desconocida', { carrefour: { id: '1' } }, 'la tienda «carrefour» no es válida'],
    [
      'un producto sin id',
      { mercadona: { id: '' } },
      'el producto elegido en mercadona no es válido',
    ],
    ['un valor raro', { consum: { noCompro: 'sí' } }, 'el producto elegido en consum no es válido'],
    ['algo que no es un objeto', 'mercadona', 'los productos elegidos no son válidos'],
  ])('rechaza productos elegidos con %s', (_caso, equivalencias, motivo) => {
    const r = leerCopia(copiaTexto([{ ...pollo, equivalencias }]));
    expect(r).toEqual({
      ok: false,
      error: `La necesidad n.º 1 («Pechuga de pollo») no es válida: ${motivo}.`,
    });
  });

  it('rechaza necesidades repetidas', () => {
    const r = leerCopia(copiaTexto([pollo, pollo]));
    expect(r).toEqual({
      ok: false,
      error: 'La necesidad n.º 2 («Pechuga de pollo») está repetida.',
    });
  });

  it('pone la fecha de hoy en el nombre del archivo', () => {
    expect(nombreArchivo(new Date('2026-11-16T23:30:00Z'))).toBe(
      'cesta-lista-copia-2026-11-17.json',
    );
  });
});

describe('exportar e importar con la base de datos', () => {
  beforeEach(async () => {
    await cerrar();
    indexedDB.deleteDatabase('cesta-lista');
  });
  afterEach(async () => {
    await cerrar();
  });

  it('una copia exportada se importa y deja los datos exactamente igual', async () => {
    await guardarNecesidad(pollo);
    await guardarNecesidad(detergente);
    await guardarAjuste('costeVisita', 2);
    const texto = textoCopia(crearCopia(await leerTodo(), AHORA));

    // Se borra todo, como en un iPhone nuevo, y se importa la copia.
    await reemplazarTodo({ necesidades: [], lidl: [], ajustes: {} });
    expect(await listarNecesidades()).toEqual([]);

    const leida = leerCopia(texto);
    if (!leida.ok) throw new Error(leida.error);
    await reemplazarTodo(leida.copia);

    const contenido = await leerTodo();
    expect(contenido.necesidades.sort((a, b) => a.id.localeCompare(b.id))).toEqual([
      detergente,
      pollo,
    ]);
    expect(contenido.ajustes).toEqual({ costeVisita: 2 });
  });

  it('importar sustituye lo que había', async () => {
    await guardarNecesidad(pollo);
    await reemplazarTodo({ necesidades: [detergente], lidl: [], ajustes: {} });
    expect(await listarNecesidades()).toEqual([detergente]);
  });

  it('si la importación falla, no se pierde nada de lo que había', async () => {
    await guardarNecesidad(pollo);
    // Una necesidad sin id hace fallar la operación a mitad.
    const rota = { ...detergente, id: undefined } as unknown as Necesidad;
    await expect(
      reemplazarTodo({ necesidades: [detergente, rota], lidl: [], ajustes: {} }),
    ).rejects.toBeTruthy();
    expect(await listarNecesidades()).toEqual([pollo]);
  });
});
