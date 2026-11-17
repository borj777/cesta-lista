import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  borrarNecesidad,
  cerrar,
  guardarNecesidad,
  guardarRecetaYNecesidades,
  listarNecesidades,
  listarRecetas,
} from '../src/almacen.ts';
import {
  convertir,
  necesidadParaIngrediente,
  porRacion,
  recetasCon,
  sugerirNecesidades,
  unidadesCompatibles,
  validarReceta,
  type Receta,
} from '../src/menu/recetas.ts';
import {
  crearNecesidad,
  editarNecesidad,
  textoNecesidad,
  type Necesidad,
} from '../src/necesidades/modelo.ts';

const AHORA = '2026-11-17T10:00:00.000Z';
const nec = (id: string, nombre: string, unidad: Necesidad['unidad'] = 'kg'): Necesidad =>
  crearNecesidad(
    { nombre, categoria: 'alimentacion', cantidad: 1, unidad, frecuencia: 'semana' },
    AHORA,
    id,
  );
const arroz = nec('arroz', 'Arroz redondo');
const pollo = nec('pollo', 'Pechuga de pollo');
const leche = nec('leche', 'Leche semidesnatada', 'l');
const paella: Receta = {
  id: 'paella',
  nombre: 'Paella',
  raciones: 2,
  ingredientes: [
    { necesidad: 'arroz', cantidad: 160, unidad: 'g' },
    { necesidad: 'pollo', cantidad: 300, unidad: 'g' },
  ],
  creada: AHORA,
  actualizada: AHORA,
};

describe('unidades de los ingredientes', () => {
  it('solo deja unidades de la misma familia que la necesidad', () => {
    expect(unidadesCompatibles('kg')).toEqual(['kg', 'g']);
    expect(unidadesCompatibles('ml')).toEqual(['l', 'ml']);
    expect(unidadesCompatibles('ud')).toEqual(['ud']);
  });

  it('pasa los gramos a kg y calcula lo de cada ración', () => {
    expect(convertir(160, 'g', 'kg')).toBe(0.16);
    expect(convertir(0.5, 'l', 'ml')).toBe(500);
    expect(() => convertir(1, 'g', 'l')).toThrow();
    const ingPollo = paella.ingredientes[1];
    if (!ingPollo) throw new Error('falta');
    expect(porRacion(paella, ingPollo, 'kg')).toBe(0.15);
  });
});

describe('recetas', () => {
  it('sugiere necesidades por nombre, sin tildes y en plural', () => {
    expect(sugerirNecesidades('arroz', [arroz, pollo, leche]).map((n) => n.id)).toEqual(['arroz']);
    expect(sugerirNecesidades('pollos', [arroz, pollo]).map((n) => n.id)).toEqual(['pollo']);
    expect(sugerirNecesidades('', [arroz])).toEqual([]);
  });

  it('un ingrediente nuevo crea una necesidad solo para recetas', () => {
    const tomate = necesidadParaIngrediente('Tomate', 'ud', AHORA, 'tomate');
    expect(tomate).toMatchObject({
      nombre: 'Tomate',
      cantidad: 0,
      unidad: 'ud',
      soloRecetas: true,
    });
    expect(textoNecesidad(tomate)).toBe('Solo para tus recetas');
    // Si se le pone cantidad propia, deja de ser solo para recetas.
    const editada = editarNecesidad(
      tomate,
      {
        nombre: 'Tomate',
        categoria: 'alimentacion',
        cantidad: 6,
        unidad: 'ud',
        frecuencia: 'semana',
      },
      AHORA,
    );
    expect(editada).not.toHaveProperty('soloRecetas');
  });

  it('pide nombre, raciones y algún ingrediente', () => {
    expect(validarReceta({ nombre: '', raciones: 0, ingredientes: [] })).toEqual({
      nombre: 'Escribe el nombre del plato.',
      raciones: 'Escribe cuántas raciones salen, de 1 a 50.',
      ingredientes: 'Añade al menos un ingrediente.',
    });
    expect(validarReceta({ nombre: 'Paella', raciones: 2, ingredientes: [{}] })).toEqual({});
  });

  it('sabe en qué recetas se usa cada necesidad', () => {
    expect(recetasCon([paella], 'pollo')).toEqual([paella]);
    expect(recetasCon([paella], 'leche')).toEqual([]);
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

  it('guarda la receta y las necesidades nuevas a la vez', async () => {
    await guardarNecesidad(pollo);
    const nuevaArroz = necesidadParaIngrediente('Arroz', 'g', AHORA, 'arroz');
    await guardarRecetaYNecesidades(paella, [nuevaArroz]);
    expect(await listarRecetas()).toEqual([paella]);
    expect((await listarNecesidades()).map((n) => n.id).sort()).toEqual(['arroz', 'pollo']);
  });

  it('borrar una necesidad la quita de las recetas', async () => {
    await guardarNecesidad(arroz);
    await guardarNecesidad(pollo);
    await guardarRecetaYNecesidades(paella, []);
    await borrarNecesidad('arroz');
    expect((await listarRecetas())[0]?.ingredientes.map((i) => i.necesidad)).toEqual(['pollo']);
  });
});
