import { describe, expect, it } from 'vitest';
import {
  alternar,
  empezarCompra,
  leerCompra,
  porTienda,
  repartirNecesidades,
  seAcaba,
  terminarCompra,
  tocaComprar,
} from '../src/lista/compra.ts';
import { crearNecesidad, type Necesidad } from '../src/necesidades/modelo.ts';
import { cantidadEnPeriodo, planificar } from '../src/optimizador.ts';
import { listaTiendas } from '../src/tiendas/modelo.ts';
import type { ProductoApp } from '../src/tipos.ts';

const AHORA = '2026-11-17T10:00:00.000Z';
const HOY = '2026-11-17';
const SEMANA = 1;

function necesidad(
  id: string,
  frecuencia: Necesidad['frecuencia'],
  extra: Partial<Necesidad> = {},
): Necesidad {
  return {
    ...crearNecesidad(
      { nombre: id, categoria: 'limpieza', cantidad: 50, unidad: 'lavado', frecuencia },
      AHORA,
      id,
    ),
    ...extra,
  };
}

describe('lo que dura más que una compra', () => {
  const detergente = necesidad('detergente', 'mes');

  it('lo que se gasta cada semana se compra siempre', () => {
    expect(tocaComprar(necesidad('leche', 'semana', { ultimaCompra: HOY }), HOY, SEMANA)).toBe(
      true,
    );
  });

  it('lo del mes se compra la primera vez y luego solo cuando se va a acabar', () => {
    expect(tocaComprar(detergente, HOY, SEMANA)).toBe(true); // nunca comprado
    const comprado = { ...detergente, ultimaCompra: '2026-11-01' };
    // Un mes son unas 30 días: se acaba hacia el 01/12.
    expect(seAcaba(comprado)).toBe('2026-12-01');
    // El 17/11 la siguiente compra es el 24/11: aún queda.
    expect(tocaComprar(comprado, HOY, SEMANA)).toBe(false);
    // El 24/11 la siguiente compra sería el 01/12: toca comprarlo.
    expect(tocaComprar(comprado, '2026-11-24', SEMANA)).toBe(true);
    // Si se compra cada mes, entra siempre.
    expect(tocaComprar(comprado, HOY, 52 / 12)).toBe(true);
  });

  it('se puede adelantar si se ha acabado antes', () => {
    const comprado = { ...detergente, ultimaCompra: '2026-11-10' };
    expect(repartirNecesidades([comprado], HOY, SEMANA, [])).toEqual({
      tocan: [],
      quedan: [comprado],
    });
    expect(repartirNecesidades([comprado], HOY, SEMANA, ['detergente']).tocan).toEqual([comprado]);
  });

  it('cuando toca, se compra para todo su tiempo y no solo para una semana', () => {
    expect(cantidadEnPeriodo(detergente, SEMANA)).toBe(50);
    expect(cantidadEnPeriodo(necesidad('leche', 'semana'), 2)).toBe(100);
  });
});

describe('la compra en la tienda', () => {
  const producto = (tienda: string, id: string, precio: number): ProductoApp => ({
    tienda,
    id,
    nombre: `Producto ${id}`,
    formato: { cantidad: 1, unidad: 'ud' },
    precio,
    precioRef: precio,
  });
  const catalogo = [
    producto('mercadona', 'pan', 1),
    producto('consum', 'pan', 1.5),
    producto('lidl', 'queso', 3),
  ];
  const buscar = (t: string, id: string) => catalogo.find((p) => p.tienda === t && p.id === id);
  const base = (id: string, equivalencias: Necesidad['equivalencias']): Necesidad => ({
    ...crearNecesidad(
      { nombre: id, categoria: 'alimentacion', cantidad: 2, unidad: 'ud', frecuencia: 'semana' },
      AHORA,
      id,
    ),
    equivalencias,
  });
  const pan = base('pan', { mercadona: { id: 'pan' }, consum: { id: 'pan' } });
  const queso = base('queso', { lidl: { id: 'queso' } });
  const tiendas = listaTiendas(
    [{ id: 'lidl', nombre: 'Lidl', color: '#1d5fb0', creada: AHORA }],
    [],
  );
  const plan = planificar([pan, queso], buscar, {
    semanas: 1,
    costeVisita: 0,
    hoy: HOY,
    tiendas: tiendas.map((t) => t.id),
  });
  const compra = empezarCompra(plan, tiendas, AHORA);
  if (!compra) throw new Error('Debería haber compra');

  it('fija lo que hay que comprar en cada tienda, todo en la estantería', () => {
    expect(compra.tiendas.map((t) => t.nombre)).toEqual(['Mercadona', 'Lidl']);
    expect(compra.lineas).toEqual([
      expect.objectContaining({ necesidad: 'pan', tienda: 'mercadona', envases: 2, coste: 2 }),
      expect.objectContaining({ necesidad: 'queso', tienda: 'lidl', envases: 2, coste: 6 }),
    ]);
    expect(compra.lineas.every((l) => !l.enCarro)).toBe(true);
  });

  it('al tocar algo pasa al carro, y al volver a tocarlo vuelve a la estantería', () => {
    const conPan = alternar(compra, 'pan');
    const [mercadona, lidl] = porTienda(conPan);
    expect(mercadona).toMatchObject({ total: 2, enCarro: 2 });
    expect(mercadona?.estanteria).toEqual([]);
    expect(mercadona?.carro.map((l) => l.necesidad)).toEqual(['pan']);
    expect(lidl).toMatchObject({ total: 6, enCarro: 0 });
    expect(alternar(conPan, 'pan')).toEqual(compra);
  });

  it('al terminar apunta la fecha en lo que va en el carro', () => {
    const conPan = alternar(compra, 'pan');
    expect(terminarCompra(conPan, [pan, queso], HOY, false)).toEqual([
      { ...pan, ultimaCompra: HOY },
    ]);
    // «También lo he comprado»: también lo que quedó en la estantería.
    expect(terminarCompra(conPan, [pan, queso], HOY, true).map((n) => n.id)).toEqual([
      'pan',
      'queso',
    ]);
  });

  it('una compra guardada se lee igual, y una dañada se descarta', () => {
    expect(leerCompra(JSON.parse(JSON.stringify(compra)))).toEqual(compra);
    expect(leerCompra({ ...compra, lineas: [{ necesidad: 'pan' }] })).toBeNull();
    expect(leerCompra('hola')).toBeNull();
    expect(leerCompra(undefined)).toBeNull();
  });
});
