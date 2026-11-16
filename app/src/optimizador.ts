/**
 * Optimizador: decide en qué tiendas comprar para gastar lo mínimo.
 *
 * Con 3 tiendas hay 7 combinaciones posibles (cada tienda sola, las parejas y las tres).
 * Para cada una, cada necesidad se compra en la tienda más barata de la combinación y se suma
 * un coste por cada tienda extra (tiempo y desplazamiento). Gana la de menor coste total.
 * Es un cálculo exacto: se prueban todas las combinaciones.
 *
 * El coste de cada necesidad es lo que se paga en caja: envases enteros × precio del envase,
 * con la cantidad que se gasta en el periodo de la compra (por ejemplo, una semana).
 */
import { precioVigente, unidadDeComparacion } from './formato.ts';
import {
  SEMANAS,
  TIENDAS_EQUIVALENCIA,
  type Necesidad,
  type TiendaEquivalencia,
} from './necesidades/modelo.ts';
import type { ProductoApp, Unidad } from './tipos.ts';

export type Tiendas = readonly TiendaEquivalencia[];

/** Las 7 combinaciones: primero cada tienda sola, luego las parejas y por último las tres. */
export const COMBINACIONES: Tiendas[] = [
  ['mercadona'],
  ['consum'],
  ['lidl'],
  ['mercadona', 'consum'],
  ['mercadona', 'lidl'],
  ['consum', 'lidl'],
  ['mercadona', 'consum', 'lidl'],
];

/** Cómo se compra una necesidad en una tienda. */
export type Opcion = {
  tienda: TiendaEquivalencia;
  producto: ProductoApp;
  /** Envases enteros que hay que comprar. */
  envases: number;
  /** Precio de un envase hoy (con la oferta si sigue vigente). */
  precio: number;
  /** Precio por kg, l, ud... de hoy, para desempatar. */
  precioRef: number;
  /** Lo que se paga en caja: envases × precio. */
  coste: number;
  /**
   * El producto se vende en otra unidad que la necesidad, que se cuenta en unidades:
   * se compra un envase por unidad (p. ej. «1 detergente al mes» y un detergente por lavados).
   */
  porEnvase: boolean;
};

export type ProblemaTienda = { tienda: TiendaEquivalencia; tipo: 'desaparecido' | 'otra-unidad' };

export type AnalisisNecesidad = {
  necesidad: Necesidad;
  /** Cantidad que se gasta en el periodo, en kg, l, ud, lavado o m. */
  cantidad: number;
  unidad: Unidad;
  opciones: Partial<Record<TiendaEquivalencia, Opcion>>;
  /** Tiendas con un producto elegido que no se puede usar. */
  problemas: ProblemaTienda[];
};

export type Compra = { analisis: AnalisisNecesidad; opcion: Opcion };

export type Resultado = {
  tiendas: Tiendas;
  compras: Compra[];
  /** Necesidades que se podrían comprar en otra tienda pero no en estas. */
  faltan: Necesidad[];
  /** Lo que se paga en caja. */
  costeProductos: number;
  /** Coste de las tiendas extra: costeVisita × (tiendas − 1). */
  costeVisitas: number;
  total: number;
  /** Cubre todas las necesidades que se pueden comprar en alguna tienda. */
  completa: boolean;
};

export type Plan = {
  /** La combinación elegida, o null si no hay nada que comprar. */
  mejor: Resultado | null;
  /** Las 7 combinaciones: primero las completas, de la más barata a la más cara. */
  combinaciones: Resultado[];
  /** La tienda sola más barata que tiene todo, para calcular el ahorro. */
  unaTienda: Resultado | null;
  /** Lo que se ahorra en caja frente a comprarlo todo en `unaTienda`. */
  ahorro: number | null;
  /** Necesidades sin ningún producto que se pueda comprar: no entran en el cálculo. */
  sinProducto: Necesidad[];
  analisis: AnalisisNecesidad[];
};

export type OpcionesPlan = {
  /** Semanas que cubre la compra (1, 2 o 52/12 para un mes). */
  semanas: number;
  /** Coste, en euros, de ir a cada tienda más allá de la primera. */
  costeVisita: number;
  /** Fecha de hoy en España (AAAA-MM-DD), para no aplicar ofertas terminadas. */
  hoy: string;
};

const centimos = (n: number) => Math.round(n * 100) / 100;
/** Margen para que 1,5 / 0,5 no dé 3,0000000004 y se redondee a 4 envases. */
const MARGEN = 1e-6;

/** Cantidad que se gasta en el periodo, pasada a la unidad de comparación (g → kg, ml → l). */
export function cantidadEnPeriodo(n: Necesidad, semanas: number): number {
  const enPeriodo = (n.cantidad * semanas) / SEMANAS[n.frecuencia];
  return n.unidad === 'g' || n.unidad === 'ml' ? enPeriodo / 1000 : enPeriodo;
}

