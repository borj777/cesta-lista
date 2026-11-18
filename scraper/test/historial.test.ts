import { describe, expect, it } from 'vitest';
import { construirApp } from '../src/app.ts';
import {
  anotarDia,
  cambioReciente,
  diaEspana,
  leerTrozo,
  serializarTrozos,
  sumarDias,
  trozoDe,
  TROZOS,
  type Historial,
  type Punto,
} from '../src/historial.ts';
import type { Meta } from '../src/meta.ts';
import type { Producto } from '../src/tipos.ts';

const producto = (id: string, precio: number, precioRef = precio * 2): Producto => ({
  tienda: 'mercadona',
  id,
  nombre: `Producto ${id}`,
  formato: { cantidad: 0.5, unidad: 'kg' },
  precio,
  precioRef,
});

/** Anota varios días seguidos, empezando por un historial vacío. */
function dias(...lista: [string, Producto[]][]): Historial {
  let h: Historial = new Map();
  for (const [dia, productos] of lista) h = anotarDia(h, productos, dia);
  return h;
}

describe('historial de precios', () => {
  it('apunta el precio solo los días en que cambia', () => {
    const h = dias(
      ['2026-11-15', [producto('1', 2)]],
      ['2026-11-16', [producto('1', 2)]],
      ['2026-11-17', [producto('1', 1.8)]],
      ['2026-11-18', [producto('1', 1.8)]],
    );
    expect(h.get('1')).toEqual([
      ['2026-11-15', 2, 4],
      ['2026-11-17', 1.8, 3.6],
    ]);
  });

  it('apunta también cuando solo cambia el precioRef (el envase encoge)', () => {
    const h = dias(['2026-11-15', [producto('1', 2, 4)]], ['2026-11-16', [producto('1', 2, 4.4)]]);
    expect(h.get('1')).toEqual([
      ['2026-11-15', 2, 4],
      ['2026-11-16', 2, 4.4],
    ]);
  });

  it('vuelve a empezar si cambia la medida (p. ej. de €/l a €/lavado), no si encoge el envase', () => {
    const h = dias(
      ['2026-11-15', [producto('1', 3.5, 2.33), producto('2', 1.8, 1.2), producto('3', 2, 4)]],
      // Detergente de 1,5 l y 50 lavados: el precio no cambia, el precioRef pasa a €/lavado.
      // Carne en bandeja: otra bandeja, unos gramos más. Envase de 500 g que pasa a 400 g.
      ['2026-11-17', [producto('1', 3.5, 0.07), producto('2', 1.9, 1.2), producto('3', 2, 5)]],
      ['2026-11-18', [producto('1', 3.2, 0.064), producto('2', 1.9, 1.2), producto('3', 2, 5)]],
    );
    expect(h.get('1')).toEqual([
      ['2026-11-17', 3.5, 0.07],
      ['2026-11-18', 3.2, 0.064],
    ]);
    expect(h.get('2')).toEqual([
      ['2026-11-15', 1.8, 1.2],
      ['2026-11-17', 1.9, 1.2],
    ]);
    expect(h.get('3')).toEqual([
      ['2026-11-15', 2, 4],
      ['2026-11-17', 2, 5],
    ]);
  });

  it('si se descarga dos veces el mismo día, vale la última', () => {
    const h = dias(
      ['2026-11-15', [producto('1', 2)]],
      ['2026-11-16', [producto('1', 1.5)]],
      ['2026-11-16', [producto('1', 2)]],
    );
    expect(h.get('1')).toEqual([['2026-11-15', 2, 4]]);
  });

  it('nunca reescribe un día anterior al último apuntado', () => {
    const h = dias(['2026-11-16', [producto('1', 2)]], ['2026-11-15', [producto('1', 3)]]);
    expect(h.get('1')).toEqual([['2026-11-16', 2, 4]]);
  });

  it('apunta una sola vez que un producto ya no está y vuelve a apuntarlo si vuelve', () => {
    const h = dias(
      ['2026-11-15', [producto('1', 2), producto('2', 1)]],
      ['2026-11-16', [producto('2', 1)]],
      ['2026-11-17', [producto('2', 1)]],
      ['2026-11-18', [producto('1', 2.2), producto('2', 1)]],
    );
    expect(h.get('1')).toEqual([
      ['2026-11-15', 2, 4],
      ['2026-11-16', null],
      ['2026-11-18', 2.2, 4.4],
    ]);
    expect(h.get('2')).toEqual([['2026-11-15', 1, 2]]);
  });

  it('guarda unos 400 días: lo anterior queda en el último precio antes del plazo', () => {
    const inicio = '2025-01-01';
    const h = dias(
      [inicio, [producto('1', 1), producto('2', 1)]],
      [sumarDias(inicio, 10), [producto('1', 1.1)]],
      [sumarDias(inicio, 20), [producto('1', 1.2)]],
      [sumarDias(inicio, 500), [producto('1', 1.3)]],
    );
    expect(h.get('1')?.map((p) => p[0])).toEqual([sumarDias(inicio, 20), sumarDias(inicio, 500)]);
    // El producto 2 dejó de estar hace más de 400 días: se olvida.
    expect(h.has('2')).toBe(false);
  });

  it('reparte los productos en 10 trozos por el último carácter del id', () => {
    expect(trozoDe('1393')).toBe(trozoDe('3'));
    expect(
      new Set(['10', '11', '12', '13', '14', '15', '16', '17', '18', '19'].map(trozoDe)).size,
    ).toBe(TROZOS);
    expect(trozoDe('9660.1')).toBe(trozoDe('1'));
  });

  it('escribe y vuelve a leer cada trozo igual, con un producto por línea', () => {
    const h = dias(
      ['2026-11-15', [producto('12', 2), producto('22', 3), producto('13', 1)]],
      ['2026-11-16', [producto('12', 2), producto('13', 1)]],
    );
    const trozos = serializarTrozos('mercadona', h);
    expect(trozos).toHaveLength(TROZOS);
    const leido: Historial = new Map();
    for (const texto of trozos) {
      for (const [id, puntos] of leerTrozo(JSON.parse(texto)) ?? []) leido.set(id, puntos);
    }
    expect(leido).toEqual(h);
    expect(trozos[trozoDe('12')]).toBe(
      '{"tienda":"mercadona","productos":{\n' +
        '"12":[["2026-11-15",2,4]],\n' +
        '"22":[["2026-11-15",3,6],["2026-11-16",null]]\n' +
        '}}\n',
    );
    expect(trozos[trozoDe('0')]).toBe('{"tienda":"mercadona","productos":{}}\n');
  });

  it('no acepta un trozo con otra forma', () => {
    expect(leerTrozo(null)).toBeNull();
    expect(leerTrozo({ productos: { '1': [['15/11/2026', 2, 4]] } })).toBeNull();
    expect(leerTrozo({ productos: { '1': [['2026-11-15', 2]] } })).toBeNull();
  });

  it('usa el día de España: a las 23:30 UTC del 15/11 ya es el 16/11', () => {
    expect(diaEspana('2026-11-15T23:30:00.000Z')).toBe('2026-11-16');
    expect(diaEspana('2026-07-15T21:59:00.000Z')).toBe('2026-07-15');
  });
});

