import { readFileSync } from 'node:fs';
import { getDocument, OPS, Util } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it } from 'vitest';
import { gastoSemanal } from '../src/ingredientes/automatico.ts';
import { INGREDIENTES } from '../src/ingredientes/catalogo.ts';
import { elegirProducto } from '../src/ingredientes/elegir.ts';
import {
  analizarPlato,
  cambiosDeLaDieta,
  planDeLaDieta,
  platosDelRecetario,
} from '../src/menu/dieta/automatica.ts';
import { clavePlato, leerDieta, type Lectura } from '../src/menu/dieta/leer.ts';
import { extraerPaginas } from '../src/menu/dieta/pdf.ts';
import { vecesPorReceta } from '../src/menu/menu.ts';
import type { Receta } from '../src/menu/recetas.ts';
import { crearNecesidad } from '../src/necesidades/modelo.ts';
import type { DatosApp, ProductoApp } from '../src/tipos.ts';

const HOY = '2026-11-18';
const AHORA = '2026-11-18T10:00:00.000Z';

async function lecturaInventada(): Promise<Lectura> {
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

/** «arroz 0.07*»: id, cantidad por ración y * si la indica la dieta. */
const resumen = (texto: string, aprendidos: Record<string, string> = {}) =>
  analizarPlato(texto, aprendidos).ingredientes.map(
    (i) => `${i.ingrediente.id} ${Math.round(i.cantidad * 1000) / 1000}${i.deLaDieta ? '*' : ''}`,
  );

describe('qué lleva cada plato', () => {
  it('saca los ingredientes del texto, con la cantidad de la dieta si la indica', () => {
    expect(resumen('Arroz (70g) con verduras y gambas')).toEqual([
      'arroz 0.07*',
      'menestra 0.15',
      'tomate 0.03',
      'aceite-oliva 0.01',
      'gambas 0.1',
    ]);
    expect(resumen('1 puñado de frutos secos (20-30g)')).toEqual(['frutos-secos 0.03*']);
    // Una pieza de fruta es una ración de fruta (por kg).
    expect(resumen('1 fruta')).toEqual(['fruta 0.2*']);
  });

  it('usa el recetario para lo que el nombre no dice', () => {
    expect(resumen('Tortilla de patatas')).toEqual([
      'huevos 2',
      'patata 0.15',
      'cebolla 0.03',
      'aceite-oliva 0.02',
    ]);
    expect(platosDelRecetario('Tortilla de patatas').map((r) => r.id)).toEqual([
      'tortilla-patatas',
    ]);
    // «Crema de cacahuete» no es una crema de verduras; las tortillas de trigo no son tortilla.
    expect(platosDelRecetario('Tostada con crema de cacahuete').map((r) => r.id)).toEqual([
      'tostada',
    ]);
    expect(platosDelRecetario('Tortillas de trigo con pollo')).toEqual([]);
    // En la pasta, el tomate es tomate frito.
    expect(resumen('Macarrones (60g) con tomate y pavo')).toContain('tomate-frito 0.06');
    expect(resumen('Macarrones (60g) con tomate y pavo')).not.toContain('tomate 0.15');
  });

  it('si la dieta nombra otro de la misma familia, lo cambia (pan → pan integral)', () => {
    const tostada = resumen('Tostada de pan integral con tomate');
    expect(tostada).toContain('pan-integral 0.06');
    expect(tostada.some((x) => x.startsWith('pan '))).toBe(false);
    // Lo que nombra el texto no se pierde aunque llegue otro de su familia.
    const hervido = resumen('Judías verdes con patata, calabacín y puerro');
    expect(hervido).toContain('judia-verde 0.2');
    expect(hervido).toContain('calabacin 0.2');
  });

  it('de las alternativas con «o» se queda con la primera que conoce', () => {
    expect(resumen('Cereales o avena con leche')).toEqual(['cereales 0.04', 'leche 0.2']);
    const r = analizarPlato('Chirivía o avena');
    expect(r.ingredientes.map((i) => i.ingrediente.id)).toEqual(['avena']);
    expect(r.desconocidos).toEqual([]);
  });

  it('ignora hierbas y especias, y avisa de lo que no conoce', () => {
    expect(resumen('Pavo a la plancha con especias')).toEqual(['aceite-oliva 0.005', 'pavo 0.15']);
    const r = analizarPlato('Ensalada de canónigos y chirivía');
    expect(r.desconocidos).toEqual(['Chirivía']);
    // Lo que el usuario dijo se recuerda: la chirivía no se compra; o es lechuga.
    expect(
      analizarPlato('Ensalada de canónigos y chirivía', { [clavePlato('Chirivía')]: '' })
        .desconocidos,
    ).toEqual([]);
    expect(resumen('Chirivía', { [clavePlato('Chirivía')]: 'lechuga' })).toEqual(['lechuga 0.08']);
  });

  it('el agua y las infusiones no compran nada; un huevo es uno', () => {
    expect(analizarPlato('Infusión').nada).toBe(true);
    expect(analizarPlato('Agua').ingredientes).toEqual([]);
    expect(resumen('Huevo duro')).toEqual(['huevos 1']);
    expect(resumen('Huevos duros')).toEqual(['huevos 2']);
  });
});

describe('la compra de la dieta inventada', () => {
  it('suma lo que se gasta a la semana de cada cosa para las personas elegidas', async () => {
    const lectura = await lecturaInventada();
    const contexto = { recetas: [], necesidades: [], sinCompra: [], aprendidos: {} };
    const plan = planDeLaDieta(lectura, { ...contexto, personas: 1 });
    expect(plan.platos.size).toBe(19);
    expect([...plan.platos.values()].every((p) => p.desconocidos.length === 0)).toBe(true);
    const cosa = (nombre: string) => plan.cosas.find((c) => c.nombre === nombre);
    // 15 frutas de 200 g.
    expect(cosa('Fruta')?.semanal).toBe(3);
    expect(cosa('Huevos')).toMatchObject({ semanal: 5, unidad: 'ud' });
    expect(cosa('Arroz')?.semanal).toBe(0.15);
    // El doble para dos personas; lo quitado no sale.
    const dos = planDeLaDieta(lectura, {
      ...contexto,
      personas: 2,
      quitadas: new Set(['i:fruta']),
    });
    expect(dos.cosas.find((c) => c.nombre === 'Arroz')?.semanal).toBe(0.3);
    expect(dos.cosas.find((c) => c.nombre === 'Fruta')).toBeUndefined();
  });

  it('al usarla crea necesidades, recetas y el menú; la segunda vez reconoce las recetas', async () => {
    const lectura = await lecturaInventada();
    let n = 0;
    const nuevoId = () => `id-${++n}`;
    const datos: Pick<DatosApp, 'productos' | 'secciones'> = { productos: [], secciones: {} };
    const plan = planDeLaDieta(lectura, {
      recetas: [],
      necesidades: [],
      sinCompra: [],
      aprendidos: {},
      personas: 2,
    });
    const cambios = cambiosDeLaDieta(plan, {
      necesidades: [],
      personas: 2,
      datos,
      hoy: HOY,
      ahora: AHORA,
      nuevoId,
    });
    expect(cambios.necesidades).toHaveLength(plan.cosas.length);
    expect(cambios.necesidades.every((x) => x.soloRecetas && x.ingrediente)).toBe(true);
    const arroz = cambios.necesidades.find((x) => x.ingrediente === 'arroz');
    expect(arroz).toMatchObject({ nombre: 'Arroz', unidad: 'g', cantidad: 0 });
    expect(cambios.recetas).toHaveLength(19);
    const conArroz = cambios.recetas.find((r) => r.nombre === 'Arroz (70g) con verduras y gambas');
    expect(conArroz).toMatchObject({ raciones: 1, alias: ['Arroz (70g) con verduras y gambas'] });
    expect(conArroz?.ingredientes).toContainEqual({
      necesidad: arroz?.id,
      cantidad: 70,
      unidad: 'g',
    });
    expect(cambios.menu.personas).toBe(2);
    const fruta = cambios.recetas.find((r) => r.nombre === '1 fruta');
    expect(vecesPorReceta(cambios.menu).get(fruta?.id ?? '')).toBe(15);
    // La comida libre del sábado sigue en el menú, sin receta.
    expect(cambios.menu.dias[5]?.find((p) => p.comida === 'Comida')).toEqual({
      comida: 'Comida',
      nombre: 'Libre con moderación',
    });

    // Otro mes: las recetas ya existen (por su alias) y las necesidades también.
    const otra = planDeLaDieta(lectura, {
      recetas: cambios.recetas,
      necesidades: cambios.necesidades,
      sinCompra: [],
      aprendidos: {},
      personas: 2,
    });
    expect([...otra.platos.values()].every((p) => p.receta)).toBe(true);
    expect(otra.cosas.map((c) => c.clave).every((k) => k.startsWith('n:'))).toBe(true);
    expect(otra.cosas.find((c) => c.nombre === 'Arroz')?.semanal).toBe(0.3);
    const segunda = cambiosDeLaDieta(otra, {
      necesidades: cambios.necesidades,
      personas: 2,
      datos,
      hoy: HOY,
      ahora: AHORA,
      nuevoId,
    });
    expect(segunda.recetas).toEqual([]);
    expect(segunda.necesidades).toEqual([]);
    expect(vecesPorReceta(segunda.menu).get(fruta?.id ?? '')).toBe(15);
  });

  it('lo quitado no entra en las recetas ni se crea su necesidad', async () => {
    const lectura = await lecturaInventada();
    const datos = { productos: [], secciones: {} };
    const quitadas = new Set(['i:aceite-oliva']);
    const plan = planDeLaDieta(lectura, {
      recetas: [],
      necesidades: [],
      sinCompra: [],
      aprendidos: {},
      personas: 1,
      quitadas,
    });
    let n = 0;
    const cambios = cambiosDeLaDieta(plan, {
      necesidades: [],
      personas: 1,
      quitadas,
      datos,
      hoy: HOY,
      ahora: AHORA,
      nuevoId: () => `id-${++n}`,
    });
    expect(cambios.necesidades.some((x) => x.ingrediente === 'aceite-oliva')).toBe(false);
  });

  it('usa la necesidad que ya existe para un ingrediente y una receta ya guardada manda', async () => {
    const lectura = await lecturaInventada();
    const leche = crearNecesidad(
      {
        nombre: 'Leche',
        categoria: 'alimentacion',
        cantidad: 6,
        unidad: 'l',
        frecuencia: 'semana',
      },
      AHORA,
      'leche-de-casa',
    );
    const crema: Receta = {
      id: 'mi-crema',
      nombre: 'Mi crema',
      raciones: 2,
      ingredientes: [{ necesidad: 'leche-de-casa', cantidad: 500, unidad: 'ml' }],
      alias: ['Crema de calabaza'],
      creada: AHORA,
      actualizada: AHORA,
    };
    const plan = planDeLaDieta(lectura, {
      recetas: [crema],
      necesidades: [leche],
      sinCompra: [],
      aprendidos: {},
      personas: 1,
    });
    const deLeche = plan.cosas.find((c) => c.clave === 'n:leche-de-casa');
    // Café con leche 4 veces (0,15 l) + mi crema 2 veces (0,25 l por ración).
    expect(deLeche?.semanal).toBe(1.1);
    expect(plan.cosas.some((c) => c.nombre === 'Calabaza')).toBe(false);
  });
});

describe('elegir el envase', () => {
  const salmon = INGREDIENTES.find((i) => i.id === 'salmon');
  const producto = (id: string, cantidad: number, precio: number): ProductoApp => ({
    tienda: 'consum',
    id,
    nombre: 'Salmón',
    seccion: '1',
    formato: { cantidad, unidad: 'kg' },
    precio,
    precioRef: Math.round((precio / cantidad) * 100) / 100,
  });
  const datos: Pick<DatosApp, 'productos' | 'secciones'> = {
    secciones: { consum: { '1': 'Frescos > Pescadería > Pescado azul' } },
    productos: [producto('entero', 2.86, 31.3), producto('filete', 0.2, 4.94)],
  };

  it('elige el más barato por kg, aunque el envase sea grande', () => {
    if (!salmon) throw new Error('falta el salmón en el catálogo');
    // 10,94 €/kg el entero frente a 24,70 €/kg los filetes.
    expect(elegirProducto(salmon, datos, 'consum', HOY)?.id).toBe('entero');
  });

  it('el gasto semanal de una necesidad, en kg, l o ud.', () => {
    const n = (cantidad: number, unidad: 'g' | 'kg' | 'ml' | 'ud', frecuencia: 'semana' | 'mes') =>
      crearNecesidad(
        { nombre: 'x', categoria: 'alimentacion', cantidad, unidad, frecuencia },
        AHORA,
        'x',
      );
    expect(gastoSemanal(n(500, 'g', 'semana'))).toBe(0.5);
    expect(gastoSemanal(n(1500, 'ml', 'semana'))).toBe(1.5);
    expect(gastoSemanal(n(12, 'ud', 'semana'))).toBe(12);
    expect(gastoSemanal(n(1, 'kg', 'mes'))).toBeCloseTo(12 / 52, 6);
  });
});
