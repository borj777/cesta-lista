import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { getDocument, OPS, Util } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cerrar, guardarRecetaYNecesidades, leerAjuste, listarRecetas } from '../src/almacen.ts';
import { leerDieta, resumirDieta, type Lectura } from '../src/menu/dieta/leer.ts';
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
import { menuSinPlatos, vecesPorReceta } from '../src/menu/menu.ts';
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
  it('pone cada plato en su día y su comida, con las opciones repartidas por días', async () => {
    const lectura = await lecturaDelPdf();
    const grupos = gruposDeRevision(lectura);
    const fruta = receta('fruta', 'Fruta', ['1 fruta']);
    const crema = receta('crema', 'Crema de calabaza');
    const todos = grupos.flatMap((g) => g.platos);
    // Todo lo demás, «no se compra».
    const sinCompra = todos
      .map((p) => p.texto)
      .filter((t) => t !== '1 fruta' && t !== 'Crema de calabaza');
    const libres = lectura.tipo === 'tabla' ? resumirDieta(lectura.dieta).libresEn : [];
    const { menu, pendientes } = menuDeLaDieta(grupos, {}, [fruta, crema], sinCompra, 2, libres);
    expect(pendientes).toEqual([]);
    expect(menu.personas).toBe(2);
    // 11 en los días y 4 en el almuerzo (la primera de dos opciones, de lunes a jueves).
    expect(vecesPorReceta(menu).get('fruta')).toBe(15);
    expect(vecesPorReceta(menu).get('crema')).toBe(2);

    const lunes = (menu.dias[0] ?? []).map((p) => [p.comida, p.nombre, p.receta ?? '-']);
    expect(lunes).toEqual([
      ['Desayuno', 'Café con leche y tostada de pan integral con tomate', '-'],
      ['Almuerzo', '1 fruta', 'fruta'],
      ['Comida', 'Arroz (70g) con verduras y gambas', '-'],
      ['Comida', '1 fruta', 'fruta'],
      ['Merienda', 'Yogur natural', '-'],
      ['Cena', 'Crema de calabaza', 'crema'],
      ['Cena', 'Merluza al horno', '-'],
      ['Cena', '1 fruta', 'fruta'],
    ]);
    // El viernes ya toca la segunda opción del almuerzo y del desayuno.
    const viernes = menu.dias[4] ?? [];
    expect(viernes.find((p) => p.comida === 'Almuerzo')?.nombre).toBe(
      '1 puñado de frutos secos (20-30g)',
    );
    expect(viernes.find((p) => p.comida === 'Desayuno')?.nombre).toBe('Yogur natural con avena');
    // La merienda tiene 3 opciones: 3, 2 y 2 días.
    expect(menu.dias.map((d) => d.find((p) => p.comida === 'Merienda')?.nombre)).toEqual([
      'Yogur natural',
      'Yogur natural',
      'Yogur natural',
      '1 puñado de frutos secos (20-30g)',
      '1 puñado de frutos secos (20-30g)',
      'Hummus con palitos de zanahoria',
      'Hummus con palitos de zanahoria',
    ]);
    // Las comidas libres salen en su día, sin comprar nada.
    expect(menu.dias[5]?.find((p) => p.comida === 'Comida')).toEqual({
      comida: 'Comida',
      nombre: 'Libre con moderación',
    });

    // Si el almuerzo es siempre fruta: 18.
    const almuerzo = grupos[2]?.platos ?? [];
    const siempre = menuDeLaDieta(
      grupos,
      { [almuerzo[0]?.id ?? '']: 7, [almuerzo[1]?.id ?? '']: 0 },
      [fruta],
      sinCompra,
      1,
    );
    expect(vecesPorReceta(siempre.menu).get('fruta')).toBe(18);
  });

  it('las líneas sueltas se reparten por la semana; los platos de 0 veces no salen', () => {
    const grupos = gruposDeRevision({ tipo: 'lineas', lineas: ['Lentejas', 'Beber agua'] });
    const lentejas = grupos[0]?.platos[0]?.id ?? '';
    const vacio = menuDeLaDieta(grupos, {}, [], [], 1);
    expect(vacio.pendientes).toEqual([]);
    expect(menuSinPlatos(vacio.menu)).toBe(true);
    const r = menuDeLaDieta(grupos, { [lentejas]: 2 }, [], [], 1);
    expect(r.pendientes.map((p) => p.texto)).toEqual(['Lentejas']);
    const conReceta = menuDeLaDieta(grupos, { [lentejas]: 2 }, [receta('l', 'Lentejas')], [], 3);
    expect(conReceta.menu.personas).toBe(3);
    // 2 veces: lunes y jueves.
    expect(conReceta.menu.dias.map((d) => d.length)).toEqual([1, 0, 0, 1, 0, 0, 0]);
    expect(conReceta.menu.dias[0]).toEqual([{ comida: '', nombre: 'Lentejas', receta: 'l' }]);
  });

  it('un plato sin decidir que sale en varias comidas cuenta una vez', async () => {
    const grupos = gruposDeRevision(await lecturaDelPdf());
    // 14 de los días y 7 opciones, de las que «1 fruta» y los frutos secos se repiten.
    expect(menuDeLaDieta(grupos, {}, [], [], 1).pendientes).toHaveLength(19);
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
