import { describe, expect, it } from 'vitest';
import {
  hoyEnEspana,
  precioVigente,
  textoFormato,
  textoPrecio,
  textoPrecioRef,
  unidadDeComparacion,
} from '../src/formato.ts';
import type { ProductoApp } from '../src/tipos.ts';

describe('textos', () => {
  it.each([
    [{ cantidad: 6, unidad: 'l' }, '6 l'],
    [{ cantidad: 0.5, unidad: 'l' }, '500 ml'],
    [{ cantidad: 0.25, unidad: 'kg' }, '250 g'],
    [{ cantidad: 1.5, unidad: 'kg' }, '1,5 kg'],
    [{ cantidad: 12, unidad: 'ud' }, '12 ud.'],
    [{ cantidad: 50, unidad: 'lavado' }, '50 lavados'],
    [{ cantidad: 1, unidad: 'lavado' }, '1 lavado'],
    [{ cantidad: 30, unidad: 'm' }, '30 m'],
  ] as const)('formato %o → «%s»', (formato, texto) => {
    expect(textoFormato(formato)).toBe(texto);
  });

  it('precios en euros a la española', () => {
    expect(textoPrecio(4.98).replace(/\s/g, ' ')).toBe('4,98 €');
    expect(textoPrecioRef(0.83, 'l')).toBe('0,83 €/l');
    expect(textoPrecioRef(10.4167, 'kg')).toBe('10,42 €/kg');
    expect(textoPrecioRef(0.07, 'lavado')).toBe('0,07 €/lavado');
    // Los importes muy pequeños llevan más decimales para que se distingan.
    expect(textoPrecioRef(0.0077, 'ud')).toBe('0,0077 €/ud.');
  });

  it('las necesidades en g y ml se comparan en kg y litros', () => {
    expect(unidadDeComparacion('g')).toBe('kg');
    expect(unidadDeComparacion('ml')).toBe('l');
    expect(unidadDeComparacion('lavado')).toBe('lavado');
  });

  it('la fecha de hoy es la de España', () => {
    expect(hoyEnEspana(new Date('2026-11-16T23:30:00Z'))).toBe('2026-11-17');
  });
});

describe('precioVigente', () => {
  const enOferta: ProductoApp = {
    tienda: 'consum',
    id: '5125',
    nombre: 'Leche Semidesnatada Brik',
    formato: { cantidad: 1, unidad: 'l' },
    precio: 1.09,
    precioRef: 1.09,
    precioAnterior: 1.17,
    oferta: 'Ahora más barato',
    ofertaHasta: '2026-11-18',
  };

  it('aplica la oferta hasta su último día, incluido', () => {
    expect(precioVigente(enOferta, '2026-11-18')).toEqual({
      precio: 1.09,
      precioRef: 1.09,
      precioAnterior: 1.17,
      oferta: 'Ahora más barato hasta el 18/11',
    });
  });

  it('no aplica una oferta que ya ha terminado: vuelve al precio normal', () => {
    expect(precioVigente(enOferta, '2026-11-19')).toEqual({ precio: 1.17, precioRef: 1.17 });
  });

  it('las bajadas de Mercadona sin fecha se muestran como precio rebajado', () => {
    const rebajado: ProductoApp = { ...enOferta, tienda: 'mercadona' };
    delete rebajado.oferta;
    delete rebajado.ofertaHasta;
    expect(precioVigente(rebajado, '2026-11-19')).toMatchObject({
      precio: 1.09,
      oferta: 'Precio rebajado',
    });
  });
});
