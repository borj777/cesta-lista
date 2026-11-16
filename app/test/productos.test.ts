import { describe, expect, it } from 'vitest';
import { buscar } from '../src/buscador.ts';
import {
  aFormato,
  aProductoApp,
  confirmarPrecio,
  crearProducto,
  deFormato,
  diasDesde,
  editarProducto,
  leerPrecio,
  notaPrecio,
  precioAntiguo,
  problemaProducto,
  textoAntiguedad,
  validarBorradorProducto,
} from '../src/tiendas/productos.ts';

const AHORA = '2026-11-16T10:00:00.000Z';
const LUEGO = '2026-11-20T10:00:00.000Z';

const leche = crearProducto(
  'lidl',
  { nombre: ' Leche semidesnatada ', marca: 'Milbona', cantidad: 6, unidad: 'l', precio: 4.74 },
  AHORA,
  'leche',
);

describe('leerPrecio', () => {
  it.each([
    ['1,29', 1.29],
    ['1.29', 1.29],
    ['1,29 €', 1.29],
    ['2', 2],
    [',99', 0.99],
  ])('«%s» → %s', (texto, valor) => {
    expect(leerPrecio(texto)).toBe(valor);
  });

  it.each(['', '0', '-1', 'abc', '1,299', '1,2,3', '1000'])('rechaza «%s»', (texto) => {
    expect(leerPrecio(texto)).toBeNull();
  });
});

describe('formato del envase', () => {
  it('pasa los gramos y mililitros a kg y litros', () => {
    expect(aFormato(500, 'g')).toEqual({ cantidad: 0.5, unidad: 'kg' });
    expect(aFormato(330, 'ml')).toEqual({ cantidad: 0.33, unidad: 'l' });
    expect(aFormato(12, 'ud')).toEqual({ cantidad: 12, unidad: 'ud' });
  });

  it('y al editar los vuelve a enseñar en gramos o mililitros', () => {
    expect(deFormato({ cantidad: 0.5, unidad: 'kg' })).toEqual({ cantidad: 500, unidad: 'g' });
    expect(deFormato({ cantidad: 0.33, unidad: 'l' })).toEqual({ cantidad: 330, unidad: 'ml' });
    expect(deFormato({ cantidad: 1.5, unidad: 'kg' })).toEqual({ cantidad: 1.5, unidad: 'kg' });
  });
});

describe('crear y editar', () => {
  it('limpia espacios y guarda la fecha del precio', () => {
    expect(leche).toEqual({
      id: 'leche',
      tienda: 'lidl',
      nombre: 'Leche semidesnatada',
      marca: 'Milbona',
      formato: { cantidad: 6, unidad: 'l' },
      precio: 4.74,
      actualizado: AHORA,
      creado: AHORA,
    });
  });

  it('pide nombre, cantidad y precio', () => {
    expect(validarBorradorProducto({ nombre: '', cantidad: null, precio: null })).toEqual({
      nombre: 'Escribe el nombre del producto.',
      cantidad: 'Escribe cuánto trae el envase, por ejemplo 500 (g) o 1 (litro).',
      precio: 'Escribe el precio del envase con 2 decimales como mucho, por ejemplo 1,29.',
    });
  });

  it('cambiar el precio actualiza la fecha', () => {
    const p = editarProducto(
      leche,
      { nombre: 'Leche semidesnatada', marca: 'Milbona', cantidad: 6, unidad: 'l', precio: 4.98 },
      LUEGO,
    );
    expect(p).toMatchObject({ precio: 4.98, actualizado: LUEGO, creado: AHORA });
  });

  it('corregir solo el nombre no hace que un precio antiguo parezca nuevo', () => {
    const p = editarProducto(
      leche,
      { nombre: 'Leche semi', marca: '', cantidad: 6, unidad: 'l', precio: 4.74 },
      LUEGO,
    );
    expect(p.actualizado).toBe(AHORA);
    expect(p.nombre).toBe('Leche semi');
    expect(p).not.toHaveProperty('marca');
  });

  it('«sigue al mismo precio» actualiza solo la fecha', () => {
    expect(confirmarPrecio(leche, LUEGO)).toEqual({ ...leche, actualizado: LUEGO });
  });
});

