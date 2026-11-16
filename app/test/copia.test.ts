import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  cerrar,
  guardarAjuste,
  guardarNecesidad,
  guardarProducto,
  guardarTiendaPropia,
  leerTodo,
  listarNecesidades,
  reemplazarTodo,
  type ContenidoBD,
} from '../src/almacen.ts';
import { crearCopia, leerCopia, nombreArchivo, textoCopia, VERSION_COPIA } from '../src/copia.ts';
import { crearNecesidad, type Necesidad } from '../src/necesidades/modelo.ts';
import { crearLidl, crearTienda } from '../src/tiendas/modelo.ts';
import { crearProducto } from '../src/tiendas/productos.ts';

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

const lidl = crearLidl(AHORA);
const fruteria = crearTienda('Frutería', [lidl], AHORA, 'fruteria');
const lecheLidl = crearProducto(
  'lidl',
  { nombre: 'Leche semidesnatada', marca: 'Milbona', cantidad: 6, unidad: 'l', precio: 4.74 },
  AHORA,
  'leche-lidl',
);
const naranjas = crearProducto(
  'fruteria',
  { nombre: 'Naranjas', cantidad: 2, unidad: 'kg', precio: 2.5 },
  AHORA,
  'naranjas',
);
/** Un producto de Lidl tal como se guardaba en las copias de la versión 1 (sin tienda). */
const lecheLidlV1 = Object.fromEntries(
  Object.entries(lecheLidl).filter(([clave]) => clave !== 'tienda'),
);

/** Copia válida (versión 2) con las necesidades dadas, como texto. */
const copiaTexto = (necesidades: unknown[], extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    app: 'cesta-lista',
    version: 2,
    exportada: AHORA,
    necesidades,
    tiendas: [lidl, fruteria],
    productos: [],
    ajustes: {},
    ...extra,
  });

/** Copia de la versión 1 (solo con precios de Lidl), como texto. */
const copiaV1 = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    app: 'cesta-lista',
    version: 1,
    exportada: AHORA,
    necesidades: [],
    lidl: [],
    ajustes: {},
    ...extra,
  });

const vacio: ContenidoBD = { necesidades: [], tiendas: [], productos: [], ajustes: {} };

