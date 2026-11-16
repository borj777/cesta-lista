import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AJUSTE_APAGADAS,
  borrarTiendaPropia,
  cerrar,
  guardarAjuste,
  guardarNecesidad,
  guardarProducto,
  guardarTiendaPropia,
  leerAjuste,
  leerTodo,
  listarNecesidades,
  listarProductos,
  listarTiendas,
} from '../src/almacen.ts';
import { crearNecesidad } from '../src/necesidades/modelo.ts';
import {
  COLORES,
  colorLibre,
  crearLidl,
  crearTienda,
  leerApagadas,
  listaTiendas,
  problemaTienda,
  renombrarTienda,
  validarNombreTienda,
} from '../src/tiendas/modelo.ts';
import { crearProducto } from '../src/tiendas/productos.ts';

const AHORA = '2026-11-16T10:00:00.000Z';
const LUEGO = '2026-11-17T10:00:00.000Z';
const lidl = crearLidl(AHORA);
const fruteria = crearTienda(' Frutería del barrio ', [lidl], LUEGO, 'fruteria');

describe('tiendas', () => {
  it('Lidl viene creada con el id de las versiones anteriores', () => {
    expect(lidl).toEqual({ id: 'lidl', nombre: 'Lidl', color: COLORES[0], creada: AHORA });
  });

  it('una tienda nueva lleva el primer color libre y el nombre sin espacios de más', () => {
    expect(fruteria).toEqual({
      id: 'fruteria',
      nombre: 'Frutería del barrio',
      color: COLORES[1],
      creada: LUEGO,
    });
    expect(colorLibre([fruteria])).toBe(COLORES[0]);
    expect(renombrarTienda(fruteria, ' Frutas Paco ')).toEqual({
      ...fruteria,
      nombre: 'Frutas Paco',
    });
  });

  it('pone primero Mercadona y Consum y luego las propias por fecha, y marca las apagadas', () => {
    expect(listaTiendas([fruteria, lidl], ['consum', 'fruteria'])).toEqual([
      { id: 'mercadona', nombre: 'Mercadona', color: '#3e8e2f', automatica: true, activa: true },
      { id: 'consum', nombre: 'Consum', color: '#e0612b', automatica: true, activa: false },
      { id: 'lidl', nombre: 'Lidl', color: COLORES[0], automatica: false, activa: true },
      {
        id: 'fruteria',
        nombre: 'Frutería del barrio',
        color: COLORES[1],
        automatica: false,
        activa: false,
      },
    ]);
  });

  it('comprueba el nombre: no vacío, no muy largo y sin repetir (sin mirar tildes)', () => {
    const propias = [lidl, fruteria];
    expect(validarNombreTienda('  ', propias)).toBe('Escribe el nombre de la tienda.');
    expect(validarNombreTienda('x'.repeat(41), propias)).toBe(
      'Usa un nombre más corto (40 letras).',
    );
    expect(validarNombreTienda('LIDL', propias)).toBe('Ya tienes una tienda llamada «LIDL».');
    expect(validarNombreTienda('mercadona', propias)).toBe(
      'Ya tienes una tienda llamada «mercadona».',
    );
    expect(validarNombreTienda('fruteria  del barrio', propias)).toContain('Ya tienes');
    expect(validarNombreTienda('Aldi', propias)).toBeNull();
    // Al editar una tienda, puede quedarse con su propio nombre.
    expect(validarNombreTienda('Lidl', propias, lidl)).toBeNull();
  });

  it('lee las tiendas apagadas guardadas sin fiarse de lo que haya', () => {
    expect(leerApagadas(['consum', 'consum', 3, ''])).toEqual(['consum']);
    expect(leerApagadas(undefined)).toEqual([]);
    expect(leerApagadas('consum')).toEqual([]);
  });

  it('comprueba las tiendas de una copia', () => {
    expect(problemaTienda(fruteria)).toBeNull();
    expect(problemaTienda({ ...fruteria, id: 'consum' })).toBe(
      'usa el identificador de Mercadona o Consum',
    );
    expect(problemaTienda({ ...fruteria, creada: 'ayer' })).toBe('la fecha no es válida');
  });
});

describe('base de datos', () => {
  beforeEach(async () => {
    await cerrar();
    indexedDB.deleteDatabase('cesta-lista');
  });
  afterEach(async () => {
    await cerrar();
  });

  it('en una instalación nueva, Lidl ya está creada', async () => {
    expect((await listarTiendas()).map((t) => t.id)).toEqual(['lidl']);
    expect(await listarProductos()).toEqual([]);
  });

  it('al actualizar desde la versión 1, los precios de Lidl pasan a la tienda «Lidl»', async () => {
    // Base de datos como la dejaba la versión anterior de la app.
    await new Promise<void>((resolver, rechazar) => {
      const peticion = indexedDB.open('cesta-lista', 1);
      peticion.onupgradeneeded = () => {
        const bd = peticion.result;
        bd.createObjectStore('necesidades', { keyPath: 'id' });
        bd.createObjectStore('ajustes');
        bd.createObjectStore('lidl', { keyPath: 'id' }).put({
          id: 'leche',
          nombre: 'Leche',
          formato: { cantidad: 6, unidad: 'l' },
          precio: 4.74,
          actualizado: AHORA,
          creado: AHORA,
        });
      };
      peticion.onsuccess = () => {
        peticion.result.close();
        resolver();
      };
      peticion.onerror = () => rechazar(peticion.error);
    });

    const contenido = await leerTodo();
    expect(contenido.tiendas.map((t) => t.nombre)).toEqual(['Lidl']);
    expect(contenido.productos).toEqual([
      {
        id: 'leche',
        tienda: 'lidl',
        nombre: 'Leche',
        formato: { cantidad: 6, unidad: 'l' },
        precio: 4.74,
        actualizado: AHORA,
        creado: AHORA,
      },
    ]);
  });

  it('borrar una tienda quita sus productos, lo elegido en ella y que esté apagada', async () => {
    await guardarTiendaPropia(fruteria);
    const naranjas = crearProducto(
      'fruteria',
      { nombre: 'Naranjas', cantidad: 2, unidad: 'kg', precio: 2.5 },
      AHORA,
      'naranjas',
    );
    const leche = crearProducto(
      'lidl',
      { nombre: 'Leche', cantidad: 6, unidad: 'l', precio: 4.74 },
      AHORA,
      'leche',
    );
    await guardarProducto(naranjas);
    await guardarProducto(leche);
    const base = crearNecesidad(
      {
        nombre: 'Naranjas',
        categoria: 'alimentacion',
        cantidad: 2,
        unidad: 'kg',
        frecuencia: 'semana',
      },
      AHORA,
      'n1',
    );
    await guardarNecesidad({
      ...base,
      equivalencias: { mercadona: { id: '1' }, fruteria: { id: 'naranjas' } },
    });
    await guardarNecesidad({ ...base, id: 'n2', equivalencias: { fruteria: { noCompro: true } } });
    await guardarAjuste(AJUSTE_APAGADAS, ['consum', 'fruteria']);

    await borrarTiendaPropia('fruteria');

    expect((await listarTiendas()).map((t) => t.id)).toEqual(['lidl']);
    expect(await listarProductos()).toEqual([leche]);
    const necesidades = (await listarNecesidades()).sort((a, b) => a.id.localeCompare(b.id));
    expect(necesidades[0]?.equivalencias).toEqual({ mercadona: { id: '1' } });
    expect(necesidades[1]).not.toHaveProperty('equivalencias');
    expect(await leerAjuste(AJUSTE_APAGADAS)).toEqual(['consum']);
  });
});
