import { describe, expect, it } from 'vitest';
import { leerAjustesCompra } from '../src/ajustes.ts';
import { actualizarOfertas, ofertaAutomatica } from '../src/ingredientes/automatico.ts';
import { crearNecesidad, type Necesidad } from '../src/necesidades/modelo.ts';
import { planificar } from '../src/optimizador.ts';
import {
  aplicarLidlPlus,
  conLidlPlus,
  elegirOferta,
  esOfertaSemanal,
  estadoOferta,
  etiquetaOferta,
  notaLidlPlus,
  ofertasDe,
  ofertaVigente,
  quitarOferta,
  quitarOfertasTerminadas,
} from '../src/tiendas/ofertas.ts';
import type { DatosApp, ProductoApp } from '../src/tipos.ts';

const AHORA = '2026-11-18T10:00:00.000Z';
const HOY = '2026-11-18';

/** Ofertas inventadas con la forma de las de Lidl en app.json. */
const pechuga: ProductoApp = {
  tienda: 'lidl',
  id: '111',
  nombre: 'Filete de pechuga',
  marca: 'Marca',
  formato: { cantidad: 0.5, unidad: 'kg' },
  precio: 3.99,
  precioRef: 7.98,
  ofertaHasta: '2026-11-22',
};
const naranjas: ProductoApp = {
  tienda: 'lidl',
  id: '222',
  nombre: 'Naranja malla',
  formato: { cantidad: 2, unidad: 'kg' },
  precio: 1.49,
  precioRef: 0.745,
  precioLidlPlus: 0.95,
  ofertaHasta: '2026-11-22',
};
const mantequilla: ProductoApp = {
  tienda: 'lidl',
  id: '333',
  nombre: 'Mantequilla',
  formato: { cantidad: 0.25, unidad: 'kg' },
  precio: 1.65,
  precioRef: 6.6,
  precioAnterior: 2.05,
  oferta: '-19 %',
  ofertaHasta: '2026-11-22',
};
const proxima: ProductoApp = {
  ...pechuga,
  id: '444',
  ofertaDesde: '2026-11-23',
  ofertaHasta: '2026-11-29',
};
const terminada: ProductoApp = { ...pechuga, id: '555', ofertaHasta: '2026-11-15' };
/** Producto apuntado a mano en Lidl (sin fechas). */
const pechugaApuntada: ProductoApp = {
  tienda: 'lidl',
  id: 'uuid-pechuga',
  nombre: 'Pechuga de pollo',
  formato: { cantidad: 1, unidad: 'kg' },
  precio: 8.5,
  precioRef: 8.5,
};
const pechugaMercadona: ProductoApp = {
  tienda: 'mercadona',
  id: 'm1',
  nombre: 'Pechuga',
  formato: { cantidad: 1, unidad: 'kg' },
  precio: 8.2,
  precioRef: 8.2,
};

const datos: DatosApp = {
  generado: AHORA,
  tiendas: {},
  productos: [pechugaMercadona, pechuga, naranjas, mantequilla, proxima, terminada],
};
const todos = [...datos.productos, pechugaApuntada];
const buscarProducto = (tienda: string, id: string) =>
  todos.find((p) => p.tienda === tienda && p.id === id);

function necesidad(extra: Partial<Necesidad> = {}): Necesidad {
  return {
    ...crearNecesidad(
      {
        nombre: 'Pechuga',
        categoria: 'alimentacion',
        cantidad: 1,
        unidad: 'kg',
        frecuencia: 'semana',
      },
      AHORA,
      'n1',
    ),
    ...extra,
  };
}

