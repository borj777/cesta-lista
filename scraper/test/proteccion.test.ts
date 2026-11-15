import { describe, expect, it } from 'vitest';
import { normalizarConsum } from '../src/adapters/consum.ts';
import { normalizarTodos } from '../src/normalizar.ts';
import { conservarFechas, evaluar } from '../src/proteccion.ts';
import type { Producto, ResultadoAdaptador } from '../src/tipos.ts';
import { AHORA, fixture } from './ayudas.ts';

const AYER = '2026-11-14T06:00:00.000Z';

function producto(id: number, precio: number, actualizado = AYER): Producto {
  return {
    tienda: 'consum',
    id: String(id),
    nombre: `Producto ${id}`,
    formato: { cantidad: 1, unidad: 'kg' },
    precio,
    precioRef: precio,
    actualizado,
  };
}

/** n productos con precio 1 €. */
const catalogo = (n: number) => Array.from({ length: n }, (_, i) => producto(i + 1, 1));

function resultado(
  productos: Producto[],
  extra: Partial<ResultadoAdaptador> = {},
): ResultadoAdaptador {
  return {
    productos,
    avisos: [],
    sinVerificar: 0,
    descartados: 0,
    recibidos: productos.length,
    ...extra,
  };
}

/** Catálogo de 100 productos donde los `n` primeros han duplicado su precio (+100 %). */
const conSubidas = (n: number) => catalogo(100).map((p, i) => (i < n ? { ...p, precio: 2 } : p));

describe('evaluar: protección contra datos malos', () => {
  it('acepta la primera descarga, sin datos anteriores', () => {
    expect(evaluar(resultado(catalogo(100)), null)).toEqual({ valido: true });
  });

  it('rechaza una tienda que devuelve 0 productos', () => {
    expect(evaluar(resultado([]), catalogo(100))).toMatchObject({
      valido: false,
      motivo: 'La tienda ha devuelto 0 productos',
    });
  });

  it('acepta que el 20 % de los precios varíe más de un 50 %', () => {
    expect(evaluar(resultado(conSubidas(20)), catalogo(100))).toEqual({ valido: true });
  });

  it('rechaza que más del 20 % de los precios varíe más de un 50 %', () => {
    const v = evaluar(resultado(conSubidas(21)), catalogo(100));
    expect(v).toMatchObject({ valido: false });
    expect(!v.valido && v.motivo).toContain('21 de 100');
  });

  it('no cuenta como variación grande un cambio de exactamente el 50 %', () => {
    const mitad = catalogo(100).map((p) => ({ ...p, precio: 1.5 }));
    expect(evaluar(resultado(mitad), catalogo(100))).toEqual({ valido: true });
  });

  it('rechaza un cambio de formato: muchos productos ilegibles', () => {
    const r = resultado(catalogo(94), { recibidos: 100, descartados: 6 });
    expect(evaluar(r, null)).toMatchObject({ valido: false });
    const bien = resultado(catalogo(96), { recibidos: 100, descartados: 4 });
    expect(evaluar(bien, null)).toEqual({ valido: true });
  });

  it('rechaza un cambio de formato: los identificadores ya no coinciden', () => {
    const nuevos = catalogo(100).map((p) => ({ ...p, id: `nuevo-${p.id}` }));
    expect(evaluar(resultado(nuevos), catalogo(100))).toMatchObject({ valido: false });
  });

  it('rechaza una descarga a medias: un 30 % menos de productos que el último día bueno', () => {
    expect(evaluar(resultado(catalogo(69)), catalogo(100))).toMatchObject({ valido: false });
    expect(evaluar(resultado(catalogo(71)), catalogo(100))).toEqual({ valido: true });
  });

  it('rechaza una descarga incompleta según el total que indica la tienda', () => {
    // 8.800 de 9.378 es el 94 %: incompleta. 9.000 es el 96 %: aceptable.
    const incompleta = resultado(catalogo(8800), { esperados: 9378 });
    expect(evaluar(incompleta, null)).toMatchObject({ valido: false });
    const casiEntera = resultado(catalogo(9000), { esperados: 9378 });
    expect(evaluar(casiEntera, null)).toEqual({ valido: true });
  });

  it('con datos reales: rechaza que Consum pase a dar los precios en céntimos', () => {
    type Pagina = { products: { priceData: { prices: { value: { centAmount: number } }[] } }[] };
    const pagina = fixture('consum-pagina-limit100-offset0.json') as Pagina;
    const buenos = normalizarTodos(pagina.products, (c) => normalizarConsum(c, AYER));

    const enCentimos = structuredClone(pagina);
    for (const p of enCentimos.products) {
      for (const precio of p.priceData.prices) precio.value.centAmount *= 100;
    }
    const malos = normalizarTodos(enCentimos.products, (c) => normalizarConsum(c, AHORA));

    expect(malos.productos).toHaveLength(100);
    expect(evaluar(malos, buenos.productos)).toMatchObject({ valido: false });
    expect(evaluar(buenos, buenos.productos)).toEqual({ valido: true });
  });
});

describe('conservarFechas', () => {
  it('mantiene la fecha de los productos cuyo precio no ha cambiado', () => {
    const anteriores = [producto(1, 1), producto(2, 1)];
    const nuevos = [producto(1, 1, AHORA), producto(2, 1.2, AHORA), producto(3, 5, AHORA)];
    expect(conservarFechas(nuevos, anteriores).map((p) => p.actualizado)).toEqual([
      AYER,
      AHORA,
      AHORA,
    ]);
  });

  it('marca como actualizado un producto que entra o sale de oferta', () => {
    const anteriores = [producto(1, 1)];
    const nuevos = [{ ...producto(1, 1, AHORA), oferta: 'Ahora más barato hasta el 18/11' }];
    expect(conservarFechas(nuevos, anteriores)[0]?.actualizado).toBe(AHORA);
  });
});
