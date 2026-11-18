import { describe, expect, it } from 'vitest';
import {
  decodificarEntidades,
  descargarLidl,
  extraerOfertas,
  formatoLidl,
  interesa,
  LIDL_OFERTAS,
  nombreYMarca,
  normalizarLidl,
} from '../src/adapters/lidl.ts';
import { ErrorFormato, ProductoSchema, type Producto } from '../src/tipos.ts';
import { fixtureTexto, pedirFalso, respuesta } from './ayudas.ts';

/** Miércoles 18/11/2026: las ofertas de la página van del 16 al 22/11. */
const AHORA = '2026-11-18T10:00:00.000Z';
const html = fixtureTexto('lidl-ofertas.html');
const crudos = extraerOfertas(html);
const delSuper = crudos.filter(interesa);
const productos = delSuper.flatMap((c) => {
  const r = normalizarLidl(c, AHORA);
  return r.ok ? [r.producto] : [];
});

function buscar(nombre: string): Producto {
  const p = productos.find((x) => x.nombre === nombre);
  if (!p) throw new Error(`No está en las fixtures: ${nombre}`);
  return p;
}

describe('extraerOfertas', () => {
  it('lee las tarjetas de la página real, sin repetir las variantes del mismo producto', () => {
    // 20 tarjetas: las 3 de suavizante son el mismo producto.
    expect(crudos).toHaveLength(18);
  });

  it('si la página no tiene ofertas, es un cambio de formato', () => {
    expect(() => extraerOfertas('<html><body>Mantenimiento</body></html>')).toThrow(ErrorFormato);
  });

  it('deshace las entidades HTML', () => {
    expect(decodificarEntidades('&quot;Caf&#233;&quot; &amp; t&#xE9; &#39;ok&#39;')).toBe(
      `"Café" & té 'ok'`,
    );
  });
});

