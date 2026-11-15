import { describe, expect, it } from 'vitest';
import { normalizarConsum } from '../src/adapters/consum.ts';
import { normalizarMercadona } from '../src/adapters/mercadona.ts';
import { CAMPOS_APP, construirApp, serializarApp } from '../src/app.ts';
import type { Meta } from '../src/meta.ts';
import { normalizarTodos } from '../src/normalizar.ts';
import { AHORA, fixture } from './ayudas.ts';

type Categoria = { categories: { products: unknown[] }[] };
const mercadona = normalizarTodos(
  (fixture('mercadona-categoria-leche-vlc1.json') as Categoria).categories.flatMap(
    (s) => s.products,
  ),
  normalizarMercadona,
).productos;
const consum = normalizarTodos(
  (fixture('consum-pagina-limit100-offset0.json') as { products: unknown[] }).products,
  (c) => normalizarConsum(c, AHORA),
).productos;

const estado = (estado: 'ok' | 'fallida', actualizado: string) => ({
  estado,
  actualizado,
  comprobado: AHORA,
  productos: 1,
  duracionSegundos: 1,
  peticiones: 1,
  sinVerificar: 0,
  descartados: 0,
  avisosPrecioRef: 0,
  ejemplosAvisos: [],
});

const meta: Meta = {
  generado: AHORA,
  tiendas: {
    consum: estado('fallida', '2026-11-14T06:00:00.000Z'),
    mercadona: estado('ok', AHORA),
  },
};

describe('archivo ligero para la app', () => {
  const datos = construirApp(meta, { consum, mercadona });

  it('incluye solo los campos necesarios, sin url, imagen ni fechas por producto', () => {
    for (const p of datos.productos) {
      for (const campo of Object.keys(p)) expect(CAMPOS_APP).toContain(campo);
      expect(p).not.toHaveProperty('url');
      expect(p).not.toHaveProperty('imagen');
    }
    const leche = datos.productos.find((p) => p.tienda === 'consum' && p.id === '4679');
    expect(leche).toEqual({
      tienda: 'consum',
      id: '4679',
      ean: '8410128010119',
      nombre: 'Leche Semidesnatada Brik',
      marca: expect.any(String),
      formato: { cantidad: 1, unidad: 'l' },
      precio: 1.35,
      precioRef: 1.35,
    });
  });

  it('lleva el estado y la fecha de cada tienda para avisar de precios antiguos', () => {
    expect(datos.tiendas).toEqual({
      mercadona: { estado: 'ok', actualizado: AHORA },
      consum: { estado: 'fallida', actualizado: '2026-11-14T06:00:00.000Z' },
    });
  });

  it('ordena por tienda y por id, un producto por línea', () => {
    const tiendas = datos.productos.map((p) => p.tienda);
    expect(tiendas.indexOf('consum')).toBe(tiendas.lastIndexOf('mercadona') + 1);
    const idsConsum = datos.productos.filter((p) => p.tienda === 'consum').map((p) => Number(p.id));
    expect(idsConsum).toEqual([...idsConsum].sort((a, b) => a - b));

    const texto = serializarApp(datos);
    expect(texto.split('\n')).toHaveLength(datos.productos.length + 3);
    expect(JSON.parse(texto)).toEqual(datos);
  });

  it('pesa bastante menos que los archivos completos', () => {
    const completo = JSON.stringify([...mercadona, ...consum]).length;
    expect(serializarApp(datos).length).toBeLessThan(completo * 0.75);
  });
});
