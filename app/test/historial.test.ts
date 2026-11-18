import { describe, expect, it } from 'vitest';
import {
  graficaHistorial,
  leerTrozo,
  resumenHistorial,
  textosCambios,
  textosResumen,
  tramoEn,
  trozoDe,
  type Punto,
  type Resumen,
} from '../src/historial/historial.ts';

/** Intl separa el número y el € con un espacio duro. */
const sinDuros = (t: string) => t.replace(/\u00a0/g, ' ');

/** El resumen, que en estos tests siempre existe. */
function resumido(r: Resumen | null): Resumen {
  if (!r) throw new Error('Sin resumen');
  return r;
}

const bajada: Punto[] = [
  ['2026-11-15', 2.6, 5.2],
  ['2026-11-17', 2.4, 4.8],
];

describe('historial de precios en la app', () => {
  it('busca cada producto en el mismo trozo que el scraper', () => {
    expect(trozoDe('1393')).toBe(trozoDe('3'));
    expect(trozoDe('9660.1')).toBe(trozoDe('1'));
    expect(new Set(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].map(trozoDe)).size).toBe(10);
  });

  it('lee un trozo y deja fuera los productos con puntos mal escritos', () => {
    const h = leerTrozo({
      tienda: 'consum',
      productos: {
        '11': bajada,
        '21': [['17/11', 2, 4]],
        '31': [
          ['2026-11-15', 1, 2],
          ['2026-11-16', null],
        ],
      },
    });
    expect([...(h?.keys() ?? [])]).toEqual(['11', '31']);
    expect(leerTrozo({ tienda: 'consum' })).toBeNull();
    expect(leerTrozo('nada')).toBeNull();
  });

  it('resume una bajada: cuánto, cuándo y que es el más bajo', () => {
    const r = resumenHistorial(bajada);
    expect(r).toMatchObject({ desde: '2026-11-15', minimo: 4.8, maximo: 5.2 });
    expect(textosResumen(resumido(r), 'kg')).toEqual([
      'Bajó un 8 % el 17/11 (antes, 5,20 €/kg).',
      'Es el más bajo desde el 15/11.',
    ]);
  });

  it('resume una subida y un precio entre el más bajo y el más alto', () => {
    const r = resumenHistorial([
      ['2026-11-15', 3, 3],
      ['2026-11-16', 2, 2],
      ['2026-11-18', 2.5, 2.5],
    ]);
    expect(textosResumen(resumido(r), 'l')).toEqual([
      'Subió un 25 % el 18/11 (antes, 2,00 €/l).',
      'Desde el 15/11 ha estado entre 2,00 €/l y 3,00 €/l.',
    ]);
  });

  it('no cuenta como cambio lo que varía el €/kg por el peso de la bandeja (menos del 1 %)', () => {
    const r = resumenHistorial([
      ['2026-11-15', 3.38, 2.3972],
      ['2026-11-17', 3.48, 2.4],
      ['2026-11-18', 3.77, 2.4013],
    ]);
    expect(r?.ultimoCambio).toBeNull();
    expect(textosResumen(resumido(r), 'kg')).toEqual(['El mismo precio desde el 15/11.']);
  });

  it('suma los cambios pequeños hasta que llegan al 1 %', () => {
    const r = resumenHistorial([
      ['2026-11-15', 1, 1],
      ['2026-11-16', 1, 1.006],
      ['2026-11-17', 1, 1.012],
    ]);
    expect(r?.ultimoCambio).toEqual({ dia: '2026-11-17', antesRef: 1, ahoraRef: 1.012 });
  });

  it('salta los días que no estuvo y avisa si ya no está', () => {
    const puntos: Punto[] = [
      ['2026-11-15', 2, 4],
      ['2026-11-16', null],
      ['2026-11-18', 1.8, 3.6],
    ];
    expect(resumenHistorial(puntos)?.ultimoCambio).toEqual({
      dia: '2026-11-18',
      antesRef: 4,
      ahoraRef: 3.6,
    });
    const r = resumenHistorial([
      ['2026-11-15', 2, 4],
      ['2026-11-16', null],
    ]);
    expect(r?.actual).toBeNull();
    expect(textosResumen(resumido(r), 'kg')).toEqual(['Ya no está en la tienda.']);
    expect(textosCambios(puntos, 'kg').map(sinDuros)).toEqual([
      '18/11: 1,80 € (3,60 €/kg)',
      '16/11: deja de estar en la tienda',
      '15/11: 2,00 € (4,00 €/kg)',
    ]);
  });

  it('dibuja escalones desde el primer día hasta hoy, con un hueco si no estuvo', () => {
    const g = graficaHistorial(
      [
        ['2026-11-15', 2, 4],
        ['2026-11-16', null],
        ['2026-11-17', 1.5, 3],
        ['2026-11-18', 2.5, 5],
      ],
      '2026-11-19',
      400,
      100,
    );
    // 5 días contando hoy: 80 px por día. El más alto arriba (15 %), el más bajo abajo (85 %).
    expect(g.tramos).toEqual([
      { x1: 0, x2: 80, y: 50, dia: '2026-11-15', precioRef: 4 },
      { x1: 160, x2: 240, y: 85, dia: '2026-11-17', precioRef: 3 },
      { x1: 240, x2: 400, y: 15, dia: '2026-11-18', precioRef: 5 },
    ]);
    expect(g.caminos).toEqual(['M0 50 H80', 'M160 85 H240 V15 H400']);
    expect(tramoEn(g.tramos, 50)?.dia).toBe('2026-11-15');
    expect(tramoEn(g.tramos, 120)).toBeNull();
    expect(tramoEn(g.tramos, 350)?.dia).toBe('2026-11-18');
    expect(tramoEn(g.tramos, -5)?.dia).toBe('2026-11-15');
  });

  it('con un solo precio, la línea va por la mitad y llega hasta hoy', () => {
    const g = graficaHistorial([['2026-11-18', 2, 4]], '2026-11-18', 300, 64);
    expect(g.caminos).toEqual(['M0 32 H300']);
  });
});
