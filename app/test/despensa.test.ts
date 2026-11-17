import { describe, expect, it } from 'vitest';
import {
  aComparacion,
  cantidadPoco,
  corregirDespensa,
  despensaValida,
  despuesDeComprar,
  diasQueQuedan,
  estadoDespensa,
  existencias,
  textoAproximado,
  textoDespensa,
  textoDias,
  textoEnUnidad,
} from '../src/despensa/despensa.ts';
import {
  consumoSemanal,
  existenciasDe,
  faltaParaElPeriodo,
  tocaComprar,
} from '../src/lista/compra.ts';
import { crearNecesidad, type Necesidad } from '../src/necesidades/modelo.ts';
import { planificar } from '../src/optimizador.ts';
import type { ProductoApp } from '../src/tipos.ts';

const AHORA = '2026-11-17T10:00:00.000Z';
const HOY = '2026-11-17';
const nec = (
  id: string,
  cantidad: number,
  unidad: Necesidad['unidad'],
  frecuencia: Necesidad['frecuencia'] = 'semana',
): Necesidad =>
  crearNecesidad(
    { nombre: id, categoria: 'alimentacion', cantidad, unidad, frecuencia },
    AHORA,
    id,
  );

// Leche: 7 litros a la semana (1 al día).
const leche = nec('leche', 7, 'l');
const conLeche = (cantidad: number, fecha = HOY, lleno?: number): Necesidad => ({
  ...leche,
  despensa: { cantidad, fecha, ...(lleno !== undefined ? { lleno } : {}) },
});

describe('lo que queda en casa', () => {
  it('se resta lo que se gasta cada día desde la última vez que se supo', () => {
    expect(existencias(conLeche(6), 7, HOY)).toBe(6);
    expect(existencias(conLeche(6), 7, '2026-11-20')).toBe(3);
    expect(existencias(conLeche(6), 7, '2026-11-30')).toBe(0); // no baja de 0
    expect(existencias(leche, 7, HOY)).toBeNull(); // no se sabe
  });

  it('dice cuánto queda y para cuántos días', () => {
    const arroz = { ...nec('arroz', 320, 'g'), despensa: { cantidad: 0.68, fecha: HOY } };
    const semanal = consumoSemanal(arroz);
    expect(semanal).toBe(0.32);
    expect(diasQueQuedan(0.68, semanal)).toBe(14);
    expect(textoDespensa(arroz, estadoDespensa(arroz, semanal, HOY))).toBe(
      'Te quedan unos 680 g, para unos 14 días.',
    );
    expect(textoDespensa(leche, estadoDespensa(conLeche(0), 7, HOY))).toBe(
      'Se ha acabado (según lo que gastas).',
    );
    expect(textoDespensa(leche, estadoDespensa(leche, 7, HOY))).toBe(
      'No se sabe todavía cuánto te queda.',
    );
    expect(textoEnUnidad(1.5, leche)).toBe('1,5 litros');
  });

  it('se corrige con un toque y conserva lo que había tras la compra', () => {
    const tras = conLeche(7, '2026-11-10', 7);
    expect(corregirDespensa(tras, 0, HOY, AHORA).despensa).toEqual({
      cantidad: 0,
      fecha: HOY,
      lleno: 7,
    });
    expect(cantidadPoco(7)).toBe(2); // para unos 2 días
    expect(aComparacion(500, 'g')).toBe(0.5);
    expect(aComparacion(2, 'ud')).toBe(2);
  });

  it('al comprar, suma lo comprado a lo que quedaba', () => {
    expect(despuesDeComprar(conLeche(6, '2026-11-14'), 7, 6, HOY)).toEqual({
      cantidad: 9, // quedaban 3 + 6 comprados
      fecha: HOY,
      lleno: 9,
    });
    expect(despuesDeComprar(leche, 7, 6, HOY)).toEqual({ cantidad: 6, fecha: HOY, lleno: 6 });
  });

  it('comprueba la despensa de las copias de seguridad', () => {
    expect(despensaValida({ cantidad: 1, fecha: HOY })).toBe(true);
    expect(despensaValida({ cantidad: -1, fecha: HOY })).toBe(false);
    expect(despensaValida({ cantidad: 1, fecha: '17/11/2026' })).toBe(false);
  });
});

describe('la lista pide solo lo que falta', () => {
  it('si lo que queda no llega a la siguiente compra, toca comprar', () => {
    expect(tocaComprar(conLeche(8), HOY, 1)).toBe(false); // 8 l para 7 l
    expect(tocaComprar(conLeche(3), HOY, 1)).toBe(true);
    expect(faltaParaElPeriodo(leche, 1, 3)).toBe(4);
  });

  it('compra solo lo que falta', () => {
    const brik: ProductoApp = {
      tienda: 'mercadona',
      id: 'brik',
      nombre: 'Brik',
      formato: { cantidad: 1, unidad: 'l' },
      precio: 0.9,
      precioRef: 0.9,
    };
    const conProducto = { ...conLeche(3), equivalencias: { mercadona: { id: 'brik' } } };
    const plan = planificar([conProducto], () => brik, {
      semanas: 1,
      costeVisita: 0,
      hoy: HOY,
      tiendas: ['mercadona'],
      existencias: existenciasDe([conProducto], HOY),
    });
    // 7 litros a la semana y quedan 3: 4 briks.
    expect(plan.mejor?.compras[0]?.opcion.envases).toBe(4);
  });

  it('lo del mes no se compra mientras quede para la siguiente compra', () => {
    const detergente = {
      ...nec('detergente', 50, 'lavado', 'mes'),
      despensa: { cantidad: 30, fecha: HOY },
    };
    expect(tocaComprar(detergente, HOY, 1)).toBe(false); // 30 lavados para unos 11 a la semana
    expect(tocaComprar({ ...detergente, despensa: { cantidad: 8, fecha: HOY } }, HOY, 1)).toBe(
      true,
    );
  });
});

describe('textos de lo que queda', () => {
  it('concuerdan con la unidad y con el número', () => {
    const huevos = nec('huevos', 12, 'ud');
    expect(textoAproximado(3, huevos).texto).toBe('unas 3 unidades');
    expect(textoAproximado(0.6, nec('arroz', 300, 'g')).texto).toBe('unos 600 g');
    expect(textoAproximado(1, leche)).toEqual({ texto: 'alrededor de 1 litro', una: true });
    expect(textoDias(0)).toBe('para menos de un día');
    expect(textoDias(1)).toBe('para 1 día');
    expect(textoDias(5)).toBe('para unos 5 días');
    const conUno = { ...leche, despensa: { cantidad: 1, fecha: HOY } };
    expect(textoDespensa(conUno, estadoDespensa(conUno, 7, HOY))).toBe(
      'Te queda alrededor de 1 litro, para 1 día.',
    );
  });
});