/** Opción de compra de un producto para una cantidad, o null si no se puede calcular. */
export function opcionDe(
  tienda: TiendaEquivalencia,
  producto: ProductoApp,
  cantidad: number,
  unidad: Unidad,
  hoy: string,
): Opcion | null {
  const vigente = precioVigente(producto, hoy);
  const mismaUnidad = producto.formato.unidad === unidad;
  // Con otra unidad solo se puede calcular si la necesidad va por unidades: un envase cada una.
  if (!mismaUnidad && unidad !== 'ud') return null;
  const porEnvase = mismaUnidad ? cantidad / producto.formato.cantidad : cantidad;
  const envases = Math.max(1, Math.ceil(porEnvase - MARGEN));
  return {
    tienda,
    producto,
    envases,
    precio: vigente.precio,
    precioRef: vigente.precioRef,
    coste: centimos(envases * vigente.precio),
    porEnvase: !mismaUnidad,
  };
}

/** Opciones de compra de cada necesidad en cada tienda donde tiene producto elegido. */
export function analizar(
  necesidades: Necesidad[],
  buscarProducto: (tienda: TiendaEquivalencia, id: string) => ProductoApp | undefined,
  semanas: number,
  hoy: string,
): AnalisisNecesidad[] {
  return necesidades.map((necesidad) => {
    const cantidad = cantidadEnPeriodo(necesidad, semanas);
    const unidad = unidadDeComparacion(necesidad.unidad);
    const opciones: AnalisisNecesidad['opciones'] = {};
    const problemas: ProblemaTienda[] = [];
    for (const tienda of TIENDAS_EQUIVALENCIA) {
      const e = necesidad.equivalencias?.[tienda];
      if (!e || 'noCompro' in e) continue;
      const producto = buscarProducto(tienda, e.id);
      if (!producto) {
        problemas.push({ tienda, tipo: 'desaparecido' });
        continue;
      }
      const opcion = opcionDe(tienda, producto, cantidad, unidad, hoy);
      if (opcion) opciones[tienda] = opcion;
      else problemas.push({ tienda, tipo: 'otra-unidad' });
    }
    return { necesidad, cantidad, unidad, opciones, problemas };
  });
}

const orden = (t: TiendaEquivalencia) => TIENDAS_EQUIVALENCIA.indexOf(t);

/** La opción más barata en caja; si empatan, la de menor precio por unidad y luego la primera. */
function masBarata(opciones: Opcion[]): Opcion | undefined {
  return [...opciones].sort(
    (a, b) => a.coste - b.coste || a.precioRef - b.precioRef || orden(a.tienda) - orden(b.tienda),
  )[0];
}

/** Coste de comprar en una combinación de tiendas. */
export function evaluar(
  analisis: AnalisisNecesidad[],
  tiendas: Tiendas,
  costeVisita: number,
): Resultado {
  const compras: Compra[] = [];
  const faltan: Necesidad[] = [];
  for (const a of analisis) {
    const posibles = Object.values(a.opciones);
    if (posibles.length === 0) continue; // No se puede comprar en ninguna tienda.
    const opcion = masBarata(posibles.filter((o) => tiendas.includes(o.tienda)));
    if (opcion) compras.push({ analisis: a, opcion });
    else faltan.push(a.necesidad);
  }
  const costeProductos = centimos(compras.reduce((suma, c) => suma + c.opcion.coste, 0));
  const costeVisitas = centimos(costeVisita * (tiendas.length - 1));
  return {
    tiendas,
    compras,
    faltan,
    costeProductos,
    costeVisitas,
    total: centimos(costeProductos + costeVisitas),
    completa: faltan.length === 0,
  };
}

/**
 * Orden de las combinaciones: primero las que tienen todo, luego la más barata; si cuestan lo
 * mismo, la de menos tiendas (menos viajes) y, por último, el orden de COMBINACIONES.
 */
function comparar(a: Resultado, b: Resultado): number {
  return (
    Number(b.completa) - Number(a.completa) ||
    a.total - b.total ||
    a.tiendas.length - b.tiendas.length ||
    COMBINACIONES.indexOf(a.tiendas) - COMBINACIONES.indexOf(b.tiendas)
  );
}

export function planificar(
  necesidades: Necesidad[],
  buscarProducto: (tienda: TiendaEquivalencia, id: string) => ProductoApp | undefined,
  opciones: OpcionesPlan,
): Plan {
  const analisis = analizar(necesidades, buscarProducto, opciones.semanas, opciones.hoy);
  const sinProducto = analisis
    .filter((a) => Object.keys(a.opciones).length === 0)
    .map((a) => a.necesidad);
  const combinaciones = COMBINACIONES.map((t) => evaluar(analisis, t, opciones.costeVisita)).sort(
    comparar,
  );

  const hayAlgo = analisis.length > sinProducto.length;
  const mejor = hayAlgo ? (combinaciones[0] ?? null) : null;
  const unaTienda = hayAlgo
    ? (combinaciones.find((r) => r.tiendas.length === 1 && r.completa) ?? null)
    : null;
  const ahorro =
    mejor && unaTienda ? centimos(unaTienda.costeProductos - mejor.costeProductos) : null;

  return { mejor, combinaciones, unaTienda, ahorro, sinProducto, analisis };
}