describe('leerCopia', () => {
  it('acepta una copia creada por la app', () => {
    const copia = crearCopia(
      {
        necesidades: [pollo, detergente],
        tiendas: [lidl, fruteria],
        productos: [lecheLidl, naranjas],
        ajustes: { tiendasApagadas: ['consum'] },
      },
      AHORA,
    );
    expect(copia.version).toBe(2);
    const leida = leerCopia(textoCopia(copia));
    expect(leida).toEqual({ ok: true, copia });
  });

  it('una copia de la versión 1 pasa los precios de Lidl a la tienda «Lidl»', () => {
    const conElegido = { ...pollo, equivalencias: { lidl: { id: 'leche-lidl' } } };
    const r = leerCopia(copiaV1({ necesidades: [conElegido], lidl: [lecheLidlV1] }));
    expect(r).toMatchObject({
      ok: true,
      copia: {
        necesidades: [conElegido],
        tiendas: [{ id: 'lidl', nombre: 'Lidl' }],
        productos: [lecheLidl],
      },
    });
  });

  it('acepta una copia sin la parte de Lidl ni ajustes (versiones antiguas)', () => {
    const texto = JSON.stringify({
      app: 'cesta-lista',
      version: 1,
      exportada: AHORA,
      necesidades: [pollo],
    });
    expect(leerCopia(texto)).toMatchObject({
      ok: true,
      copia: { tiendas: [{ id: 'lidl' }], productos: [], ajustes: {} },
    });
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
    const nombre = (mala as Necesidad).nombre.trim();
    expect(r).toEqual({
      ok: false,
      error: `La necesidad n.º 2${nombre ? ` («${nombre}»)` : ''} no es válida: ${motivo}.`,
    });
  });

  it('acepta y conserva los productos elegidos en cada tienda', () => {
    const conElegidos = {
      ...pollo,
      equivalencias: {
        mercadona: { id: '3819' },
        consum: { noCompro: true },
        fruteria: { id: 'naranjas' },
      },
    };
    const r = leerCopia(copiaTexto([conElegidos]));
    expect(r).toMatchObject({ ok: true, copia: { necesidades: [conElegidos] } });
  });

  it.each([
    ['una tienda que no existe', { carrefour: { id: '1' } }, 'la tienda «carrefour» no existe'],
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

  it('acepta y conserva las tiendas propias y sus productos', () => {
    const r = leerCopia(copiaTexto([pollo], { productos: [lecheLidl, naranjas] }));
    expect(r).toMatchObject({
      ok: true,
      copia: { tiendas: [lidl, fruteria], productos: [lecheLidl, naranjas] },
    });
  });

  it('rechaza un producto dañado y dice de qué tienda es', () => {
    const r = leerCopia(
      copiaTexto([pollo], { productos: [lecheLidl, { ...naranjas, precio: 0 }] }),
    );
    expect(r).toEqual({
      ok: false,
      error: 'El producto de Frutería n.º 2 («Naranjas») no es válido: el precio no es válido.',
    });
  });

  it('rechaza un producto de una tienda que no está en la copia', () => {
    const r = leerCopia(copiaTexto([], { productos: [{ ...naranjas, tienda: 'aldi' }] }));
    expect(r).toEqual({
      ok: false,
      error:
        'El producto de tus tiendas n.º 1 («Naranjas») no es válido: la tienda «aldi» no existe.',
    });
  });

  it('rechaza productos repetidos', () => {
    const r = leerCopia(copiaTexto([], { productos: [lecheLidl, lecheLidl] }));
    expect(r).toEqual({
      ok: false,
      error: 'El producto de Lidl n.º 2 («Leche semidesnatada») está repetido.',
    });
  });

  it('rechaza un precio de Lidl dañado en una copia de la versión 1', () => {
    const r = leerCopia(copiaV1({ lidl: [lecheLidlV1, { ...lecheLidlV1, id: 'x', precio: 0 }] }));
    expect(r).toEqual({
      ok: false,
      error:
        'El producto de Lidl n.º 2 («Leche semidesnatada») no es válido: el precio no es válido.',
    });
  });

  it.each([
    ['sin nombre', { ...fruteria, nombre: '' }, 'le falta el nombre'],
    [
      'con el id de Mercadona',
      { ...fruteria, id: 'mercadona' },
      'usa el identificador de Mercadona o Consum',
    ],
    ['con un color raro', { ...fruteria, color: 'rojo' }, 'el color no es válido'],
  ])('rechaza una tienda %s', (_caso, mala, motivo) => {
    const r = leerCopia(copiaTexto([], { tiendas: [lidl, mala] }));
    expect(r).toEqual({
      ok: false,
      error: `La tienda n.º 2${mala.nombre ? ` («${mala.nombre}»)` : ''} no es válida: ${motivo}.`,
    });
  });

  it('rechaza tiendas repetidas', () => {
    const r = leerCopia(copiaTexto([], { tiendas: [lidl, lidl] }));
    expect(r).toEqual({ ok: false, error: 'La tienda n.º 2 («Lidl») está repetida.' });
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
    await guardarTiendaPropia(fruteria);
    await guardarProducto(lecheLidl);
    await guardarProducto(naranjas);
    const texto = textoCopia(crearCopia(await leerTodo(), AHORA));

    // Se borra todo, como en un iPhone nuevo, y se importa la copia.
    await reemplazarTodo(vacio);
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
    expect(contenido.tiendas.map((t) => t.id).sort()).toEqual(['fruteria', 'lidl']);
    expect(contenido.productos.sort((a, b) => a.id.localeCompare(b.id))).toEqual([
      lecheLidl,
      naranjas,
    ]);
  });

  it('importar sustituye lo que había', async () => {
    await guardarNecesidad(pollo);
    await reemplazarTodo({ ...vacio, necesidades: [detergente] });
    expect(await listarNecesidades()).toEqual([detergente]);
  });

  it('si la importación falla, no se pierde nada de lo que había', async () => {
    await guardarNecesidad(pollo);
    // Una necesidad sin id hace fallar la operación a mitad.
    const rota = { ...detergente, id: undefined } as unknown as Necesidad;
    await expect(
      reemplazarTodo({ ...vacio, necesidades: [detergente, rota] }),
    ).rejects.toBeTruthy();
    expect(await listarNecesidades()).toEqual([pollo]);
  });
});
