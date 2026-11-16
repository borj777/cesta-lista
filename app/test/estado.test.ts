import { describe, expect, it } from 'vitest';
import { avisosPrecios, esDatosApp, fechaCorta, resumenTiendas } from '../src/estado.ts';
import type { DatosApp, ProductoApp } from '../src/tipos.ts';

const AYER_7 = '2026-11-16T06:05:00.000Z'; // 16/11 a las 7:05 en España
const AHORA = new Date('2026-11-16T19:00:00.000Z');

const producto = (tienda: 'mercadona' | 'consum', id: string): ProductoApp => ({
  tienda,
  id,
  nombre: `Producto ${id}`,
  formato: { cantidad: 1, unidad: 'kg' },
  precio: 1,
  precioRef: 1,
});

function datos(tiendas: DatosApp['tiendas']): DatosApp {
  return {
    generado: AYER_7,
    tiendas,
    productos: [producto('mercadona', '1'), producto('mercadona', '2'), producto('consum', '3')],
  };
}

describe('avisosPrecios', () => {
  it('no avisa si las dos tiendas tienen precios de hoy', () => {
    const d = datos({
      mercadona: { estado: 'ok', actualizado: AYER_7 },
      consum: { estado: 'ok', actualizado: AYER_7 },
    });
    expect(avisosPrecios(d, AHORA)).toEqual([]);
  });

  it('avisa si una tienda falló, con la fecha de los precios guardados', () => {
    const d = datos({
      mercadona: { estado: 'ok', actualizado: AYER_7 },
      consum: { estado: 'fallida', actualizado: '2026-11-15T06:05:00.000Z' },
    });
    expect(avisosPrecios(d, AHORA)).toEqual([
      {
        tienda: 'consum',
        tipo: 'fallida',
        texto: 'La última descarga de Consum ha fallado: precios de Consum del día 15/11.',
      },
    ]);
  });

  it('avisa si los precios tienen más de 36 horas, aunque la última descarga fuera bien', () => {
    const d = datos({
      mercadona: { estado: 'ok', actualizado: '2026-11-14T06:05:00.000Z' },
      consum: { estado: 'ok', actualizado: AYER_7 },
    });
    const avisos = avisosPrecios(d, AHORA);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatchObject({ tienda: 'mercadona', tipo: 'antigua' });
    expect(avisos[0]?.texto).toContain('del día 14/11');
  });

  it('no avisa con 35 horas, sí con 37', () => {
    const hace = (horas: number) => new Date(AHORA.getTime() - horas * 3_600_000).toISOString();
    const con = (horas: number) =>
      datos({
        mercadona: { estado: 'ok', actualizado: hace(horas) },
        consum: { estado: 'ok', actualizado: AYER_7 },
      });
    expect(avisosPrecios(con(35), AHORA)).toEqual([]);
    expect(avisosPrecios(con(37), AHORA)).toHaveLength(1);
  });

  it('avisa si una tienda no tiene precios todavía', () => {
    const d = datos({ mercadona: { estado: 'ok', actualizado: AYER_7 } });
    expect(avisosPrecios(d, AHORA)).toEqual([
      { tienda: 'consum', tipo: 'sin-datos', texto: 'Todavía no hay precios de Consum.' },
    ]);
  });
});

describe('resumenTiendas', () => {
  it('cuenta los productos de cada tienda y marca las que tienen avisos', () => {
    const d = datos({
      mercadona: { estado: 'ok', actualizado: AYER_7 },
      consum: { estado: 'fallida', actualizado: AYER_7 },
    });
    expect(resumenTiendas(d, AHORA)).toEqual([
      {
        tienda: 'mercadona',
        nombre: 'Mercadona',
        productos: 2,
        actualizado: AYER_7,
        correcto: true,
      },
      { tienda: 'consum', nombre: 'Consum', productos: 1, actualizado: AYER_7, correcto: false },
    ]);
  });
});

describe('fechas y formato', () => {
  it('muestra la fecha en hora de España', () => {
    // 23:30 UTC del 16/11 ya es el 17/11 en España.
    expect(fechaCorta('2026-11-16T23:30:00.000Z')).toBe('17/11');
  });

  it('reconoce el formato de app.json', () => {
    expect(esDatosApp(datos({}))).toBe(true);
    expect(esDatosApp({ productos: [] })).toBe(false);
    expect(esDatosApp('<html>')).toBe(false);
  });
});
