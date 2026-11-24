import { describe, expect, it } from 'vitest';
import { leerCopia } from '../src/copia.ts';
import {
  actualizarAutomaticas,
  cambioDeUnidad,
  elegirPorMi,
  ingredienteDe,
  ingredientePorNombre,
  unidadDelNombre,
} from '../src/ingredientes/automatico.ts';
import { INGREDIENTES, type Ingrediente } from '../src/ingredientes/catalogo.ts';
import { candidatos, elegirProducto, encaja } from '../src/ingredientes/elegir.ts';
import { crearNecesidad, type Necesidad } from '../src/necesidades/modelo.ts';
import type { DatosApp, ProductoApp } from '../src/tipos.ts';

const HOY = '2026-11-18';
const AHORA = '2026-11-18T10:00:00.000Z';

const producto = (
  tienda: string,
  id: string,
  nombre: string,
  seccion: string,
  precioRef: number,
  extra: Partial<ProductoApp> = {},
): ProductoApp => ({
  tienda,
  id,
  nombre,
  seccion,
  formato: { cantidad: 1, unidad: 'kg' },
  precio: precioRef,
  precioRef,
  ...extra,
});

const datos: Pick<DatosApp, 'productos' | 'secciones'> = {
  secciones: {
    mercadona: {
      '1': 'Carne > Aves y pollo > Pollo',
      '2': 'Carne > Empanados y elaborados',
      '3': 'Mascotas > Gato',
    },
    consum: {
      '10': 'Frescos > Carnicería > Aves',
      '11': 'Despensa > Conservas, aceites y condimentos > Conservas pescado > Atún y bonito',
    },
  },
  productos: [
    producto('mercadona', 'a', 'Filetes pechuga de pollo', '1', 7.7),
    producto('mercadona', 'b', 'Pechugas enteras familiar de pollo', '1', 6.2),
    producto('mercadona', 'c', 'Pechuga de pollo empanada', '1', 5),
    producto('mercadona', 'd', 'Nuggets de pechuga de pollo', '2', 4),
    producto('mercadona', 'e', 'Comida gato con pechuga de pollo', '3', 3),
    producto('mercadona', 'f', 'Pechuga de pollo marinada', '1', 5.5),
    producto('consum', 'x', 'Pechuga de Pollo', '10', 6.95),
    producto('consum', 'y', 'Pechuga de Pollo Oferta', '10', 6, {
      precio: 6,
      precioAnterior: 9,
      ofertaHasta: '2026-11-17',
    }),
    producto('consum', 'z', 'Atún Claro', '11', 8),
  ],
};

const pechuga = INGREDIENTES.find((i) => i.id === 'pechuga-pollo') as Ingrediente;

const necesidad = (nombre: string, extra: Partial<Necesidad> = {}): Necesidad => ({
  ...crearNecesidad(
    { nombre, categoria: 'alimentacion', cantidad: 1, unidad: 'kg', frecuencia: 'semana' },
    AHORA,
    nombre,
  ),
  ...extra,
});

describe('elegir el producto de un ingrediente', () => {
  it('busca solo en sus secciones y descarta lo preparado y lo de otras secciones', () => {
    const ids = candidatos(pechuga, datos, 'mercadona', HOY).map((p) => p.id);
    // Ni la empanada ni la marinada, ni los nuggets (otra sección) ni la comida de gato.
    expect(ids).toEqual(['b', 'a']);
  });

  it('«filetes» encaja con «filete» aunque se quite el plural', () => {
    const filetes = datos.productos[0] as ProductoApp;
    expect(encaja({ ...pechuga, buscar: ['filete pollo'] }, filetes, datos.secciones)).toBe(true);
  });

  it('elige el más barato por kg con el precio de hoy (sin ofertas caducadas)', () => {
    // La oferta de «y» terminó ayer: hoy cuesta 9 €/kg y gana «x».
    expect(elegirProducto(pechuga, datos, 'consum', HOY)?.id).toBe('x');
    expect(elegirProducto(pechuga, datos, 'consum', '2026-11-17')?.id).toBe('y');
    expect(elegirProducto(pechuga, datos, 'lidl', HOY)).toBeUndefined();
  });

  it('no vale un producto de otra unidad, sin sección o con un envase demasiado grande', () => {
    const ud = producto('mercadona', 'u', 'Pechuga de pollo', '1', 2, {
      formato: { cantidad: 4, unidad: 'ud' },
    });
    const sinSeccion = { ...producto('mercadona', 's', 'Pechuga de pollo', '1', 2) };
    delete sinSeccion.seccion;
    expect(encaja(pechuga, ud, datos.secciones)).toBe(false);
    expect(encaja(pechuga, sinSeccion, datos.secciones)).toBe(false);
    const grande = producto('mercadona', 'g', 'Pechuga de pollo', '1', 2, {
      formato: { cantidad: 7, unidad: 'kg' },
    });
    expect(encaja({ ...pechuga, maxEnvase: 1 }, grande, datos.secciones)).toBe(false);
    expect(encaja(pechuga, grande, datos.secciones)).toBe(true);
  });
});

