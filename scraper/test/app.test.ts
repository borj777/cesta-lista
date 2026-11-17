import { describe, expect, it } from 'vitest';
import { normalizarConsum } from '../src/adapters/consum.ts';
import { normalizarMercadona } from '../src/adapters/mercadona.ts';
import {
  CAMPOS_APP,
  construirApp,
  leerSecciones,
  serializarApp,
  serializarImagenes,
  serializarSecciones,
  unirSecciones,
  type Secciones,
} from '../src/app.ts';
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
      seccion: expect.any(String),
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

describe('secciones de las tiendas', () => {
  const nombres: Secciones = {
    mercadona: {
      '72': 'Huevos, leche y mantequilla > Leche y bebidas vegetales > Leche',
      '999': 'Sin productos',
    },
  };
  const conSecciones = construirApp(meta, { mercadona }, nombres);

  it('app.json lleva solo los nombres de las secciones que tienen productos', () => {
    expect(mercadona.every((p) => p.seccion === undefined)).toBe(true);
    const leche = mercadona.map((p) => ({ ...p, seccion: '72' }));
    const datos = construirApp(meta, { mercadona: leche }, nombres);
    expect(datos.secciones).toEqual({
      mercadona: { '72': 'Huevos, leche y mantequilla > Leche y bebidas vegetales > Leche' },
    });
    expect(datos.productos[0]?.seccion).toBe('72');
    expect(JSON.parse(serializarApp(datos))).toEqual(datos);
    expect(conSecciones.secciones).toEqual({});
  });

  it('conserva los nombres de otros días si hoy faltan y los ordena por id', () => {
    const guardadas: Secciones = { mercadona: { '10': 'A', '2': 'B' }, consum: { '5': 'C' } };
    const unidas = unirSecciones(guardadas, 'mercadona', { '10': 'A nueva', '3': 'D' });
    expect(unidas).toEqual({
      mercadona: { '2': 'B', '3': 'D', '10': 'A nueva' },
      consum: { '5': 'C' },
    });
    expect(Object.keys(unidas.mercadona ?? {})).toEqual(['2', '3', '10']);
    expect(unirSecciones(guardadas, 'consum', undefined)).toEqual(guardadas);

    const texto = serializarSecciones(unidas);
    expect(leerSecciones(JSON.parse(texto))).toEqual(unidas);
    expect(texto.split('\n')).toHaveLength(11);
    expect(leerSecciones(null)).toEqual({});
    expect(leerSecciones({ consum: { '1': 2, '3': 'ok' } })).toEqual({ consum: { '3': 'ok' } });
  });
});

describe('archivo de fotos', () => {
  it('tiene una foto por producto, una por línea, y se puede leer', () => {
    const texto = serializarImagenes(AHORA, { consum, mercadona });
    const datos = JSON.parse(texto) as {
      generado: string;
      imagenes: Record<string, Record<string, string>>;
    };
    expect(datos.generado).toBe(AHORA);
    expect(Object.keys(datos.imagenes)).toEqual(['mercadona', 'consum']);
    expect(datos.imagenes.consum?.['4679']).toMatch(/^https:\/\/cdn-consum\./);
    expect(Object.keys(datos.imagenes.mercadona ?? {})).toHaveLength(
      mercadona.filter((p) => p.imagen).length,
    );
    const lineasProducto = texto
      .split('\n')
      .filter((l) => l.startsWith('"') && l.includes('https'));
    expect(lineasProducto).toHaveLength(mercadona.length + consum.length);
  });
});
