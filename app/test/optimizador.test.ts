import { describe, expect, it } from 'vitest';
import { crearNecesidad, type Necesidad, type UnidadNecesidad } from '../src/necesidades/modelo.ts';
import {
  analizar,
  cantidadEnPeriodo,
  combinacionesDe,
  opcionDe,
  planificar,
  type OpcionesPlan,
} from '../src/optimizador.ts';
import type { ProductoApp, Unidad } from '../src/tipos.ts';

type Tienda = string;

const AHORA = '2026-11-16T10:00:00.000Z';
const HOY = '2026-11-16';

/** Catálogo de prueba: tienda:id → producto. */
const catalogo = new Map<string, ProductoApp>();
function producto(
  tienda: Tienda,
  id: string,
  precio: number,
  cantidad: number,
  unidad: Unidad,
  extra: Partial<ProductoApp> = {},
): string {
  catalogo.set(`${tienda}:${id}`, {
    tienda,
    id,
    nombre: id,
    formato: { cantidad, unidad },
    precio,
    precioRef: Math.round((precio / cantidad) * 10_000) / 10_000,
    ...extra,
  });
  return id;
}
const buscarProducto = (tienda: Tienda, id: string) => catalogo.get(`${tienda}:${id}`);
/** Producto del catálogo que tiene que existir. */
function de(tienda: Tienda, id: string): ProductoApp {
  const p = buscarProducto(tienda, id);
  if (!p) throw new Error(`Falta ${tienda}:${id} en el catálogo de prueba`);
  return p;
}

function necesidad(
  nombre: string,
  cantidad: number,
  unidad: UnidadNecesidad,
  equivalencias: Necesidad['equivalencias'],
  frecuencia: Necesidad['frecuencia'] = 'semana',
): Necesidad {
  return {
    ...crearNecesidad(
      { nombre, categoria: 'alimentacion', cantidad, unidad, frecuencia },
      AHORA,
      nombre,
    ),
    equivalencias,
  };
}

const TRES = ['mercadona', 'consum', 'lidl'];
const opciones = (costeVisita: number, semanas = 1, tiendas = TRES): OpcionesPlan => ({
  semanas,
  costeVisita,
  hoy: HOY,
  tiendas,
});

// Leche: 6 l a la semana. Mercadona 0,83 €/l en pack de 6; Consum 0,83 €/l en brik; Lidl 0,79 €/l.
producto('mercadona', 'leche-m', 4.98, 6, 'l');
producto('consum', 'leche-c', 0.83, 1, 'l');
producto('lidl', 'leche-l', 4.74, 6, 'l');
const leche = necesidad('leche', 6, 'l', {
  mercadona: { id: 'leche-m' },
  consum: { id: 'leche-c' },
  lidl: { id: 'leche-l' },
});

// Pollo: 1,5 kg a la semana. Mercadona 6,50 €/kg en bandejas de 500 g; Consum 5,90 €/kg.
producto('mercadona', 'pollo-m', 3.25, 0.5, 'kg');
producto('consum', 'pollo-c', 2.95, 0.5, 'kg');
const pollo = necesidad('pollo', 1.5, 'kg', {
  mercadona: { id: 'pollo-m' },
  consum: { id: 'pollo-c' },
  lidl: { noCompro: true },
});

describe('cantidad y envases', () => {
  it('pasa la cantidad al periodo de la compra y los g y ml a kg y litros', () => {
    expect(cantidadEnPeriodo(leche, 1)).toBe(6);
    expect(cantidadEnPeriodo(leche, 2)).toBe(12);
    const arroz = necesidad('arroz', 2, 'kg', {}, 'mes');
    expect(cantidadEnPeriodo(arroz, 52 / 12)).toBeCloseTo(2);
    expect(cantidadEnPeriodo(necesidad('cafe', 250, 'g', {}), 1)).toBe(0.25);
  });

  it('compra envases enteros, redondeando hacia arriba', () => {
    const bandeja = de('mercadona', 'pollo-m');
    expect(opcionDe('mercadona', bandeja, 1.5, 'kg', HOY)).toMatchObject({
      envases: 3, // 1,5 / 0,5 son 3 justos (sin errores de decimales)
      coste: 9.75,
    });
    expect(opcionDe('mercadona', bandeja, 1.6, 'kg', HOY)?.envases).toBe(4);
    // Aunque se gaste poco en el periodo, se compra al menos un envase.
    expect(opcionDe('mercadona', bandeja, 0.1, 'kg', HOY)?.envases).toBe(1);
  });

  it('usa el precio de oferta solo mientras dura', () => {
    const oferta = producto('consum', 'oferta', 1, 1, 'l', {
      precioAnterior: 1.5,
      oferta: 'Ahora más barato',
      ofertaHasta: '2026-11-18',
    });
    const p = de('consum', oferta);
    expect(opcionDe('consum', p, 2, 'l', '2026-11-18')?.coste).toBe(2);
    expect(opcionDe('consum', p, 2, 'l', '2026-11-19')?.coste).toBe(3);
  });

  it('con otra unidad, si la necesidad va por unidades se compra un envase por unidad', () => {
    const detergente = de('mercadona', producto('mercadona', 'det', 6, 50, 'lavado'));
    expect(opcionDe('mercadona', detergente, 2, 'ud', HOY)).toMatchObject({
      envases: 2,
      coste: 12,
      porEnvase: true,
    });
    // Si va por kg y el producto por unidades, no se puede saber cuántos comprar.
    expect(opcionDe('mercadona', detergente, 2, 'kg', HOY)).toBeNull();
  });

  it('avisa de los productos que ya no están y de los que no se pueden comparar', () => {
    const rara = necesidad('rara', 1, 'kg', {
      mercadona: { id: 'no-existe' },
      consum: { id: 'leche-c' },
    });
    expect(analizar([rara], buscarProducto, 1, HOY, TRES)[0]?.problemas).toEqual([
      { tienda: 'mercadona', tipo: 'desaparecido' },
      { tienda: 'consum', tipo: 'otra-unidad' },
    ]);
  });
});

