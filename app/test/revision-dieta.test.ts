import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { getDocument, OPS, Util } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cerrar, guardarRecetaYNecesidades, leerAjuste, listarRecetas } from '../src/almacen.ts';
import { leerDieta, type Lectura } from '../src/menu/dieta/leer.ts';
import { extraerPaginas } from '../src/menu/dieta/pdf.ts';
import {
  AJUSTE_SIN_COMPRA,
  decisionDe,
  gruposDeRevision,
  menuDeLaDieta,
  recetasParecidas,
  repartir,
  sugerirIngredientes,
} from '../src/menu/dieta/revision.ts';
import { asignarPlato, recargarRecetas } from '../src/menu/estado.ts';
import { problemaReceta, type Receta } from '../src/menu/recetas.ts';
import { crearNecesidad, type Necesidad } from '../src/necesidades/modelo.ts';

const AHORA = '2026-11-17T10:00:00.000Z';
const nec = (id: string, nombre: string, unidad: Necesidad['unidad'] = 'kg'): Necesidad =>
  crearNecesidad(
    { nombre, categoria: 'alimentacion', cantidad: 1, unidad, frecuencia: 'semana' },
    AHORA,
    id,
  );
const receta = (id: string, nombre: string, alias?: string[]): Receta => ({
  id,
  nombre,
  raciones: 1,
  ingredientes: [],
  ...(alias ? { alias } : {}),
  creada: AHORA,
  actualizada: AHORA,
});

/** Dieta inventada (test/fixtures/dieta-inventada.html pasada a PDF). */
async function lecturaDelPdf(): Promise<Lectura> {
  const datos = new Uint8Array(
    readFileSync(new URL('./fixtures/dieta-inventada.pdf', import.meta.url)),
  );
  const carga = getDocument({ data: datos });
  try {
    return leerDieta(await extraerPaginas(await carga.promise, { Util, OPS }));
  } finally {
    await carga.destroy();
  }
}