describe('último cambio de precio', () => {
  const puntos: Punto[] = [
    ['2026-11-01', 2, 4],
    ['2026-11-10', 1.8, 3.6],
  ];

  it('da el precio de antes y el día del cambio si es de los últimos 30 días', () => {
    expect(cambioReciente(puntos, '2026-11-18')).toEqual({
      dia: '2026-11-10',
      antes: 2,
      antesRef: 4,
    });
    expect(cambioReciente(puntos, '2026-12-10')).not.toBeNull();
    expect(cambioReciente(puntos, '2026-12-11')).toBeNull();
  });

  it('no cuenta el primer precio, ni dejar de estar ni volver al catálogo', () => {
    expect(cambioReciente([['2026-11-15', 2, 4]], '2026-11-18')).toBeNull();
    expect(cambioReciente([...puntos, ['2026-11-12', null]], '2026-11-18')).toBeNull();
    expect(
      cambioReciente([...puntos, ['2026-11-12', null], ['2026-11-14', 1.5, 3]], '2026-11-18'),
    ).toBeNull();
  });

  it('va en app.json solo en los productos que han cambiado hace poco', () => {
    const meta: Meta = { generado: '2026-11-18T06:00:00.000Z', tiendas: {} };
    const historial = dias(
      ['2026-11-15', [producto('1', 2), producto('2', 3)]],
      ['2026-11-17', [producto('1', 1.8), producto('2', 3)]],
    );
    const datos = construirApp(
      meta,
      { mercadona: [producto('1', 1.8), producto('2', 3)] },
      {},
      { mercadona: historial },
    );
    expect(datos.productos.find((p) => p.id === '1')?.cambio).toEqual({
      dia: '2026-11-17',
      antes: 2,
      antesRef: 4,
    });
    expect(datos.productos.find((p) => p.id === '2')).not.toHaveProperty('cambio');
  });
});
