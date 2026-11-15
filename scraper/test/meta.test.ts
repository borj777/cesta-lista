import { describe, expect, it } from 'vitest';
import {
  estadoTienda,
  leerProductos,
  MAX_EJEMPLOS,
  MetaSchema,
  serializarProductos,
  type EstadoTienda,
} from '../src/meta.ts';
import type { Producto, ResultadoAdaptador } from '../src/tipos.ts';
import { AHORA } from './ayudas.ts';

const AYER = '2026-11-14T06:00:00.000Z';

const producto: Producto = {
  tienda: 'mercadona',
  id: '3819',
  nombre: 'Plátano de Canarias IGP',
  formato: { cantidad: 0.15, unidad: 'kg' },
  precio: 0.48,
  precioRef: 3.2,
  actualizado: AYER,
};

const resultado: ResultadoAdaptador = {
  productos: [producto],
  avisos: Array.from({ length: 30 }, (_, i) => ({
    id: String(i),
    nombre: `P${i}`,
    unidad: 'ud' as const,
    calculado: 1,
    tienda: 2,
  })),
  sinVerificar: 3,
  descartados: 1,
  recibidos: 2,
};

const previo: EstadoTienda = {
  estado: 'ok',
  actualizado: AYER,
  comprobado: AYER,
  productos: 5000,
  duracionSegundos: 300,
  peticiones: 154,
  sinVerificar: 0,
  descartados: 0,
  avisosPrecioRef: 0,
  ejemplosAvisos: [],
};

describe('estadoTienda', () => {
  it('registra una descarga buena con sus recuentos', () => {
    const e = estadoTienda({
      previo,
      ahora: AHORA,
      duracionSegundos: 312.4,
      peticiones: 155,
      resultado,
      veredicto: { valido: true },
    });
    expect(e).toMatchObject({
      estado: 'ok',
      actualizado: AHORA,
      comprobado: AHORA,
      productos: 1,
      duracionSegundos: 312,
      avisosPrecioRef: 30,
      sinVerificar: 3,
      descartados: 1,
    });
    expect(e.ejemplosAvisos).toHaveLength(MAX_EJEMPLOS);
    expect(e.motivo).toBeUndefined();
  });

  it('si falla, conserva la fecha y el número de productos del último día bueno', () => {
    const e = estadoTienda({
      previo,
      ahora: AHORA,
      duracionSegundos: 10,
      peticiones: 3,
      resultado: null,
      veredicto: { valido: false, motivo: 'La tienda ha devuelto 0 productos' },
    });
    expect(e).toMatchObject({
      estado: 'fallida',
      actualizado: AYER,
      comprobado: AHORA,
      productos: 5000,
      motivo: 'La tienda ha devuelto 0 productos',
    });
    expect(MetaSchema.safeParse({ generado: AHORA, tiendas: { mercadona: e } }).success).toBe(true);
  });

  it('si falla la primera vez, indica que nunca ha habido datos', () => {
    const e = estadoTienda({
      previo: undefined,
      ahora: AHORA,
      duracionSegundos: 1,
      peticiones: 1,
      resultado: null,
      veredicto: { valido: false, motivo: 'Sin conexión' },
    });
    expect(e).toMatchObject({ estado: 'fallida', actualizado: null, productos: 0 });
  });
});

describe('archivos de productos', () => {
  it('escribe un producto por línea y se puede volver a leer', () => {
    const texto = serializarProductos([producto, { ...producto, id: '8280' }]);
    expect(texto.split('\n')).toHaveLength(5);
    expect(leerProductos(JSON.parse(texto))).toHaveLength(2);
  });

  it('ignora un archivo con datos no válidos', () => {
    expect(leerProductos([{ id: 'x' }])).toBeNull();
    expect(leerProductos(null)).toBeNull();
  });
});