describe('qué ingrediente es cada necesidad', () => {
  it('por su nombre exacto o por otro de sus nombres', () => {
    expect(ingredientePorNombre('Pechuga de pollo')?.id).toBe('pechuga-pollo');
    expect(ingredientePorNombre('pollo')?.id).toBe('pollo');
    expect(ingredientePorNombre('Leche')?.id).toBe('leche');
    expect(ingredientePorNombre('Tomates')?.id).toBe('tomate');
    expect(ingredientePorNombre('Tomate frito')?.id).toBe('tomate-frito');
    expect(ingredientePorNombre('1 fruta')?.id).toBe('fruta');
  });

  it('si no es exacto, el de más palabras que están en el texto', () => {
    expect(ingredientePorNombre('Pechuga de pollo fileteada')?.id).toBe('pechuga-pollo');
    expect(ingredientePorNombre('Leche semidesnatada Hacendado')?.id).toBe('leche');
    expect(ingredientePorNombre('Detergente')).toBeUndefined();
    expect(ingredientePorNombre('')).toBeUndefined();
  });

  it('manda el ingrediente apuntado en la necesidad', () => {
    expect(ingredienteDe({ nombre: 'Lo del cole', ingrediente: 'arroz' })?.id).toBe('arroz');
    expect(ingredienteDe({ nombre: 'Arroz', ingrediente: 'no-existe' })?.id).toBe('arroz');
  });

  it('el catálogo no repite ids y cada ingrediente sabe dónde y qué buscar', () => {
    const ids = INGREDIENTES.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(INGREDIENTES.length).toBeGreaterThan(100);
    for (const i of INGREDIENTES) {
      expect(i.buscar.length, i.id).toBeGreaterThan(0);
      expect(i.en.length, i.id).toBeGreaterThan(0);
      expect(i.racion ?? 1, i.id).toBeGreaterThan(0);
    }
  });
});

describe('elegir por mí', () => {
  it('elige en las tiendas sin producto y no toca lo elegido a mano ni «no lo compro»', () => {
    const manual = necesidad('Pechuga de pollo', { equivalencias: { mercadona: { id: 'a' } } });
    const r = elegirPorMi(manual, datos, HOY, AHORA);
    expect(r?.necesidad.equivalencias).toEqual({
      mercadona: { id: 'a' },
      consum: { id: 'x', auto: true },
    });
    expect(r?.necesidad.ingrediente).toBe('pechuga-pollo');
    expect(r?.elegidas).toEqual(['consum']);

    const noCompro = necesidad('Pechuga de pollo', {
      equivalencias: { consum: { noCompro: true } },
    });
    expect(elegirPorMi(noCompro, datos, HOY, AHORA)?.necesidad.equivalencias).toEqual({
      consum: { noCompro: true },
      mercadona: { id: 'b', auto: true },
    });
  });

  it('dice dónde no hay producto y no hace nada si no es un ingrediente o va en otra unidad', () => {
    const atun = elegirPorMi(necesidad('Atún'), datos, HOY, AHORA);
    expect(atun?.elegidas).toEqual(['consum']);
    expect(atun?.sinProducto).toEqual(['mercadona']);
    expect(elegirPorMi(necesidad('Detergente'), datos, HOY, AHORA)).toBeNull();
    expect(
      elegirPorMi(necesidad('Pechuga de pollo', { unidad: 'ud' }), datos, HOY, AHORA),
    ).toBeNull();
    // g se compara por kg: vale.
    expect(
      elegirPorMi(necesidad('Pechuga de pollo', { unidad: 'g' }), datos, HOY, AHORA),
    ).not.toBeNull();
  });

  it('pone al día solo lo que eligió la app cuando aparece algo más barato', () => {
    const auto = necesidad('Pechuga de pollo', {
      equivalencias: { mercadona: { id: 'a', auto: true }, consum: { id: 'x', auto: true } },
    });
    const manual = necesidad('Pollo a mano', {
      ingrediente: 'pechuga-pollo',
      equivalencias: { mercadona: { id: 'a' } },
    });
    const cambiadas = actualizarAutomaticas([auto, manual], datos, HOY, AHORA);
    expect(cambiadas).toHaveLength(1);
    expect(cambiadas[0]?.equivalencias).toEqual({
      mercadona: { id: 'b', auto: true },
      consum: { id: 'x', auto: true },
    });
    // Ya al día: no cambia nada.
    expect(actualizarAutomaticas(cambiadas, datos, HOY, AHORA)).toEqual([]);
  });
});