describe('ofertas semanales', () => {
  it('distingue las ofertas de los productos apuntados a mano y de Mercadona', () => {
    expect(esOfertaSemanal(pechuga)).toBe(true);
    expect(esOfertaSemanal(pechugaApuntada)).toBe(false);
    expect(esOfertaSemanal({ ...pechugaMercadona, ofertaHasta: '2026-11-20' })).toBe(false);
  });

  it('sabe si una oferta vale hoy, empieza más adelante o ha terminado', () => {
    expect(estadoOferta(pechuga, HOY)).toBe('vigente');
    expect(estadoOferta(pechuga, '2026-11-22')).toBe('vigente');
    expect(estadoOferta(pechuga, '2026-11-23')).toBe('terminada');
    expect(estadoOferta(proxima, HOY)).toBe('proxima');
    expect(ofertasDe(datos, 'lidl', HOY).map((p) => p.id)).toEqual(['111', '222', '333', '444']);
  });

  it('etiquetas: rebaja con fecha, solo fecha, próxima y precio con Lidl Plus', () => {
    expect(etiquetaOferta(mantequilla, HOY)).toBe('-19 % hasta el 22/11');
    expect(etiquetaOferta(pechuga, HOY)).toBe('Hasta el 22/11');
    expect(etiquetaOferta(proxima, HOY)).toBe('Desde el 23/11');
    expect(etiquetaOferta(pechugaApuntada, HOY)).toBeNull();
    expect(notaLidlPlus(naranjas)).toBe('Con Lidl Plus: 0,95 €');
    expect(notaLidlPlus(pechuga)).toBeNull();
  });

  it('con Lidl Plus cuenta ese precio y el normal pasa a ser el tachado', () => {
    expect(conLidlPlus(naranjas)).toMatchObject({
      precio: 0.95,
      precioRef: 0.475,
      precioAnterior: 1.49,
      oferta: 'Con Lidl Plus',
    });
    expect(conLidlPlus(pechuga)).toBe(pechuga);
    expect(aplicarLidlPlus(datos, false)).toBe(datos);
    const conPlus = aplicarLidlPlus(datos, true);
    expect(conPlus.productos.find((p) => p.id === '222')?.precio).toBe(0.95);
    expect(conPlus.productos.find((p) => p.id === '111')).toBe(pechuga);
  });

  it('elegir y quitar una oferta no toca el producto de siempre', () => {
    const n = necesidad({ equivalencias: { lidl: { id: 'uuid-pechuga' } } });
    const conOferta = elegirOferta(n, 'lidl', '111', AHORA);
    expect(conOferta.ofertas).toEqual({ lidl: { id: '111' } });
    expect(conOferta.equivalencias).toEqual(n.equivalencias);
    const sin = quitarOferta(conOferta, 'lidl', AHORA);
    expect(sin.ofertas).toBeUndefined();
    expect(sin.equivalencias).toEqual(n.equivalencias);
  });

  it('solo usa la oferta elegida mientras vale', () => {
    expect(
      ofertaVigente(necesidad({ ofertas: { lidl: { id: '111' } } }), 'lidl', buscarProducto, HOY),
    ).toBe(pechuga);
    expect(
      ofertaVigente(necesidad({ ofertas: { lidl: { id: '444' } } }), 'lidl', buscarProducto, HOY),
    ).toBeUndefined();
    expect(
      ofertaVigente(necesidad({ ofertas: { lidl: { id: '555' } } }), 'lidl', buscarProducto, HOY),
    ).toBeUndefined();
    expect(
      ofertaVigente(necesidad({ ofertas: { lidl: { id: '999' } } }), 'lidl', buscarProducto, HOY),
    ).toBeUndefined();
  });

  it('quita solas las ofertas terminadas o que ya no se descargan; deja las demás', () => {
    const vigente = necesidad({ ofertas: { lidl: { id: '111' } } });
    const futura = { ...necesidad({ ofertas: { lidl: { id: '444' } } }), id: 'n2' };
    const acabada = { ...necesidad({ ofertas: { lidl: { id: '555' } } }), id: 'n3' };
    const borrada = { ...necesidad({ ofertas: { lidl: { id: '999' } } }), id: 'n4' };
    const cambiadas = quitarOfertasTerminadas(
      [vigente, futura, acabada, borrada],
      datos,
      HOY,
      AHORA,
    );
    expect(cambiadas.map((n) => n.id)).toEqual(['n3', 'n4']);
    expect(cambiadas.every((n) => n.ofertas === undefined)).toBe(true);
  });
});

describe('optimizador con ofertas de Lidl', () => {
  const opciones = {
    semanas: 1,
    costeVisita: 0,
    hoy: HOY,
    tiendas: ['mercadona', 'consum', 'lidl'],
  };
  const compraDe = (n: Necesidad, hoy = HOY) =>
    planificar([n], buscarProducto, { ...opciones, hoy }).mejor?.compras[0]?.opcion;

  it('usa la oferta si sale más barata que el producto de siempre', () => {
    const n = necesidad({
      equivalencias: { mercadona: { id: 'm1' }, lidl: { id: 'uuid-pechuga' } },
      ofertas: { lidl: { id: '111' } },
    });
    // 1 kg: 2 bandejas de la oferta (7,98 €) frente a 8,20 € en Mercadona y 8,50 € de siempre.
    expect(compraDe(n)).toMatchObject({
      tienda: 'lidl',
      producto: pechuga,
      envases: 2,
      coste: 7.98,
    });
  });

  it('cuando la oferta termina, vuelve el producto de siempre', () => {
    const n = necesidad({
      equivalencias: { lidl: { id: 'uuid-pechuga' } },
      ofertas: { lidl: { id: '111' } },
    });
    expect(compraDe(n, '2026-11-23')).toMatchObject({ producto: pechugaApuntada, coste: 8.5 });
  });

  it('una oferta vale aunque no haya producto de siempre ni se compre allí normalmente', () => {
    const sinNada = necesidad({ ofertas: { lidl: { id: '111' } } });
    expect(compraDe(sinNada)?.producto).toBe(pechuga);
    const noCompro = necesidad({
      equivalencias: { lidl: { noCompro: true } },
      ofertas: { lidl: { id: '111' } },
    });
    expect(compraDe(noCompro)?.producto).toBe(pechuga);
  });

  it('si el producto de siempre es más barato, no usa la oferta', () => {
    const barata: ProductoApp = { ...pechugaApuntada, id: 'uuid-barata', precio: 6, precioRef: 6 };
    todos.push(barata);
    const n = necesidad({
      equivalencias: { lidl: { id: 'uuid-barata' } },
      ofertas: { lidl: { id: '111' } },
    });
    expect(compraDe(n)?.producto).toBe(barata);
  });

  it('una oferta que aún no ha empezado no cuenta', () => {
    const n = necesidad({
      equivalencias: { mercadona: { id: 'm1' } },
      ofertas: { lidl: { id: '444' } },
    });
    expect(compraDe(n)?.tienda).toBe('mercadona');
  });
});

