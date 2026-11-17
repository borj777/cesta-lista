import { describe, expect, it } from 'vitest';
import { avisosDespensa, olvidada, resumenDespensa } from '../src/despensa/avisos.ts';
import { crearNecesidad, type Necesidad } from '../src/necesidades/modelo.ts';

const AHORA = '2026-11-17T10:00:00.000Z';
const HOY = '2026-11-17';
const nec = (
  id: string,
  cantidad: number,
  unidad: Necesidad['unidad'],
  frecuencia: Necesidad['frecuencia'] = 'semana',
  extra: Partial<Necesidad> = {},
): Necesidad => ({
  ...crearNecesidad(
    { nombre: id, categoria: 'alimentacion', cantidad, unidad, frecuencia },
    AHORA,
    id,
  ),
  ...extra,
});

// 7 litros a la semana: 1 litro al día.
const leche = nec('Leche', 7, 'l', 'semana', { despensa: { cantidad: 0, fecha: HOY } });
const huevos = nec('Huevos', 14, 'ud', 'semana', { despensa: { cantidad: 4, fecha: HOY } }); // 2 días
const cafe = nec('Café', 70, 'g', 'semana', { despensa: { cantidad: 0.03, fecha: HOY } }); // 3 días
const arroz = nec('Arroz', 700, 'g', 'semana', { despensa: { cantidad: 0.4, fecha: HOY } }); // 4 días
const sal = nec('Sal', 70, 'g', 'semana', { despensa: { cantidad: 1, fecha: HOY } }); // 100 días
const pan = nec('Pan', 7, 'ud'); // nunca comprado con la app
const detergente = nec('Detergente', 50, 'lavado', 'mes', { ultimaCompra: '2026-09-01' });

describe('resumen de la despensa', () => {
  it('reparte en acabado, poco, queda y no se sabe, cada uno en su orden', () => {
    const r = resumenDespensa([sal, arroz, pan, cafe, leche, huevos, detergente], HOY);
    const nombres = (filas: { necesidad: Necesidad }[]) => filas.map((f) => f.necesidad.nombre);
    expect(nombres(r.acabado)).toEqual(['Leche']);
    expect(nombres(r.poco)).toEqual(['Huevos', 'Café']); // 2 y 3 días
    expect(nombres(r.queda)).toEqual(['Arroz', 'Sal']); // 4 y 100 días
    expect(nombres(r.desconocido)).toEqual(['Detergente', 'Pan']);
  });

  it('lo que queda se descuenta con los días', () => {
    const r = resumenDespensa([arroz], '2026-11-18'); // queda para 3 días
    expect(r.poco.map((f) => f.necesidad.id)).toEqual(['Arroz']);
    expect(r.poco[0]?.fin).toBe('2026-11-21');
  });
});

describe('hace tiempo que no se compra', () => {
  it('cuando han pasado más del doble de días que su frecuencia', () => {
    const semanal = nec('Pan', 7, 'ud', 'semana', { ultimaCompra: '2026-11-03' }); // 14 días
    expect(olvidada(semanal, HOY)).toBe(false);
    expect(olvidada(semanal, '2026-11-18')).toBe(true); // 15 días
    expect(olvidada(detergente, HOY)).toBe(true); // 77 días > 61
    expect(olvidada(pan, HOY)).toBe(false); // nunca comprado: no se avisa
  });
});

describe('avisos', () => {
  it('cuenta lo acabado, lo que queda poco y lo olvidado', () => {
    const a = avisosDespensa([sal, arroz, pan, cafe, leche, huevos, detergente], HOY);
    expect(a.acabado).toHaveLength(1);
    expect(a.poco).toHaveLength(2);
    expect(a.olvidado.map((f) => f.necesidad.id)).toEqual(['Detergente']);
    expect(a.total).toBe(4);
  });

  it('si se sabe lo que queda, no avisa de «hace tiempo» aunque la compra sea antigua', () => {
    const conMucha = { ...sal, ultimaCompra: '2026-01-01' };
    expect(avisosDespensa([conMucha], HOY).total).toBe(0);
  });

  it('sin nada apuntado no hay avisos', () => {
    expect(avisosDespensa([], HOY).total).toBe(0);
  });
});
