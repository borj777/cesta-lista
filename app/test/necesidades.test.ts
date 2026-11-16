import { describe, expect, it } from 'vitest';
import {
  agruparPorCategoria,
  crearNecesidad,
  editarNecesidad,
  elegirProducto,
  estadoEquivalencia,
  noComprarEn,
  quitarEquivalencia,
  escribirCantidad,
  leerCantidad,
  textoNecesidad,
  validarBorrador,
  type Necesidad,
} from '../src/necesidades/modelo.ts';

const AHORA = '2026-11-16T10:00:00.000Z';
const LUEGO = '2026-11-17T10:00:00.000Z';

const necesidad = (nombre: string, categoria: Necesidad['categoria']): Necesidad =>
  crearNecesidad(
    { nombre, categoria, cantidad: 1, unidad: 'ud', frecuencia: 'semana' },
    AHORA,
    nombre,
  );

describe('leerCantidad', () => {
  it.each([
    ['1,5', 1.5],
    ['1.5', 1.5],
    [' 2 ', 2],
    ['0,25', 0.25],
    [',5', 0.5],
    ['1 000', 1000],
  ])('«%s» → %s', (texto, valor) => {
    expect(leerCantidad(texto)).toBe(valor);
  });

  it.each(['', '0', '-1', 'abc', '1,5 kg', '1,2,3'])('rechaza «%s»', (texto) => {
    expect(leerCantidad(texto)).toBeNull();
  });
});

describe('textos', () => {
  it('escribe las cantidades a la española', () => {
    expect(escribirCantidad(1.5)).toBe('1,5');
    expect(escribirCantidad(1000)).toBe('1000');
  });

  it.each([
    [{ cantidad: 1.5, unidad: 'kg', frecuencia: 'semana' }, '1,5 kg a la semana'],
    [{ cantidad: 1, unidad: 'ud', frecuencia: 'mes' }, '1 unidad al mes'],
    [{ cantidad: 2, unidad: 'ud', frecuencia: 'quincena' }, '2 unidades cada dos semanas'],
    [{ cantidad: 50, unidad: 'lavado', frecuencia: 'mes' }, '50 lavados al mes'],
    [{ cantidad: 6, unidad: 'l', frecuencia: 'semana' }, '6 litros a la semana'],
  ] as const)('%o → «%s»', (n, texto) => {
    expect(textoNecesidad(n)).toBe(texto);
  });
});

describe('validarBorrador', () => {
  it('pide nombre y una cantidad válida', () => {
    expect(validarBorrador({ nombre: '  ', cantidad: null })).toEqual({
      nombre: 'Escribe qué necesitas comprar.',
      cantidad: 'Escribe una cantidad mayor que cero, por ejemplo 1,5.',
    });
    expect(validarBorrador({ nombre: 'Leche', cantidad: 6 })).toEqual({});
  });
});

describe('crear y editar', () => {
  it('limpia espacios y quita las notas vacías', () => {
    const n = crearNecesidad(
      {
        nombre: '  Pechuga de pollo ',
        categoria: 'alimentacion',
        cantidad: 1.5,
        unidad: 'kg',
        frecuencia: 'semana',
        notas: '   ',
      },
      AHORA,
      'id-1',
    );
    expect(n).toEqual({
      id: 'id-1',
      nombre: 'Pechuga de pollo',
      categoria: 'alimentacion',
      cantidad: 1.5,
      unidad: 'kg',
      frecuencia: 'semana',
      creada: AHORA,
      actualizada: AHORA,
    });
  });

  it('al editar conserva el id y la fecha de creación', () => {
    const original = necesidad('Leche', 'alimentacion');
    const editada = editarNecesidad(
      original,
      { ...original, cantidad: 6, unidad: 'l', notas: 'semidesnatada' },
      LUEGO,
    );
    expect(editada).toMatchObject({
      id: original.id,
      creada: AHORA,
      actualizada: LUEGO,
      cantidad: 6,
      unidad: 'l',
      notas: 'semidesnatada',
    });
  });
});

describe('agruparPorCategoria', () => {
  it('agrupa en el orden alimentación, limpieza, higiene, mascota y ordena por nombre', () => {
    const grupos = agruparPorCategoria([
      necesidad('Pienso', 'mascota'),
      necesidad('detergente', 'limpieza'),
      necesidad('Pollo', 'alimentacion'),
      necesidad('Arroz', 'alimentacion'),
    ]);
    expect(grupos.map((g) => [g.categoria, g.necesidades.map((n) => n.nombre)])).toEqual([
      ['alimentacion', ['Arroz', 'Pollo']],
      ['limpieza', ['detergente']],
      ['mascota', ['Pienso']],
    ]);
  });
});

describe('equivalencias', () => {
  const leche = crearNecesidad(
    { nombre: 'Leche', categoria: 'alimentacion', cantidad: 6, unidad: 'l', frecuencia: 'semana' },
    AHORA,
    'leche',
  );
  const catalogo = new Map([['mercadona:10381', { id: '10381', nombre: 'Leche Hacendado' }]]);
  const buscarProducto = (tienda: string, id: string) => catalogo.get(`${tienda}:${id}`);

  it('al principio no hay nada elegido', () => {
    expect(estadoEquivalencia(leche, 'mercadona', buscarProducto)).toEqual({ tipo: 'sin-elegir' });
  });

  it('guarda el producto elegido por su id y lo encuentra', () => {
    const n = elegirProducto(leche, 'mercadona', '10381', LUEGO);
    expect(n.equivalencias).toEqual({ mercadona: { id: '10381' } });
    expect(n.actualizada).toBe(LUEGO);
    expect(estadoEquivalencia(n, 'mercadona', buscarProducto)).toEqual({
      tipo: 'elegido',
      producto: { id: '10381', nombre: 'Leche Hacendado' },
    });
  });

  it('avisa si el producto elegido ya no está en el catálogo (no busca otro por nombre)', () => {
    const n = elegirProducto(leche, 'mercadona', '99999', LUEGO);
    expect(estadoEquivalencia(n, 'mercadona', buscarProducto)).toEqual({
      tipo: 'desaparecido',
      id: '99999',
    });
  });

  it('«no lo compro aquí» y deshacer', () => {
    const n = noComprarEn(leche, 'consum', LUEGO);
    expect(estadoEquivalencia(n, 'consum', buscarProducto)).toEqual({ tipo: 'no-compro' });
    const deshecha = quitarEquivalencia(n, 'consum', LUEGO);
    expect(deshecha).not.toHaveProperty('equivalencias');
    expect(estadoEquivalencia(deshecha, 'consum', buscarProducto)).toEqual({ tipo: 'sin-elegir' });
  });

  it('cambiar una tienda no toca las demás', () => {
    let n = elegirProducto(leche, 'mercadona', '10381', LUEGO);
    n = noComprarEn(n, 'consum', LUEGO);
    n = elegirProducto(n, 'mercadona', '10382', LUEGO);
    expect(n.equivalencias).toEqual({ mercadona: { id: '10382' }, consum: { noCompro: true } });
    expect(quitarEquivalencia(n, 'mercadona', LUEGO).equivalencias).toEqual({
      consum: { noCompro: true },
    });
  });
});