describe('qué hay que revisar', () => {
  it('reparte los días entre las opciones', () => {
    expect(repartir(7, 2)).toEqual([4, 3]);
    expect(repartir(7, 3)).toEqual([3, 2, 2]);
    expect(repartir(7, 1)).toEqual([7]);
    expect(repartir(7, 0)).toEqual([]);
  });

  it('los platos de los días con sus veces y las opciones repartidas', async () => {
    const grupos = gruposDeRevision(await lecturaDelPdf());
    expect(grupos.map((g) => g.titulo)).toEqual([
      'Platos de la semana',
      'Desayuno: opciones para cualquier día',
      'Almuerzo: opciones para cualquier día',
      'Merienda: opciones para cualquier día',
    ]);
    const [semana, desayuno, , merienda] = grupos;
    expect(semana?.platos).toHaveLength(14);
    expect(semana?.platos.every((p) => p.fijo)).toBe(true);
    expect(semana?.platos[0]).toMatchObject({ texto: '1 fruta', veces: 11 });
    expect(desayuno?.platos.map((p) => p.veces)).toEqual([4, 3]);
    expect(desayuno?.dias).toBe(7);
    expect(merienda?.platos.map((p) => p.veces)).toEqual([3, 2, 2]);
    // Los ids no se repiten.
    const ids = grupos.flatMap((g) => g.platos.map((p) => p.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('sin tabla, cada línea empieza en 0 veces; sin texto no hay nada', () => {
    const [grupo] = gruposDeRevision({ tipo: 'lineas', lineas: ['Lentejas', 'Beber agua'] });
    expect(grupo?.platos.map((p) => [p.texto, p.veces, p.fijo])).toEqual([
      ['Lentejas', 0, false],
      ['Beber agua', 0, false],
    ]);
    expect(gruposDeRevision({ tipo: 'lineas', lineas: [] })).toEqual([]);
    expect(gruposDeRevision({ tipo: 'sin-texto' })).toEqual([]);
  });
});

describe('qué receta es cada plato', () => {
  const crema = receta('crema', 'Crema de calabaza');
  const otra = receta('otra', 'Cremita', ['CREMA de calabaza.']);

  it('primero el nombre guardado de la dieta, luego «no se compra» y luego el mismo nombre', () => {
    expect(decisionDe('Crema de calabaza', [crema, otra], [])).toEqual({
      tipo: 'receta',
      receta: otra,
      porNombre: false,
    });
    expect(decisionDe('crema de CALABAZA', [crema], [])).toEqual({
      tipo: 'receta',
      receta: crema,
      porNombre: true,
    });
    expect(decisionDe('Crema de calabaza', [crema], ['crema de calabaza'])).toEqual({
      tipo: 'sin-compra',
    });
    expect(decisionDe('Paella', [crema], [])).toEqual({ tipo: 'pendiente' });
  });

  it('sugiere las recetas más parecidas', () => {
    const recetas = [
      receta('a', 'Pollo al horno'),
      receta('b', 'Pollo al horno con patata'),
      receta('c', 'Lentejas'),
    ];
    expect(recetasParecidas('Pollo al horno con patata, pimiento y cebolla', recetas)).toEqual([
      recetas[1],
      recetas[0],
    ]);
    expect(recetasParecidas('Merluza', recetas)).toEqual([]);
  });
});

describe('el menú que sale de la dieta', () => {
  it('suma las veces de los platos de cada receta y de sus opciones', async () => {
    const grupos = gruposDeRevision(await lecturaDelPdf());
    const fruta = receta('fruta', 'Fruta', ['1 fruta']);
    const crema = receta('crema', 'Crema de calabaza');
    const todos = grupos.flatMap((g) => g.platos);
    // Todo lo demás, «no se compra».
    const sinCompra = todos
      .map((p) => p.texto)
      .filter((t) => t !== '1 fruta' && t !== 'Crema de calabaza');
    const { menu, pendientes, recortadas } = menuDeLaDieta(
      grupos,
      {},
      [fruta, crema],
      sinCompra,
      2,
    );
    // 11 en los días y 4 en el almuerzo (la primera de dos opciones).
    expect(menu).toEqual([
      { receta: 'fruta', veces: 15, personas: 2 },
      { receta: 'crema', veces: 2, personas: 2 },
    ]);
    expect(pendientes).toEqual([]);
    expect(recortadas).toEqual([]);

    // Si el almuerzo es siempre fruta: 18; si no se toma nunca, solo las 11.
    const almuerzo = grupos[2]?.platos ?? [];
    const veces = (fruta: number) =>
      menuDeLaDieta(
        grupos,
        { [almuerzo[0]?.id ?? '']: fruta, [almuerzo[1]?.id ?? '']: 7 - fruta },
        [fruta === 0 ? receta('x', 'X') : receta('fruta', 'Fruta', ['1 fruta'])],
        sinCompra,
        1,
      ).menu[0]?.veces;
    expect(veces(7)).toBe(18);
  });

  it('los platos sin decidir que se toman quedan pendientes; los de 0 veces, no', () => {
    const grupos = gruposDeRevision({ tipo: 'lineas', lineas: ['Lentejas', 'Beber agua'] });
    const lentejas = grupos[0]?.platos[0]?.id ?? '';
    expect(menuDeLaDieta(grupos, {}, [], [], 1)).toEqual({
      menu: [],
      pendientes: [],
      recortadas: [],
    });
    const r = menuDeLaDieta(grupos, { [lentejas]: 2 }, [], [], 1);
    expect(r.pendientes.map((p) => p.texto)).toEqual(['Lentejas']);
    const conReceta = menuDeLaDieta(grupos, { [lentejas]: 2 }, [receta('l', 'Lentejas')], [], 3);
    expect(conReceta.menu).toEqual([{ receta: 'l', veces: 2, personas: 3 }]);
  });

  it('un plato sin decidir que sale en varias comidas cuenta una vez', async () => {
    const grupos = gruposDeRevision(await lecturaDelPdf());
    // 14 de los días y 7 opciones, de las que «1 fruta» y los frutos secos se repiten.
    expect(menuDeLaDieta(grupos, {}, [], [], 1).pendientes).toHaveLength(19);
  });

  it('no pasa de 21 veces a la semana', () => {
    const grupos = gruposDeRevision({ tipo: 'lineas', lineas: ['Fruta', 'Pieza de fruta'] });
    const [a, b] = grupos[0]?.platos ?? [];
    const fruta = receta('f', 'Fruta', ['Pieza de fruta']);
    const r = menuDeLaDieta(grupos, { [a?.id ?? '']: 14, [b?.id ?? '']: 14 }, [fruta], [], 1);
    expect(r.menu).toEqual([{ receta: 'f', veces: 21, personas: 1 }]);
    expect(r.recortadas).toEqual([fruta]);
  });
});

describe('ingredientes que parece llevar un plato', () => {
  const arroz = nec('arroz', 'Arroz');
  const huevos = nec('huevos', 'Huevos', 'ud');
  const leche = nec('leche', 'Leche', 'l');
  const pollo = nec('pollo', 'Pechuga de pollo');
  const necesidades = [arroz, huevos, leche, pollo];
  const sugeridos = (texto: string) =>
    sugerirIngredientes(texto, necesidades).map((s) => ({
      nombre: s.nombre,
      ...(s.necesidad ? { necesidad: s.necesidad.id } : {}),
      ...(s.cantidad !== undefined ? { cantidad: s.cantidad, unidad: s.unidad } : {}),
    }));

  it('separa los ingredientes y toma la cantidad indicada', () => {
    expect(sugeridos('Arroz (70g) con verduras y gambas')).toEqual([
      { nombre: 'Arroz', necesidad: 'arroz', cantidad: 70, unidad: 'g' },
      { nombre: 'Verduras' },
      { nombre: 'Gambas' },
    ]);
    expect(sugeridos('1 puñado de frutos secos (20-30g)')).toEqual([
      { nombre: 'Frutos secos', cantidad: 30, unidad: 'g' },
    ]);
    expect(sugeridos('1 fruta')).toEqual([{ nombre: 'Fruta', cantidad: 1, unidad: 'ud' }]);
    expect(sugeridos('Leche (0,25 l)')).toEqual([
      { nombre: 'Leche', necesidad: 'leche', cantidad: 0.25, unidad: 'l' },
    ]);
  });

  it('quita cómo se cocina y el tipo de plato', () => {
    expect(sugeridos('Pollo al horno con patata, pimiento y cebolla')).toEqual([
      { nombre: 'Pollo' },
      { nombre: 'Patata' },
      { nombre: 'Pimiento' },
      { nombre: 'Cebolla' },
    ]);
    expect(sugeridos('Ensalada de lechuga, tomate y atún')).toEqual([
      { nombre: 'Lechuga' },
      { nombre: 'Tomate' },
      { nombre: 'Atún' },
    ]);
    expect(sugeridos('Garbanzos con espinacas y huevo duro')).toEqual([
      { nombre: 'Garbanzos' },
      { nombre: 'Espinacas' },
      { nombre: 'Huevo', necesidad: 'huevos' },
    ]);
    expect(sugeridos('Café con leche y tostada de pan integral con tomate')).toEqual([
      { nombre: 'Café' },
      { nombre: 'Leche', necesidad: 'leche' },
      { nombre: 'Pan integral' },
      { nombre: 'Tomate' },
    ]);
    expect(sugeridos('Lentejas estofadas con verduras')).toEqual([
      { nombre: 'Lentejas' },
      { nombre: 'Verduras' },
    ]);
  });

  it('entiende las alternativas, los comentarios, los rellenos y las tortillas', () => {
    const nombres = (texto: string) => sugeridos(texto).map((s) => s.nombre);
    expect(nombres('Yogur con avena (si quieres, con canela)')).toEqual(['Yogur', 'Avena']);
    expect(sugeridos('1 fruta y/o 1 puñado de nueces (15-25g)')).toEqual([
      { nombre: 'Fruta', cantidad: 1, unidad: 'ud' },
      { nombre: 'Nueces', cantidad: 25, unidad: 'g' },
    ]);
    expect(nombres('Copos de maíz o avena o tostada de pan con aceite')).toEqual([
      'Copos de maíz',
      'Avena',
      'Pan',
      'Aceite',
    ]);
    expect(nombres('Tortilla francesa')).toEqual(['Huevos']);
    expect(nombres('Tortilla de espinacas')).toEqual(['Huevos', 'Espinacas']);
    expect(nombres('Calabacín relleno de atún y tomate')).toEqual(['Calabacín', 'Atún', 'Tomate']);
    expect(nombres('Ensalada con lechuga y maíz')).toEqual(['Lechuga', 'Maíz']);
    expect(nombres('Hervido de media patata y judías')).toEqual(['Patata', 'Judías']);
    expect(nombres('Merluza con palitos de pepino')).toEqual(['Merluza', 'Pepino']);
  });

  it('no propone una cantidad que no encaja con la necesidad', () => {
    expect(sugeridos('Leche (200g)')).toEqual([{ nombre: 'Leche', necesidad: 'leche' }]);
    expect(sugeridos('2 huevos')).toEqual([
      { nombre: 'Huevos', necesidad: 'huevos', cantidad: 2, unidad: 'ud' },
    ]);
  });
});

describe('recordar los platos de la dieta', () => {
  beforeEach(async () => {
    await cerrar();
    indexedDB.deleteDatabase('cesta-lista');
    await recargarRecetas();
  });
  afterEach(async () => {
    await cerrar();
  });

  it('el plato pasa de una receta a otra, a «no se compra» y a nada', async () => {
    await guardarRecetaYNecesidades(receta('a', 'Crema', ['Puré de verduras']), []);
    await guardarRecetaYNecesidades(receta('b', 'Calabaza'), []);
    await recargarRecetas();
    const alias = async () =>
      Object.fromEntries((await listarRecetas()).map((r) => [r.id, r.alias ?? []]));

    await asignarPlato('Crema de calabaza', { receta: 'a' });
    expect(await alias()).toEqual({ a: ['Puré de verduras', 'Crema de calabaza'], b: [] });

    await asignarPlato('CREMA DE CALABAZA', { receta: 'b' });
    expect(await alias()).toEqual({ a: ['Puré de verduras'], b: ['CREMA DE CALABAZA'] });

    await asignarPlato('Crema de calabaza', 'sin-compra');
    expect(await alias()).toEqual({ a: ['Puré de verduras'], b: [] });
    expect(await leerAjuste(AJUSTE_SIN_COMPRA)).toEqual(['Crema de calabaza']);

    await asignarPlato('Crema de calabaza', { receta: 'a' });
    expect(await leerAjuste(AJUSTE_SIN_COMPRA)).toEqual([]);

    await asignarPlato('Crema de calabaza', null);
    expect(await alias()).toEqual({ a: ['Puré de verduras'], b: [] });
  });

  it('la copia de seguridad acepta los nombres de la dieta y rechaza los dañados', () => {
    const unidades = new Map<string, Necesidad['unidad']>();
    expect(problemaReceta(receta('a', 'A', ['Crema']), unidades)).toBeNull();
    expect(problemaReceta({ ...receta('a', 'A'), alias: 'Crema' }, unidades)).toBe(
      'los nombres de la dieta no son válidos',
    );
    expect(problemaReceta({ ...receta('a', 'A'), alias: [''] }, unidades)).toBe(
      'los nombres de la dieta no son válidos',
    );
  });
});
