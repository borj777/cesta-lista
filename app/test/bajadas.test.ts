import { describe, expect, it } from 'vitest';
import { leerAjustesCompra } from '../src/ajustes.ts';
import {
  anotarVistas,
  bajadasDePrecio,
  claveBajada,
  leerVistas,
} from '../src/historial/bajadas.ts';
import { crearNecesidad, type Necesidad } from '../src/necesidades/modelo.ts';
import type { ProductoApp } from '../src/tipos.ts';

const HOY = '2026-11-20';
const AHORA = '2026-11-15T10:00:00.000Z';

const producto = (
  tienda: string,
  id: string,
  precioRef: number,
  extra: Partial<ProductoApp> = {},
): ProductoApp => ({
  tienda,
  id,
  nombre: `Producto ${id}`,
  formato: { cantidad: 1, unidad: 'kg' },
  precio: precioRef,
  precioRef,
  ...extra,
});

const productos = [
  // Baja un 10 %.
  producto('mercadona', '1', 9, { cambio: { dia: '2026-11-18', antes: 10, antesRef: 10 } }),
  // Baja un 4 %: no llega al 5 %.
  producto('consum', '2', 4.8, { cambio: { dia: '2026-11-19', antes: 5, antesRef: 5 } }),
  // Sube.
  producto('consum', '3', 6, { cambio: { dia: '2026-11-19', antes: 5, antesRef: 5 } }),
  // Bandeja de carne: el envase baja un 20 %, pero el €/kg no cambia.
  producto('mercadona', '4', 8, {
    precio: 4,
    cambio: { dia: '2026-11-19', antes: 5, antesRef: 8 },
  }),
  // Baja un 25 %, pero es una oferta que ya ha terminado: hoy vuelve a costar lo de antes.
  producto('consum', '5', 3, {
    precioAnterior: 4,
    ofertaHasta: '2026-11-19',
    cambio: { dia: '2026-11-16', antes: 4, antesRef: 4 },
  }),
  // Baja justo un 5 %.
  producto('consum', '6', 1.9, { cambio: { dia: '2026-11-17', antes: 2, antesRef: 2 } }),
];
const buscar = (tienda: string, id: string) =>
  productos.find((p) => p.tienda === tienda && p.id === id);

function necesidad(id: string, nombre: string, equivalencias: Necesidad['equivalencias']) {
  return {
    ...crearNecesidad(
      { nombre, categoria: 'alimentacion', cantidad: 1, unidad: 'kg', frecuencia: 'semana' },
      AHORA,
      id,
    ),
    equivalencias,
  };
}

const necesidades: Necesidad[] = [
  necesidad('a', 'Pechuga', { mercadona: { id: '1' }, consum: { id: '2' } }),
  necesidad('b', 'Arroz', { consum: { id: '3' }, mercadona: { id: '4', auto: true } }),
  necesidad('c', 'Lentejas', { consum: { id: '5' }, mercadona: { noCompro: true } }),
  necesidad('d', 'Garbanzos', { consum: { id: '6', auto: true } }),
  // El mismo producto en otra necesidad: sale una sola vez.
  necesidad('e', 'Pollo para la paella', { mercadona: { id: '1' } }),
];

const opciones = { hoy: HOY, minimo: 5, activas: ['mercadona', 'consum'], vistas: [] };

describe('avisos de bajadas de precio', () => {
  it('avisa de lo elegido (a mano o por la app) que baja al menos el mínimo, de más a menos', () => {
    const bajadas = bajadasDePrecio(necesidades, buscar, opciones);
    expect(
      bajadas.map((b) => [b.necesidad.nombre, b.tienda, b.producto.id, b.porcentaje, b.dia]),
    ).toEqual([
      ['Pechuga', 'mercadona', '1', 10, '2026-11-18'],
      ['Garbanzos', 'consum', '6', 5, '2026-11-17'],
    ]);
    expect(bajadas[0]).toMatchObject({
      antesRef: 10,
      ahoraRef: 9,
      clave: 'mercadona:1:2026-11-18',
    });
  });

  it('con otro mínimo, avisa de más o de menos; con 0, de nada', () => {
    const ids = (minimo: number) =>
      bajadasDePrecio(necesidades, buscar, { ...opciones, minimo }).map((b) => b.producto.id);
    expect(ids(3)).toEqual(['1', '6', '2']);
    expect(ids(10)).toEqual(['1']);
    expect(ids(20)).toEqual([]);
    expect(ids(0)).toEqual([]);
  });

  it('no avisa de las tiendas apagadas ni de lo ya visto', () => {
    expect(
      bajadasDePrecio(necesidades, buscar, { ...opciones, activas: ['consum'] }).map(
        (b) => b.producto.id,
      ),
    ).toEqual(['6']);
    expect(
      bajadasDePrecio(necesidades, buscar, {
        ...opciones,
        vistas: [claveBajada('mercadona', '1', '2026-11-18')],
      }).map((b) => b.producto.id),
    ).toEqual(['6']);
  });

  it('si vuelve a bajar otro día, es un aviso nuevo aunque se viera el anterior', () => {
    const otraVez = productos.map((p) =>
      p.id === '1'
        ? { ...p, precioRef: 8, cambio: { dia: '2026-11-20', antes: 9, antesRef: 9 } }
        : p,
    );
    const bajadas = bajadasDePrecio(
      necesidades,
      (t, id) => otraVez.find((p) => p.tienda === t && p.id === id),
      { ...opciones, vistas: [claveBajada('mercadona', '1', '2026-11-18')] },
    );
    expect(bajadas[0]).toMatchObject({ clave: 'mercadona:1:2026-11-20', porcentaje: 11 });
  });

  it('recuerda lo visto un mes, sin repetidos', () => {
    expect(
      anotarVistas(
        ['mercadona:1:2026-10-01', 'consum:2:2026-11-01'],
        ['consum:2:2026-11-01', 'consum:9:2026-11-20'],
        HOY,
      ),
    ).toEqual(['consum:2:2026-11-01', 'consum:9:2026-11-20']);
    expect(leerVistas(['consum:2:2026-11-01', 'mal', 3, 'consum::2026-11-01'])).toEqual([
      'consum:2:2026-11-01',
    ]);
    expect(leerVistas(null)).toEqual([]);
  });

  it('el mínimo es un 5 % si no se ha elegido otro válido', () => {
    expect(leerAjustesCompra({}).avisoBajada).toBe(5);
    expect(leerAjustesCompra({ avisoBajada: 0 }).avisoBajada).toBe(0);
    expect(leerAjustesCompra({ avisoBajada: 20 }).avisoBajada).toBe(20);
    expect(leerAjustesCompra({ avisoBajada: 7 }).avisoBajada).toBe(5);
  });
});
