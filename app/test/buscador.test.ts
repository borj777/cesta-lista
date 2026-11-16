import { describe, expect, it } from 'vitest';
import { buscar, indicePorId, normalizar, palabras } from '../src/buscador.ts';
import type { ProductoApp, Unidad } from '../src/tipos.ts';

let siguiente = 1;
function producto(
  tienda: 'mercadona' | 'consum',
  nombre: string,
  precio: number,
  cantidad: number,
  unidad: Unidad,
  extra: Partial<ProductoApp> = {},
): ProductoApp {
  return {
    tienda,
    id: String(siguiente++),
    nombre,
    formato: { cantidad, unidad },
    precio,
    precioRef: Math.round((precio / cantidad) * 10_000) / 10_000,
    ...extra,
  };
}

const lecheBrik = producto('mercadona', 'Leche semidesnatada Hacendado', 0.83, 1, 'l');
const lechePack = producto('mercadona', 'Leche semidesnatada Hacendado', 4.98, 6, 'l');
const lecheBotella = producto('mercadona', 'Leche semidesnatada Hacendado', 1.45, 1.5, 'l');
const lecheEntera = producto('mercadona', 'Leche entera Hacendado', 0.9, 1, 'l');
const lecheEnPolvo = producto('mercadona', 'Leche semidesnatada en polvo', 3.2, 0.4, 'kg');
const huevos = producto('mercadona', 'Huevos grandes L', 3.05, 12, 'ud');
const limones = producto('mercadona', 'Limón', 2.2, 1, 'kg');
const lecheConsum = producto('consum', 'Leche Semidesnatada Brik', 1.09, 1, 'l', {
  marca: 'ASTURIANA',
  ean: '8410297012150',
});
const lecheConsumMismoEan = producto('mercadona', 'Leche Asturiana semidesnatada', 1.15, 1, 'l', {
  ean: '8410297012150',
});

const productos = [
  lecheBrik,
  lechePack,
  lecheBotella,
  lecheEntera,
  lecheEnPolvo,
  huevos,
  limones,
  lecheConsum,
  lecheConsumMismoEan,
];

describe('palabras', () => {
  it('quita tildes, mayúsculas y palabras vacías', () => {
    expect(normalizar('Plátano de CANARIAS')).toBe('platano de canarias');
    expect(palabras('Pechuga de pollo sin piel')).toEqual(['pechuga', 'pollo', 'piel']);
  });

  it('reduce plurales sencillos', () => {
    expect(palabras('huevos limones')).toEqual(['huevo', 'limon']);
  });
});

describe('buscar', () => {
  const enMercadona = (consulta: string, unidad: Unidad = 'l') =>
    buscar(productos, { consulta, tienda: 'mercadona', unidad });

  it('encuentra los productos que tienen todas las palabras, sin importar mayúsculas', () => {
    const r = enMercadona('LECHE semidesnatada');
    expect(r.comparables).toEqual([lecheBrik, lechePack, lecheBotella, lecheConsumMismoEan]);
    expect(r.comparables).not.toContain(lecheEntera);
  });

  it('ordena por precio por unidad; si empatan, por precio', () => {
    const r = enMercadona('leche semidesnatada');
    // Pack (0,83 €/l, 4,98 €) y brik (0,83 €/l, 0,83 €) empatan en €/l: primero el más barato.
    expect(r.comparables.slice(0, 2)).toEqual([lecheBrik, lechePack]);
  });

  it('separa los productos con otra unidad, que no se pueden comparar', () => {
    const r = enMercadona('leche semidesnatada');
    expect(r.otros).toEqual([lecheEnPolvo]);
  });

  it('encuentra singular y plural y sin tildes', () => {
    expect(enMercadona('huevo', 'ud').comparables).toEqual([huevos]);
    expect(enMercadona('limones', 'kg').comparables).toEqual([limones]);
  });

  it('busca también por la marca', () => {
    const r = buscar(productos, { consulta: 'leche asturiana', tienda: 'consum', unidad: 'l' });
    expect(r.comparables).toEqual([lecheConsum]);
  });

  it('solo busca en la tienda pedida', () => {
    const r = buscar(productos, { consulta: 'leche', tienda: 'consum', unidad: 'l' });
    expect(r.comparables.every((p) => p.tienda === 'consum')).toBe(true);
  });

  it('sugiere primero el producto con el mismo código de barras que en la otra tienda', () => {
    const r = buscar(productos, {
      consulta: 'leche semidesnatada',
      tienda: 'mercadona',
      unidad: 'l',
      eans: new Set(['8410297012150']),
    });
    expect(r.mismoCodigo).toEqual([lecheConsumMismoEan]);
    expect(r.comparables).not.toContain(lecheConsumMismoEan);
  });

  it('no devuelve nada si la búsqueda está vacía o solo tiene palabras vacías', () => {
    expect(enMercadona('').total).toBe(0);
    expect(enMercadona('de la').total).toBe(0);
  });

  it('limita el número de resultados pero cuenta todos', () => {
    const r = buscar(productos, { consulta: 'leche', tienda: 'mercadona', unidad: 'l', limite: 2 });
    expect(r.comparables).toHaveLength(2);
    expect(r.total).toBe(6);
  });

  it('busca un producto por tienda e id', () => {
    const indice = indicePorId(productos);
    expect(indice.get(`consum:${lecheConsum.id}`)).toBe(lecheConsum);
    expect(indice.get(`mercadona:${lecheConsum.id}`)).toBeUndefined();
  });
});
