import { describe, expect, it } from 'vitest';
import {
  calcularPrecioRef,
  coincidePrecioRef,
  parsearCantidad,
  parsearFormatoDescripcion,
  redondear,
} from '../src/unidades.ts';

describe('calcularPrecioRef', () => {
  it('divide el precio entre la cantidad', () => {
    expect(calcularPrecioRef(4.98, 6)).toBe(0.83);
    expect(calcularPrecioRef(0.48, 0.15)).toBe(3.2);
  });

  it('redondea a 4 decimales para productos muy baratos por unidad', () => {
    expect(calcularPrecioRef(4.6, 600)).toBe(0.0077);
  });

  it('no arrastra errores de coma flotante', () => {
    expect(redondear(1.005, 2)).toBe(1.01);
  });
});

describe('coincidePrecioRef', () => {
  it('acepta el redondeo a céntimos de la tienda', () => {
    expect(coincidePrecioRef(0.3583, 0.36)).toBe(true);
    expect(coincidePrecioRef(0.0812, 0.08)).toBe(true);
  });

  it('acepta diferencias de hasta un 2 %', () => {
    expect(coincidePrecioRef(10.15, 10)).toBe(true);
  });

  it('rechaza diferencias mayores', () => {
    expect(coincidePrecioRef(10.3, 10)).toBe(false);
    expect(coincidePrecioRef(0.07, 1.17)).toBe(false);
  });
});

describe('parsearCantidad', () => {
  it.each([
    ['1 Kg', 1, 'kg'],
    ['100 Gr', 0.1, 'kg'],
    ['1 L', 1, 'l'],
    ['100 Ml', 0.1, 'l'],
    ['1 U', 1, 'ud'],
  ] as const)('%s', (texto, cantidad, unidad) => {
    expect(parsearCantidad(texto)).toEqual({ cantidad, unidad });
  });

  it('devuelve null si no lo entiende', () => {
    expect(parsearCantidad('Docena')).toBeNull();
    expect(parsearCantidad('')).toBeNull();
  });
});

describe('parsearFormatoDescripcion', () => {
  it.each([
    ['Leche Semidesnatada Brik 1 L', 'l', 1],
    ['Gaseosa Botella 0,5 L', 'l', 0.5],
    ['Mistela Moscatel D.O. Valencia 0,75 L', 'l', 0.75],
    ['Rabanito Bolsa 250 Gr', 'kg', 0.25],
    ['Cebolla Seca Malla 1 kg', 'kg', 1],
    ['Laurel en Hojas Caja 15 Gr', 'kg', 0.015],
    ['Postre Sabor Trufa Pack de 2 Unidades 2 x 125 Gr', 'kg', 0.25],
    ['Activia Frutas Bosque Yogur Bífidus P-4 ud. 4 x 120 Gr', 'kg', 0.48],
    ['Mejillones Gallegos Escabeche Pack de 3 3 x 40 Gr', 'kg', 0.12],
    ['Tortillas de Trigo Paquete 8 Unidades 326 Gr', 'kg', 0.326],
    ['Lechuga Iceberg Peso Aproximado 350 Gr. 0,35 Kg', 'kg', 0.35],
    ['Cerveza Lata 33 cl', 'l', 0.33],
    ['Tortillas de Trigo Paquete 8 Unidades 326 Gr', 'ud', 8],
  ] as const)('%s → %s %s', (descripcion, unidad, cantidad) => {
    expect(parsearFormatoDescripcion(descripcion, unidad)).toEqual({ cantidad, unidad });
  });

  it('devuelve null si la descripción no indica medida', () => {
    expect(parsearFormatoDescripcion('Ciruela Roja', 'kg')).toBeNull();
    expect(parsearFormatoDescripcion('Melón Piel de Sapo Entero', 'kg')).toBeNull();
  });

  it('devuelve null si la medida no es de la unidad pedida', () => {
    expect(parsearFormatoDescripcion('Leche Semidesnatada Brik 1 L', 'kg')).toBeNull();
  });
});