describe('antigüedad del precio', () => {
  it('cuenta los días por fechas de España', () => {
    // El 16/11 a las 23:30 UTC ya es día 17 en España (00:30).
    expect(diasDesde('2026-11-16T23:30:00Z', new Date('2026-11-17T08:00:00Z'))).toBe(0);
    expect(diasDesde('2026-11-16T10:00:00Z', new Date('2026-11-17T08:00:00Z'))).toBe(1);
    expect(textoAntiguedad(AHORA, new Date(AHORA))).toBe('hoy');
    expect(textoAntiguedad(AHORA, new Date('2026-11-17T10:00:00Z'))).toBe('ayer');
    expect(textoAntiguedad(AHORA, new Date(LUEGO))).toBe('hace 4 días');
  });

  it('avisa cuando el precio tiene más de 30 días', () => {
    expect(precioAntiguo(leche, new Date('2026-12-16T10:00:00Z'))).toBe(false); // 30 días
    expect(precioAntiguo(leche, new Date('2026-12-17T10:00:00Z'))).toBe(true); // 31 días
    expect(notaPrecio(leche, new Date('2026-12-17T10:00:00Z'))).toEqual({
      texto: 'Precio comprobado hace 31 días: compruébalo',
      atencion: true,
    });
  });

  it('los productos de otras tiendas propias funcionan igual', () => {
    const fruteria = crearProducto(
      'fruteria',
      { nombre: 'Naranjas', cantidad: 2, unidad: 'kg', precio: 2.5 },
      AHORA,
      'naranjas',
    );
    expect(aProductoApp(fruteria)).toMatchObject({ tienda: 'fruteria', precioRef: 1.25 });
  });
});

describe('comparar con las otras tiendas', () => {
  it('calcula el precio por unidad como los de Mercadona y Consum', () => {
    expect(aProductoApp(leche)).toEqual({
      tienda: 'lidl',
      id: 'leche',
      nombre: 'Leche semidesnatada',
      marca: 'Milbona',
      formato: { cantidad: 6, unidad: 'l' },
      precio: 4.74,
      precioRef: 0.79,
    });
  });

  it('se puede buscar entre los productos de Lidl, y sin búsqueda salen todos', () => {
    const huevos = aProductoApp(
      crearProducto(
        'lidl',
        { nombre: 'Huevos camperos', cantidad: 12, unidad: 'ud', precio: 3.19 },
        AHORA,
        'h',
      ),
    );
    const productos = [aProductoApp(leche), huevos];
    expect(
      buscar(productos, { consulta: 'leche', tienda: 'lidl', unidad: 'l' }).comparables,
    ).toHaveLength(1);
    const todos = buscar(productos, {
      consulta: '',
      tienda: 'lidl',
      unidad: 'l',
      todosSiVacia: true,
    });
    expect(todos.comparables.map((p) => p.id)).toEqual(['leche']);
    expect(todos.otros.map((p) => p.id)).toEqual(['h']);
    expect(buscar(productos, { consulta: '', tienda: 'lidl', unidad: 'l' }).total).toBe(0);
  });
});

describe('problemaProducto (copias de seguridad)', () => {
  it('acepta un producto creado por la app', () => {
    expect(problemaProducto(leche)).toBeNull();
  });

  it.each([
    ['sin nombre', { ...leche, nombre: '' }, 'le falta el nombre'],
    ['sin tienda', { ...leche, tienda: undefined }, 'le falta la tienda'],
    ['sin formato', { ...leche, formato: null }, 'el formato no es válido'],
    [
      'con cantidad cero',
      { ...leche, formato: { cantidad: 0, unidad: 'l' } },
      'el formato no es válido',
    ],
    ['en gramos', { ...leche, formato: { cantidad: 500, unidad: 'g' } }, 'la unidad no es válida'],
    ['con precio en texto', { ...leche, precio: '4,74' }, 'el precio no es válido'],
    ['sin fecha', { ...leche, actualizado: 'ayer' }, 'las fechas no son válidas'],
  ])('rechaza un producto %s', (_caso, malo, motivo) => {
    expect(problemaProducto(malo as Record<string, unknown>)).toBe(motivo);
  });
});