describe('la unidad de cada ingrediente', () => {
  it('al escribir el nombre, propone su unidad', () => {
    expect(unidadDelNombre('Huevos')).toBe('ud');
    expect(unidadDelNombre('Leche')).toBe('l');
    expect(unidadDelNombre('Pechuga de pollo')).toBe('kg');
    expect(unidadDelNombre('Pilas')).toBeUndefined();
  });

  it('huevos en kg: se pasan a unidades con el mismo número y sin la despensa de antes', () => {
    const huevos = necesidad('Huevos', {
      cantidad: 12,
      despensa: { cantidad: 3, fecha: '2026-11-10' },
      duraHasta: '2026-11-30',
    });
    const cambio = cambioDeUnidad(huevos);
    expect(cambio?.ingrediente.id).toBe('huevos');
    expect(cambio?.arreglada).toMatchObject({ unidad: 'ud', cantidad: 12 });
    expect(cambio?.arreglada?.despensa).toBeUndefined();
    expect(cambio?.arreglada?.duraHasta).toBeUndefined();
    // Ya en unidades, la app sí elige el producto.
    expect(cambioDeUnidad({ ...huevos, unidad: 'ud' })).toBeNull();
  });

  it('de g o ml se pasa a kg o l; de g a unidades hay que escribirlo', () => {
    expect(
      cambioDeUnidad(necesidad('Leche', { unidad: 'g', cantidad: 1500 }))?.arreglada,
    ).toMatchObject({ unidad: 'l', cantidad: 1.5 });
    expect(
      cambioDeUnidad(necesidad('Huevos', { unidad: 'g', cantidad: 600 }))?.arreglada,
    ).toBeNull();
    // Lo que no es un ingrediente conocido o ya va bien (leche en ml) no se toca.
    expect(cambioDeUnidad(necesidad('Leche', { unidad: 'ml', cantidad: 1500 }))).toBeNull();
    expect(cambioDeUnidad(necesidad('Pilas', { unidad: 'ud' }))).toBeNull();
    expect(cambioDeUnidad(necesidad('Pechuga de pollo', { unidad: 'g' }))).toBeNull();
  });
});

describe('copia de seguridad con lo elegido por la app', () => {
  const copia = (n: unknown) =>
    JSON.stringify({
      app: 'cesta-lista',
      version: 3,
      exportada: AHORA,
      necesidades: [n],
      tiendas: [],
      productos: [],
      recetas: [],
      ajustes: {},
    });

  it('acepta «auto» y el ingrediente, y rechaza lo que no es válido', () => {
    const buena = necesidad('Pechuga de pollo', {
      ingrediente: 'pechuga-pollo',
      equivalencias: { mercadona: { id: 'b', auto: true } },
    });
    expect(leerCopia(copia(buena)).ok).toBe(true);
    const mala = { ...buena, equivalencias: { mercadona: { id: 'b', auto: false } } };
    expect(leerCopia(copia(mala)).ok).toBe(false);
    expect(leerCopia(copia({ ...buena, ingrediente: 3 })).ok).toBe(false);
  });
});
