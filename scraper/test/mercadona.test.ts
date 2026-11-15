import { describe, expect, it } from 'vitest';
import {
  ALMACEN,
  descargarMercadona,
  ErrorZona,
  normalizarMercadona,
} from '../src/adapters/mercadona.ts';
import { ErrorFormato, ProductoSchema, type Producto } from '../src/tipos.ts';
import { AHORA, fixture, pedirFalso, respuesta } from './ayudas.ts';

type Categoria = { categories: { products: unknown[] }[] };

const CATEGORIAS = ['fruta', 'leche', 'huevos', 'detergente', 'papel', 'pollo'];
const crudos = CATEGORIAS.flatMap((c) =>
  (fixture(`mercadona-categoria-${c}-vlc1.json`) as Categoria).categories.flatMap((s) => s.products),
);
const normalizados = crudos.map((c) => normalizarMercadona(c, AHORA));
const productos = normalizados.flatMap((r) => (r.ok ? [r.producto] : []));

function buscar(nombre: string, precio?: number): Producto {
  const p = productos.find((x) => x.nombre === nombre && (precio === undefined || x.precio === precio));
  if (!p) throw new Error(`No está en las fixtures: ${nombre}`);
  return p;
}

describe('normalizarMercadona con respuestas reales', () => {
  it('convierte todos los productos al esquema común', () => {
    expect(crudos.length).toBeGreaterThan(250);
    expect(productos).toHaveLength(crudos.length);
    for (const p of productos) expect(ProductoSchema.safeParse(p).success).toBe(true);
  });

  it.each([
    ['Plátano de Canarias IGP', 0.48, { cantidad: 0.15, unidad: 'kg' }, 3.2],
    ['Leche semidesnatada Hacendado', 4.98, { cantidad: 6, unidad: 'l' }, 0.83],
    ['Huevos grandes L', 3.05, { cantidad: 12, unidad: 'ud' }, 0.2542],
    [
      'Detergente ropa jabón natural de Marsella Bosque Verde líquido',
      3.5,
      { cantidad: 3, unidad: 'l' },
      1.1667,
    ],
    ['Detergente ropa todo en 1 Ariel Pods en cápsulas', 4.95, { cantidad: 19, unidad: 'ud' }, 0.2605],
    ['Pastillas antical para lavadora Bosque Verde', 3.25, { cantidad: 40, unidad: 'ud' }, 0.0813],
    ['Papel higiénico Doble Rollo Bosque Verde', 4.6, { cantidad: 12, unidad: 'ud' }, 0.3833],
  ] as const)('%s', (nombre, precio, formato, precioRef) => {
    const p = buscar(nombre, precio);
    expect(p.formato).toEqual(formato);
    expect(p.precioRef).toBe(precioRef);
  });

  it('guarda el precio anterior cuando ha bajado', () => {
    expect(buscar('Limones')).toMatchObject({ precio: 2.2, precioAnterior: 2.3 });
  });

  it('rellena tienda, url, imagen y fecha', () => {
    const p = buscar('Plátano de Canarias IGP');
    expect(p).toMatchObject({ tienda: 'mercadona', id: '3819', actualizado: AHORA });
    expect(p.url).toMatch(/^https:\/\/tienda\.mercadona\.es\//);
    expect(p.imagen).toMatch(/^https:\/\//);
  });

  it('coincide con el bulk_price de la tienda salvo en unos pocos productos', () => {
    const avisos = normalizados.flatMap((r) => (r.ok && r.aviso ? [r.aviso] : []));
    // Mercadona no es coherente en algunos productos de papel y detergente en cápsulas.
    expect(avisos.length / productos.length).toBeLessThan(0.05);
    expect(avisos.map((a) => a.nombre)).toContain('Papel cocina Gigante Absorbente Bosque Verde');
  });

  it('descarta un producto sin precio o sin formato', () => {
    expect(normalizarMercadona({ id: 1, display_name: 'Roto' }, AHORA)).toEqual({ ok: false });
    const sinTamano = structuredClone(crudos[0]) as { price_instructions: { unit_size: null } };
    sinTamano.price_instructions.unit_size = null;
    expect(normalizarMercadona(sinTamano, AHORA).ok).toBe(false);
  });
});

describe('descargarMercadona', () => {
  const arbol = fixture('mercadona-categorias.json');
  const fruta = fixture('mercadona-categoria-fruta-vlc1.json');

  function tienda(almacen = ALMACEN, categoria: unknown = fruta) {
    return pedirFalso((url) => {
      if (url.includes('postal-codes')) return respuesta({}, { 'x-customer-wh': almacen });
      if (url.includes('/categories/?')) return respuesta(arbol);
      return respuesta(categoria);
    });
  }

  it('fija Valencia, recorre todas las categorías y no repite productos', async () => {
    const { pedir, llamadas } = tienda();
    const r = await descargarMercadona(pedir, AHORA);

    expect(llamadas[0]?.opciones).toEqual({ metodo: 'PUT', cuerpo: { new_postal_code: '46001' } });
    const categorias = llamadas.filter((l) => /\/categories\/\d+\//.test(l.url));
    expect(categorias.length).toBeGreaterThan(100);
    for (const l of llamadas.slice(1)) expect(l.url).toContain('wh=vlc1');

    // Todas las categorías devuelven la misma fruta: cada producto debe salir una sola vez.
    const ids = r.productos.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(r.productos.length).toBe(45);
    expect(r.descartados).toBe(0);
  });

  it('se detiene si el código postal deja de ser del almacén de Valencia', async () => {
    const { pedir, llamadas } = tienda('mad1');
    await expect(descargarMercadona(pedir, AHORA)).rejects.toBeInstanceOf(ErrorZona);
    expect(llamadas).toHaveLength(1);
  });

  it('detecta un cambio de formato en las categorías', async () => {
    const { pedir } = tienda(ALMACEN, { productos: [] });
    await expect(descargarMercadona(pedir, AHORA)).rejects.toBeInstanceOf(ErrorFormato);
  });

  it('cuenta los productos que no se pueden leer', async () => {
    const rota = { id: 1, categories: [{ products: [{ id: 'x', display_name: 'Sin precio' }] }] };
    const { pedir } = tienda(ALMACEN, rota);
    const r = await descargarMercadona(pedir, AHORA);
    expect(r).toMatchObject({ recibidos: 1, descartados: 1, productos: [] });
  });
});