describe('normalizarLidl con la página real', () => {
  it('descarta el bricolaje y las ofertas por cantidad («Llévate 2 por...»)', () => {
    const nombres = crudos.map((c) => (c as { fullTitle: string }).fullTitle);
    const fuera = nombres.filter((_, i) => !interesa(crudos[i]));
    expect(fuera).toHaveLength(3);
    expect(fuera).toEqual(
      expect.arrayContaining(['Napolitana de york y queso', 'Mini croissant de chocolate relleno']),
    );
  });

  it('convierte todas las ofertas del súper al esquema común', () => {
    expect(productos).toHaveLength(delSuper.length);
    for (const p of productos) expect(ProductoSchema.safeParse(p).success).toBe(true);
  });

  it('rebaja normal: precio de oferta, tachado y porcentaje', () => {
    expect(buscar('Mantequilla light')).toMatchObject({
      tienda: 'lidl',
      id: '11150545',
      marca: 'Milbona',
      formato: { cantidad: 0.25, unidad: 'kg' },
      precio: 1.65,
      precioAnterior: 2.05,
      oferta: '-19 %',
      precioRef: 6.6,
      ofertaHasta: '2026-11-22',
      seccion: '173913',
    });
  });

  it('rebaja solo con Lidl Plus: el precio normal es el tachado', () => {
    const naranja = buscar('Naranja 2 kg malla');
    expect(naranja).toMatchObject({
      precio: 1.49,
      precioLidlPlus: 0.95,
      formato: { cantidad: 2, unidad: 'kg' },
      precioRef: 0.745,
    });
    expect(naranja.precioAnterior).toBeUndefined();
    expect(naranja.oferta).toBeUndefined();
  });

  it('rebaja normal y además con Lidl Plus', () => {
    expect(buscar('Café natural molido')).toMatchObject({
      precio: 2.39,
      precioAnterior: 2.45,
      precioLidlPlus: 1.89,
    });
  });

  it('precio destacado sin rebaja: sin tachado ni texto de oferta', () => {
    const pechuga = buscar('Filete de pechuga');
    expect(pechuga).toMatchObject({
      marca: 'Realvalle',
      precio: 3.99,
      formato: { cantidad: 0.5, unidad: 'kg' },
      precioRef: 7.98,
      seccion: '173810',
    });
    expect(pechuga.oferta).toBeUndefined();
  });

  it('packs y medidas: «4x150 g», «12x33 cl», «Paquete»', () => {
    expect(buscar('Yogur bífidus (Natural)').formato).toEqual({ cantidad: 0.6, unidad: 'kg' });
    expect(buscar('Cerveza Pils').formato).toEqual({ cantidad: 3.96, unidad: 'l' });
    expect(buscar('Papel de cocina compacto').formato).toEqual({ cantidad: 1, unidad: 'ud' });
  });

  it('a granel: por kilo, salvo lo que se vende por piezas', () => {
    expect(buscar('Calabaza')).toMatchObject({ formato: { cantidad: 1, unidad: 'kg' } });
    expect(buscar('Pepino Almería unidad').formato.unidad).toBe('ud');
    expect(buscar('Iceberg').formato.unidad).toBe('ud');
  });

  it('las ofertas sin marca («-») no la llevan ni empiezan por «- »', () => {
    const langostino = buscar('Langostino cocido');
    expect(langostino.marca).toBeUndefined();
  });

  it('guarda la dirección de la oferta y su foto', () => {
    expect(buscar('Mantequilla light').url).toBe(
      'https://www.lidl.es/p/milbona-mantequilla-light/p11150545',
    );
    expect(buscar('Mantequilla light').imagen).toMatch(/^https:\/\//);
  });

  it('ofertaDesde solo si la oferta aún no ha empezado', () => {
    const antes = normalizarLidl(
      crudos.find((c) => (c as { fullTitle: string }).fullTitle === 'MILBONA Mantequilla light'),
      '2026-11-14T10:00:00.000Z',
    );
    expect(antes.ok && antes.producto.ofertaDesde).toBe('2026-11-16');
    expect(buscar('Mantequilla light').ofertaDesde).toBeUndefined();
  });
});

describe('formatoLidl y nombreYMarca', () => {
  it.each([
    ['250 g', { cantidad: 0.25, unidad: 'kg' }],
    ['Aprox.500 g', { cantidad: 0.5, unidad: 'kg' }],
    ['8x35g', { cantidad: 0.28, unidad: 'kg' }],
    ['2,5kg', { cantidad: 2.5, unidad: 'kg' }],
    ['75 cl', { cantidad: 0.75, unidad: 'l' }],
    ['1,6 l', { cantidad: 1.6, unidad: 'l' }],
  ] as const)('%s', (envase, formato) => {
    expect(formatoLidl(envase, 'Algo')).toEqual({ formato, sinVerificar: false });
  });

  it('un envase que no se entiende no tiene formato', () => {
    expect(formatoLidl('Surtido', 'Algo')).toBeNull();
  });

  it('marcas en mayúsculas pasan a nombre propio; las de números se dejan', () => {
    expect(nombreYMarca('FIN CARRÉ Chocolate', 'Chocolate', 'FIN CARRÉ')).toEqual({
      nombre: 'Chocolate',
      marca: 'Fin Carré',
    });
    expect(nombreYMarca('W5 Lavavajillas', 'Lavavajillas', 'W5').marca).toBe('W5');
    expect(nombreYMarca('- Dorada limpia', undefined, '-')).toEqual({ nombre: 'Dorada limpia' });
  });
});

describe('descargarLidl', () => {
  it('hace una sola petición, de texto, y devuelve las ofertas con sus secciones', async () => {
    const { pedir, llamadas } = pedirFalso(() => respuesta(html));
    const r = await descargarLidl(pedir, AHORA);
    expect(llamadas).toEqual([{ url: LIDL_OFERTAS, opciones: { como: 'texto' } }]);
    expect(r.productos).toHaveLength(delSuper.length);
    expect(r.descartados).toBe(0);
    expect(r.secciones?.['173810']).toBe('Carne y aves > Aves de corral');
    expect(r.secciones?.['171010']).toBe('Frutas y hortalizas > Fruta');
    expect(r.productos.map((p) => p.id)).toEqual(
      [...r.productos.map((p) => p.id)].sort((a, b) => a.localeCompare(b, 'es', { numeric: true })),
    );
  });

  it('si Lidl cambia la página y ya no hay ofertas, falla con ErrorFormato', async () => {
    const { pedir } = pedirFalso(() => respuesta('<html></html>'));
    await expect(descargarLidl(pedir, AHORA)).rejects.toBeInstanceOf(ErrorFormato);
  });
});
