import { describe, expect, it } from 'vitest';
import { descargarConsum, normalizarConsum, ofertaVigente } from '../src/adapters/consum.ts';
import { ErrorFormato, ProductoSchema, type Producto } from '../src/tipos.ts';
import { AHORA, fixture, pedirFalso, respuesta } from './ayudas.ts';

type Pagina = { totalCount: number; hasMore: boolean; products: { id: number }[] };
const pagina = fixture('consum-pagina-limit100-offset0.json') as Pagina;
const normalizados = pagina.products.map((c) => normalizarConsum(c, AHORA));
const productos = normalizados.flatMap((r) => (r.ok ? [r.producto] : []));

function buscar(nombre: string): Producto {
  const p = productos.find((x) => x.nombre === nombre);
  if (!p) throw new Error(`No está en las fixtures: ${nombre}`);
  return p;
}

describe('normalizarConsum con respuestas reales', () => {
  it('convierte los 100 productos de la página al esquema común', () => {
    expect(productos).toHaveLength(100);
    for (const p of productos) expect(ProductoSchema.safeParse(p).success).toBe(true);
  });

  it('coincide con el precio por unidad de Consum en todos los que se pueden comprobar', () => {
    expect(normalizados.filter((r) => r.ok && r.aviso)).toHaveLength(0);
  });

  it.each([
    ['Leche Semidesnatada Brik', 1.35, { cantidad: 1, unidad: 'l' }, 1.35],
    ['Rabanito Bolsa', 1.3, { cantidad: 0.25, unidad: 'kg' }, 5.2],
    ['Gaseosa Botella', 0.86, { cantidad: 0.5, unidad: 'l' }, 1.72],
    // Consum da este precio por cada 100 g: se pasa a € por kg.
    ['Laurel en Hojas Caja', 0.99, { cantidad: 0.015, unidad: 'kg' }, 66],
  ] as const)('%s', (nombre, precio, formato, precioRef) => {
    expect(buscar(nombre)).toMatchObject({ precio, formato, precioRef });
  });

  it('lee el euro como euro, no como céntimos', () => {
    // centAmount = 1.35000 significa 1,35 €.
    expect(buscar('Leche Semidesnatada Brik').precio).toBe(1.35);
  });

  it('usa el precio de oferta y guarda el normal como anterior', () => {
    expect(buscar('Lentejas a La Riojana Bote')).toMatchObject({
      precio: 2,
      precioAnterior: 2.35,
      oferta: 'Ahora más barato',
      ofertaHasta: '2026-11-18',
      formato: { cantidad: 0.425, unidad: 'kg' },
      precioRef: 4.7059,
    });
  });

  it('toma el precio por kg de la tienda en la fruta por piezas, sin verificar', () => {
    const ciruela = normalizados.find((r) => r.ok && r.producto.nombre === 'Ciruela Roja');
    expect(ciruela).toMatchObject({ ok: true, sinVerificar: true });
    expect(buscar('Ciruela Roja')).toMatchObject({
      precio: 0.37,
      precioRef: 3.5,
      formato: { unidad: 'kg', cantidad: 0.1057 },
    });
  });

  it('rellena EAN, marca, url e imagen', () => {
    const p = buscar('Leche Semidesnatada Brik');
    expect(p).toMatchObject({ tienda: 'consum', id: '4679', ean: '8410128010119' });
    expect(p.marca).toBeTruthy();
    expect(p.url).toMatch(/^https:\/\/tienda\.consum\.es\//);
  });

  it('descarta un producto sin precio', () => {
    expect(normalizarConsum({ id: 1, productData: { name: 'X' } }, AHORA)).toEqual({ ok: false });
  });
});

const range = (desde: number, hasta: number) =>
  Array.from({ length: hasta - desde + 1 }, (_, i) => desde + i);

describe('descargarConsum', () => {
  /** Simula un catálogo de `total` productos, servido de 100 en 100. */
  function catalogo(total: number) {
    const base = pagina.products[0];
    return pedirFalso((url) => {
      const offset = Number(new URL(url).searchParams.get('offset'));
      const n = Math.max(0, Math.min(100, total - offset));
      const products = Array.from({ length: n }, (_, i) => ({ ...base, id: offset + i + 1 }));
      return respuesta({ totalCount: total, hasMore: offset + n < total, products });
    });
  }

  it('recorre todas las páginas con limit y offset', async () => {
    const { pedir, llamadas } = catalogo(250);
    const r = await descargarConsum(pedir, AHORA);
    expect(llamadas.map((l) => new URL(l.url).search)).toEqual([
      '?limit=100&offset=0',
      '?limit=100&offset=100',
      '?limit=100&offset=200',
    ]);
    expect(r).toMatchObject({ recibidos: 250, esperados: 250, descartados: 0 });
    expect(r.productos).toHaveLength(250);
  });

  it('no repite un producto que aparece en dos páginas', async () => {
    const base = pagina.products[0];
    const { pedir } = pedirFalso((url) => {
      const offset = Number(new URL(url).searchParams.get('offset'));
      // La segunda página empieza repitiendo el último producto de la primera (el 100).
      const ids = offset === 0 ? range(1, 100) : range(100, 150);
      return respuesta({
        totalCount: 150,
        hasMore: offset === 0,
        products: ids.map((id) => ({ ...base, id })),
      });
    });
    const r = await descargarConsum(pedir, AHORA);
    expect(r.productos.map((p) => p.id)).toEqual(range(1, 150).map(String));
    expect(r.recibidos).toBe(150);
  });

  it('detecta un cambio de formato', async () => {
    const { pedir } = pedirFalso(() => respuesta({ items: [] }));
    await expect(descargarConsum(pedir, AHORA)).rejects.toBeInstanceOf(ErrorFormato);
  });
});

describe('ejemplos de descartados', () => {
  it('guarda el id y el nombre de los productos que no se pueden leer', async () => {
    const { pedir } = pedirFalso(() =>
      respuesta({
        totalCount: 1,
        hasMore: false,
        products: [{ id: 7, productData: { name: 'Sin precio', description: 'Sin precio 1 L' } }],
      }),
    );
    const r = await descargarConsum(pedir, AHORA);
    expect(r).toMatchObject({ descartados: 1, ejemplosDescartados: ['7 Sin precio 1 L'] });
  });
});

describe('ofertaVigente', () => {
  const oferta = (from: string, to: string) => [
    { from, to, shortDescription: 'Ahora más barato', longDescription: 'Ahora más barato' },
  ];

  it('separa el texto de la oferta y su último día en hora de España', () => {
    // 22:59 UTC en invierno son las 23:59 del mismo día en España.
    expect(ofertaVigente(oferta('2026-11-09T23:00:00Z', '2026-11-18T22:59:00Z'), AHORA)).toEqual({
      oferta: 'Ahora más barato',
      ofertaHasta: '2026-11-18',
    });
  });

  it('tiene en cuenta el horario de verano', () => {
    // 21:59 UTC en julio son las 23:59 en España; 22:30 UTC ya es el día siguiente.
    const julio = '2027-07-01T10:00:00Z';
    expect(ofertaVigente(oferta(julio, '2027-07-10T21:59:00Z'), julio).ofertaHasta).toBe(
      '2027-07-10',
    );
    expect(ofertaVigente(oferta(julio, '2027-07-10T22:30:00Z'), julio).ofertaHasta).toBe(
      '2027-07-11',
    );
  });

  it('ignora las ofertas caducadas o que aún no han empezado', () => {
    expect(ofertaVigente(oferta('2026-10-01T00:00:00Z', '2026-11-01T00:00:00Z'), AHORA)).toEqual(
      {},
    );
    expect(ofertaVigente(oferta('2026-12-01T00:00:00Z', '2026-12-31T00:00:00Z'), AHORA)).toEqual(
      {},
    );
  });
});

describe('docenas, lavados, metros y dosis (datos reales del 16/11/2026)', () => {
  const BUSQUEDAS = ['detergente', 'huevos', 'aluminio', 'cola-de-caballo'];
  const crudos = BUSQUEDAS.flatMap(
    (b) => (fixture(`consum-busqueda-${b}.json`) as { products: unknown[] }).products,
  );
  const resultados = crudos.map((c) => normalizarConsum(c, AHORA));
  const porId = (id: string) => {
    const r = resultados.find((x) => x.ok && x.producto.id === id);
    if (!r?.ok) throw new Error(`No está en las fixtures: ${id}`);
    return r;
  };

  it('ya no descarta ningún producto de estas búsquedas', () => {
    expect(crudos.length).toBeGreaterThan(200);
    expect(resultados.filter((r) => !r.ok)).toHaveLength(0);
  });

  it('docenas: precio por huevo, que cuadra con el precio por docena de la tienda', () => {
    // Decena de huevos camperos: 2,90 € = 10 huevos; la tienda dice 3,49 €/docena.
    const r = porId('24492');
    expect(r.producto).toMatchObject({ formato: { cantidad: 10, unidad: 'ud' }, precioRef: 0.29 });
    expect(r.aviso).toBeUndefined();
  });

  it('lavados: precio por lavado', () => {
    const r = porId('45813');
    expect(r.producto).toMatchObject({
      formato: { cantidad: 60, unidad: 'lavado' },
      precioRef: 0.0698,
    });
    expect(r.aviso).toBeUndefined();
  });

  it('metros: precio por metro', () => {
    const r = porId('5818');
    expect(r.producto).toMatchObject({ formato: { cantidad: 30, unidad: 'm' }, precioRef: 0.075 });
    expect(r.aviso).toBeUndefined();
  });

  it('dosis: se cuentan como unidades', () => {
    expect(porId('6463').producto).toMatchObject({
      precio: 2.55,
      formato: { cantidad: 20, unidad: 'ud' },
      precioRef: 0.1275,
    });
  });
});