describe('planificar', () => {
  it('con 3 tiendas hay 7 combinaciones; con 4, 15', () => {
    expect(combinacionesDe(TRES)).toEqual([
      ['mercadona'],
      ['consum'],
      ['lidl'],
      ['mercadona', 'consum'],
      ['mercadona', 'lidl'],
      ['consum', 'lidl'],
      ['mercadona', 'consum', 'lidl'],
    ]);
    expect(combinacionesDe([...TRES, 'fruteria'])).toHaveLength(15);
    expect(combinacionesDe([])).toEqual([]);
    expect(planificar([leche], buscarProducto, opciones(2)).combinaciones).toHaveLength(7);
  });

  it('solo combina las tiendas donde se puede comprar algo', () => {
    // El pollo no tiene producto en Lidl ni en la frutería: solo cuentan Mercadona y Consum.
    const plan = planificar([pollo], buscarProducto, opciones(2, 1, [...TRES, 'fruteria']));
    expect(plan.combinaciones.map((r) => r.tiendas)).toEqual([
      ['consum'],
      ['mercadona'],
      ['mercadona', 'consum'],
    ]);
  });

  it('tiene en cuenta las tiendas propias que añade el usuario', () => {
    // Frutería: naranjas a 1,25 €/kg, más baratas que en Mercadona (1,80 €/kg).
    producto('mercadona', 'naranja-m', 3.6, 2, 'kg');
    producto('fruteria', 'naranja-f', 2.5, 2, 'kg');
    const naranjas = necesidad('naranjas', 2, 'kg', {
      mercadona: { id: 'naranja-m' },
      fruteria: { id: 'naranja-f' },
    });
    const tiendas = [...TRES, 'fruteria'];
    const plan = planificar([leche, naranjas], buscarProducto, opciones(0, 1, tiendas));
    expect(plan.mejor?.tiendas).toEqual(['lidl', 'fruteria']);
    expect(plan.mejor?.total).toBe(7.24); // 4,74 + 2,50
    // Con 2 € por tienda extra, ahorrar 1,10 € en naranjas no compensa.
    const caro = planificar([leche, naranjas], buscarProducto, opciones(2, 1, tiendas));
    expect(caro.mejor?.tiendas).toEqual(['mercadona']);
  });

  it('no tiene en cuenta lo elegido en las tiendas apagadas', () => {
    // Con Lidl apagada, la leche se compra en Mercadona o Consum aunque Lidl sea más barata.
    const plan = planificar(
      [leche, pollo],
      buscarProducto,
      opciones(0, 1, ['mercadona', 'consum']),
    );
    expect(plan.mejor?.tiendas).toEqual(['consum']);
    expect(plan.combinaciones.some((r) => r.tiendas.includes('lidl'))).toBe(false);
    expect(plan.analisis[0]?.opciones.lidl).toBeUndefined();
    expect(plan.analisis[0]?.problemas).toEqual([]);
  });

  it('una necesidad que solo se compra en una tienda apagada queda sin producto', () => {
    producto('lidl', 'pan-l', 1, 0.5, 'kg');
    const panLidl = necesidad('pan de Lidl', 0.5, 'kg', { lidl: { id: 'pan-l' } });
    const plan = planificar([leche, panLidl], buscarProducto, opciones(2, 1, ['mercadona']));
    expect(plan.sinProducto.map((n) => n.nombre)).toEqual(['pan de Lidl']);
    expect(plan.mejor?.tiendas).toEqual(['mercadona']);
  });

  it('con coste por visita 0 compra cada cosa donde es más barata', () => {
    const plan = planificar([leche, pollo], buscarProducto, opciones(0));
    expect(plan.mejor?.tiendas).toEqual(['consum', 'lidl']);
    expect(plan.mejor?.compras.map((c) => [c.analisis.necesidad.nombre, c.opcion.tienda])).toEqual([
      ['leche', 'lidl'],
      ['pollo', 'consum'],
    ]);
    // Leche 4,74 en Lidl + pollo 3 × 2,95 en Consum.
    expect(plan.mejor).toMatchObject({ costeProductos: 13.59, costeVisitas: 0, total: 13.59 });
    // Comprarlo todo en Consum: 6 × 0,83 + 8,85 = 13,83. Ahorro: 0,24 €.
    expect(plan.unaTienda?.tiendas).toEqual(['consum']);
    expect(plan.ahorro).toBe(0.24);
  });

  it('con un coste por visita alto compra todo en una sola tienda', () => {
    const plan = planificar([leche, pollo], buscarProducto, opciones(5));
    expect(plan.mejor?.tiendas).toEqual(['consum']);
    expect(plan.mejor).toMatchObject({ costeProductos: 13.83, costeVisitas: 0, total: 13.83 });
    expect(plan.ahorro).toBe(0);
  });

  it('el coste por visita se suma por cada tienda extra', () => {
    const plan = planificar([leche, pollo], buscarProducto, opciones(0.1));
    // Consum + Lidl: 13,59 + 0,10 = 13,69, más barato que Consum sola (13,83).
    expect(plan.mejor).toMatchObject({
      tiendas: ['consum', 'lidl'],
      costeVisitas: 0.1,
      total: 13.69,
    });
    const tres = plan.combinaciones.find((r) => r.tiendas.length === 3);
    expect(tres?.costeVisitas).toBe(0.2);
  });

  it('si dos combinaciones cuestan lo mismo, elige la de menos tiendas', () => {
    // Mercadona y Consum cuestan lo mismo para la leche (4,98): basta con una tienda.
    const soloLeche = necesidad('leche', 6, 'l', {
      mercadona: { id: 'leche-m' },
      consum: { id: 'leche-c' },
    });
    const plan = planificar([soloLeche], buscarProducto, opciones(0));
    expect(plan.mejor?.tiendas).toEqual(['mercadona']);
    expect(plan.mejor?.total).toBe(4.98);
  });

  it('si una cosa cuesta lo mismo en dos tiendas, elige la de menor precio por unidad', () => {
    producto('mercadona', 'pan-m', 1, 0.5, 'kg'); // 2 €/kg
    producto('consum', 'pan-c', 1, 0.4, 'kg'); // 2,50 €/kg
    const pan = necesidad('pan', 0.3, 'kg', {
      mercadona: { id: 'pan-m' },
      consum: { id: 'pan-c' },
    });
    const plan = planificar([pan], buscarProducto, opciones(0));
    const ambas = plan.combinaciones.find((r) => r.tiendas.length === 2);
    expect(ambas?.compras[0]?.opcion.tienda).toBe('mercadona');
  });

  it('no elige una combinación en la que falta algo, aunque sea más barata', () => {
    // El pollo no se compra en Lidl: Lidl sola sale más barata (solo la leche), pero le falta.
    const plan = planificar([leche, pollo], buscarProducto, opciones(100));
    const lidl = plan.combinaciones.find((r) => r.tiendas.join() === 'lidl');
    expect(lidl).toMatchObject({ completa: false, total: 4.74 });
    expect(lidl?.faltan.map((n) => n.nombre)).toEqual(['pollo']);
    expect(plan.mejor?.completa).toBe(true);
    expect(plan.mejor?.tiendas).toEqual(['consum']);
    // Las completas van primero en la lista.
    expect(plan.combinaciones.at(-1)?.completa).toBe(false);
  });

  it('si ninguna tienda sola tiene todo, no calcula ahorro frente a una sola tienda', () => {
    producto('lidl', 'queso-l', 3, 0.25, 'kg');
    const queso = necesidad('queso', 0.25, 'kg', { lidl: { id: 'queso-l' } });
    const plan = planificar([pollo, queso], buscarProducto, opciones(2));
    expect(plan.mejor?.tiendas).toEqual(['consum', 'lidl']);
    expect(plan.unaTienda).toBeNull();
    expect(plan.ahorro).toBeNull();
  });

  it('las necesidades sin producto elegido no entran en el cálculo, pero se avisan', () => {
    const huevos = necesidad('huevos', 12, 'ud', undefined);
    const plan = planificar([leche, huevos], buscarProducto, opciones(2));
    expect(plan.sinProducto.map((n) => n.nombre)).toEqual(['huevos']);
    expect(plan.mejor).toMatchObject({ tiendas: ['lidl'], completa: true, total: 4.74 });
  });

  it('sin nada que comprar no hay plan', () => {
    const plan = planificar(
      [necesidad('huevos', 12, 'ud', undefined)],
      buscarProducto,
      opciones(2),
    );
    expect(plan.mejor).toBeNull();
    expect(plan.ahorro).toBeNull();
  });

  it('una compra para dos semanas compra el doble', () => {
    const plan = planificar([pollo], buscarProducto, opciones(0, 2));
    expect(plan.mejor?.compras[0]?.opcion).toMatchObject({ tienda: 'consum', envases: 6 });
  });
});
