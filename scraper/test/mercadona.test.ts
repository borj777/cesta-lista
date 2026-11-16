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
  (fixture(`mercadona-categoria-${c}-vlc1.json`) as Categoria).categories.flatMap(
    (s) => s.products,
  ),
);
const normalizados = crudos.map((c) => normalizarMercadona(c));
const productos = normalizados.flatMap((r) => (r.ok ? [r.producto] : []));

function buscar(nombre: string, precio?: number): Producto {
  const p = productos.find(
    (x) => x.nombre === nombre && (precio === undefined || x.precio === precio),
  );
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
    // Detergente "lv": por lavado (50 lavados), aunque la tienda dé el precio por litro.
    [
      'Detergente ropa jabón natural de Marsella Bosque Verde líquido',
      3.5,
      { cantidad: 50, unidad: 'lavado' },
      0.07,
    ],
    // Cápsulas con peso conocido: por kg, aunque la tienda dé el precio por cápsula.
    [
      'Detergente ropa todo en 1 Ariel Pods en cápsulas',
      4.95,
      { cantidad: 0.3477, unidad: 'kg' },
      14.2364,
    ],
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

  it('rellena tienda, url e imagen, sin fecha por producto', () => {
    const p = buscar('Plátano de Canarias IGP');
    expect(p).toMatchObject({ tienda: 'mercadona', id: '3819' });
    expect(p).not.toHaveProperty('actualizado');
    expect(p.url).toMatch(/^https:\/\/tienda\.mercadona\.es\//);
    expect(p.imagen).toMatch(/^https:\/\//);
  });

  it('coincide con el bulk_price de la tienda salvo en unos pocos productos', () => {
    const avisos = normalizados.flatMap((r) => (r.ok && r.aviso ? [r.aviso] : []));
    // Los pañuelos de papel son incoherentes en la propia tienda (0,02 € por pañuelo en un
    // paquete de 1,65 €). El aviso se da en la unidad de la tienda, sin mezclar unidades.
    expect(avisos.length / productos.length).toBeLessThan(0.02);
    expect(avisos).toContainEqual({
      id: '46703',
      nombre: 'Pañuelos de papel Aloe Vera Bosque Verde',
      unidad: 'ud',
      calculado: 0.165,
      tienda: 0.02,
    });
  });

  it('el papel de cocina va por servicio y cuadra con el precio por rollo de la tienda', () => {
    const r = normalizados.find((x) => x.ok && x.producto.id === '49176');
    expect(r).toMatchObject({
      ok: true,
      sinVerificar: true,
      producto: { formato: { cantidad: 375, unidad: 'ud' } },
    });
    expect(r?.ok && r.aviso).toBeFalsy();
  });

  it('descarta un producto sin precio o sin formato', () => {
    expect(normalizarMercadona({ id: 1, display_name: 'Roto' })).toEqual({ ok: false });
    const sinTamano = structuredClone(crudos[0]) as { price_instructions: { unit_size: null } };
    sinTamano.price_instructions.unit_size = null;
    expect(normalizarMercadona(sinTamano).ok).toBe(false);
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

describe('packs de paquetes en Mercadona (datos reales del 15/11/2026)', () => {
  const crudo = (nombre: string, pi: Record<string, unknown>) => ({
    id: '1',
    display_name: nombre,
    price_instructions: { reference_format: 'ud', size_format: 'ud', ...pi },
  });

  it.each([
    // 3 paquetes de 40 pañales: total_units cuenta paquetes y unit_size, pañales.
    ['Pañales bebé talla 3', '18.00', '0.15', 120, 3, 40, 0.15],
    ['Toallitas bebé (pack de 3)', '2.75', '0.01', 240, 3, 80, 0.0115],
  ])('%s: cuenta las piezas, no los paquetes', (nombre, precio, bulk, us, tu, pack, ref) => {
    const r = normalizarMercadona(
      crudo(nombre, {
        unit_price: precio,
        bulk_price: bulk,
        unit_size: us,
        total_units: tu,
        pack_size: pack,
      }),
    );
    expect(r).toMatchObject({ ok: true, producto: { formato: { cantidad: us, unidad: 'ud' } } });
    expect(r.ok && r.producto.precioRef).toBe(ref);
    expect(r.ok && r.aviso).toBeFalsy();
  });
});

describe('descartados recuperados y embutidos (datos reales del 16/11/2026)', () => {
  const NUEVAS = ['pescado-congelado', 'marisco-congelado', 'marisco', 'embutido-curado', 'menaje'];
  const crudosNuevos = NUEVAS.flatMap((c) =>
    (fixture(`mercadona-categoria-${c}-vlc1.json`) as Categoria).categories.flatMap(
      (s) => s.products,
    ),
  );
  const porId = (id: string) => {
    const crudo = crudosNuevos.find((c) => (c as { id: string }).id === id);
    if (!crudo) throw new Error(`No está en las fixtures: ${id}`);
    return normalizarMercadona(crudo);
  };

  it('ya no descarta ningún producto de estas categorías', () => {
    const descartados = crudosNuevos.filter((c) => !normalizarMercadona(c).ok);
    expect(crudosNuevos.length).toBeGreaterThan(150);
    expect(descartados).toHaveLength(0);
  });

  it('congelados: usa el peso neto escurrido cuando falta el peso total', () => {
    // Filetes de merluza: 5,30 € y 0,6 kg escurridos = 8,83 €/kg, como dice la tienda.
    const r = porId('62228');
    expect(r).toMatchObject({
      ok: true,
      producto: { precio: 5.3, formato: { cantidad: 0.6, unidad: 'kg' }, precioRef: 8.8333 },
    });
    expect(r.ok && (r.aviso || r.sinVerificar)).toBeFalsy();
  });

  it('a granel: el precio es el de la tienda por kg, no el unit_price', () => {
    // Gambón: unit_price 1.282,05 € (no es un precio real); bulk_price 12,95 €/kg.
    expect(porId('24147')).toMatchObject({
      ok: true,
      sinVerificar: true,
      producto: { precio: 12.95, formato: { cantidad: 1, unidad: 'kg' }, precioRef: 12.95 },
    });
  });

  it('aluminio y film: por metro', () => {
    const r = porId('49000');
    expect(r).toMatchObject({
      ok: true,
      producto: { precio: 2.25, formato: { cantidad: 30, unidad: 'm' }, precioRef: 0.075 },
    });
    expect(r.ok && (r.aviso || r.sinVerificar)).toBeFalsy();
  });

  it.each([
    // Fuet: 2,50 € la pieza de 0,24 kg → 10,42 €/kg.
    ['55108', 2.5, 0.24, 10.4167],
    ['55125', 2.8, 0.28, 10],
    ['54105', 3.05, 0.35, 8.7143],
  ])(
    'embutido por pieza %s: precioRef por kg, sin aviso por mezclar unidades',
    (id, precio, kg, ref) => {
      const r = porId(id);
      expect(r).toMatchObject({
        ok: true,
        sinVerificar: true,
        producto: { precio, formato: { cantidad: kg, unidad: 'kg' }, precioRef: ref },
      });
      expect(r.ok && r.aviso).toBeFalsy();
    },
  );

  it('todo lo que tiene peso en kg tiene el precioRef en €/kg', () => {
    for (const crudo of crudosNuevos) {
      const pi = (crudo as { price_instructions: { size_format: string; selling_method: number } })
        .price_instructions;
      const r = normalizarMercadona(crudo);
      if (r.ok && pi.size_format === 'kg') expect(r.producto.formato.unidad).toBe('kg');
    }
  });
});