describe('ajuste «Tengo Lidl Plus»', () => {
  it('por defecto está apagado y se lee lo guardado', () => {
    expect(leerAjustesCompra({}).lidlPlus).toBe(false);
    expect(leerAjustesCompra({ lidlPlus: true }).lidlPlus).toBe(true);
    expect(leerAjustesCompra({ lidlPlus: 'sí' }).lidlPlus).toBe(false);
  });
});

describe('ofertas elegidas por la app', () => {
  // Ofertas inventadas con secciones como las de Lidl.
  const filete: ProductoApp = { ...pechuga, id: 'f1', seccion: 'aves' };
  const fileteGrande: ProductoApp = {
    ...pechuga,
    id: 'f2',
    formato: { cantidad: 2, unidad: 'kg' },
    precio: 13,
    precioRef: 6.5,
    seccion: 'aves',
  };
  const empanada: ProductoApp = {
    ...pechuga,
    id: 'e1',
    nombre: 'Empanada de pollo',
    seccion: 'aves',
  };
  const conSecciones: DatosApp = {
    generado: AHORA,
    tiendas: {},
    secciones: { lidl: { aves: 'Carne y aves > Aves de corral' } },
    productos: [filete, fileteGrande, empanada, { ...filete, id: 'f3', ofertaDesde: '2026-11-23' }],
  };
  const pollo = () => necesidad({ nombre: 'Pechuga de pollo' });

  it('elige la oferta de su ingrediente que menos cuesta para lo que se gasta', () => {
    // 1 kg a la semana: en 4 semanas, 8 bandejas de 0,5 kg (31,92 €) o 2 de 2 kg (26 €).
    expect(ofertaAutomatica(pollo(), conSecciones, 'lidl', HOY)?.id).toBe('f2');
    // Con 150 g a la semana, la bandeja pequeña.
    expect(ofertaAutomatica(pollo(), conSecciones, 'lidl', HOY, 0.15)?.id).toBe('f1');
    // Lo preparado no vale, ni lo que aún no ha empezado, ni otra necesidad.
    expect(
      ofertaAutomatica(necesidad({ nombre: 'Detergente' }), conSecciones, 'lidl', HOY),
    ).toBeUndefined();
  });

  it('la pone al día cada día y no toca la elegida a mano', () => {
    const [auto] = actualizarOfertas([pollo()], conSecciones, HOY, AHORA, () => 0.15);
    expect(auto?.ofertas).toEqual({ lidl: { id: 'f1', auto: true } });
    // Sin cambios, nada que guardar.
    expect(actualizarOfertas([auto as Necesidad], conSecciones, HOY, AHORA, () => 0.15)).toEqual(
      [],
    );
    // Si ya no hay ninguna que valga, la quita.
    const sinOfertas = { ...conSecciones, productos: [empanada] };
    expect(
      actualizarOfertas([auto as Necesidad], sinOfertas, HOY, AHORA)[0]?.ofertas,
    ).toBeUndefined();
    // La elegida a mano se queda.
    const aMano = elegirOferta(pollo(), 'lidl', 'e1', AHORA);
    expect(actualizarOfertas([aMano], conSecciones, HOY, AHORA)).toEqual([]);
  });

  it('«No me vale» la quita y no la vuelve a proponer; elegirla a mano la recupera', () => {
    const [auto] = actualizarOfertas([pollo()], conSecciones, HOY, AHORA, () => 0.15);
    const rechazada = quitarOferta(auto as Necesidad, 'lidl', AHORA, true);
    expect(rechazada.ofertas).toBeUndefined();
    expect(rechazada.ofertasNoValen).toEqual(['lidl:f1']);
    const [otra] = actualizarOfertas([rechazada], conSecciones, HOY, AHORA, () => 0.15);
    expect(otra?.ofertas?.lidl?.id).toBe('f2');
    expect(elegirOferta(rechazada, 'lidl', 'f1', AHORA).ofertasNoValen).toBeUndefined();
  });

  it('olvida los «No me vale» de ofertas que ya no se descargan', () => {
    const n = necesidad({ ofertasNoValen: ['lidl:f1', 'lidl:viejo'] });
    const [limpia] = quitarOfertasTerminadas([n], conSecciones, HOY, AHORA);
    expect(limpia?.ofertasNoValen).toEqual(['lidl:f1']);
  });
});
