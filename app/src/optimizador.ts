/**
 * Optimizador: decide en qué tiendas comprar para gastar lo mínimo.
 *
 * Se prueban todas las combinaciones de las tiendas encendidas (con 3 tiendas son 7: cada una
 * sola, las parejas y las tres; con 6, 63). Para cada una, cada necesidad se compra en la tienda más barata de la combinación y se suma
 * un coste por cada tienda extra (tiempo y desplazamiento). Gana la de menor coste total.
 * Es un cálculo exacto: se prueban todas las combinaciones.
 *
 * El coste de cada necesidad es lo que se paga en caja: envases enteros × precio del envase,
 * con la cantidad que se gasta en el periodo de la compra (por ejemplo, una semana).
 */
import { precioVigente, unidadDeComparacion } from './formato.ts';
import { SEMANAS, type Necesidad } from './necesidades/modelo.ts';
import type { IdTienda } from './tiendas/modelo.ts';
import type { ProductoApp, Unidad } from './tipos.ts';

export type Tiendas = readonly IdTienda[];

/**
 * Todas las combinaciones de unas tiendas: primero cada una sola, luego las parejas, los tríos...
 * Dentro de cada tamaño, en el orden de las tiendas. Con n tiendas hay 2ⁿ − 1.
 */
export function combinacionesDe(tiendas: Tiendas): Tiendas[] {
  const todas: IdTienda[][] = [];
  for (let mascara = 1; mascara < 2 ** tiendas.length; mascara++) {
    todas.push(tiendas.filter((_, i) => mascara & (1 << i)));
  }
  const posicion = (c: Tiendas) => c.map((t) => tiendas.indexOf(t));
  return todas.sort((a, b) => {
    if (a.length !== b.length) return a.length - b.length;
    const pa = posicion(a);
    const pb = posicion(b);
    const i = pa.findIndex((v, j) => v !== pb[j]);
    return i === -1 ? 0 : (pa[i] ?? 0) - (pb[i] ?? 0);
  });
}

/** Cómo se compra una necesidad en una tienda. */
export type Opcion = {
  tienda: IdTienda;
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

export type ProblemaTienda = { tienda: IdTienda; tipo: 'desaparecido' | 'otra-unidad' };

export type AnalisisNecesidad = {
  necesidad: Necesidad;
  /** Cantidad que se gasta en el periodo, en kg, l, ud, lavado o m. */
  cantidad: number;
  unidad: Unidad;
  opciones: Partial<Record<IdTienda, Opcion>>;
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
  /**
   * Las combinaciones de las tiendas con algún producto elegido: primero las completas, de la
   * más barata a la más cara.
   */
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
  /**
   * Tiendas encendidas, en su orden (Mercadona, Consum y las propias). Lo elegido en las
   * tiendas apagadas no se tiene en cuenta. El orden decide los empates.
   */
  tiendas: Tiendas;
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
  tienda: IdTienda,
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

/** Opciones de compra de cada necesidad en cada tienda (encendida) con producto elegido. */
export function analizar(
  necesidades: Necesidad[],
  buscarProducto: (tienda: IdTienda, id: string) => ProductoApp | undefined,
  semanas: number,
  hoy: string,
  tiendas: Tiendas,
): AnalisisNecesidad[] {
  return necesidades.map((necesidad) => {
    const cantidad = cantidadEnPeriodo(necesidad, semanas);
    const unidad = unidadDeComparacion(necesidad.unidad);
    const opciones: AnalisisNecesidad['opciones'] = {};
    const problemas: ProblemaTienda[] = [];
    for (const tienda of tiendas) {
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

/**
 * La opción más barata en caja; si empatan, la de menor precio por unidad y luego la de la
 * primera tienda (en el orden de `orden`).
 */
function masBarata(opciones: Opcion[], orden: Tiendas): Opcion | undefined {
  const pos = (t: IdTienda) => orden.indexOf(t);
  return [...opciones].sort(
    (a, b) => a.coste - b.coste || a.precioRef - b.precioRef || pos(a.tienda) - pos(b.tienda),
  )[0];
}

/** Coste de comprar en una combinación de tiendas. `orden` decide los empates. */
export function evaluar(
  analisis: AnalisisNecesidad[],
  tiendas: Tiendas,
  costeVisita: number,
  orden: Tiendas = tiendas,
): Resultado {
  const compras: Compra[] = [];
  const faltan: Necesidad[] = [];
  for (const a of analisis) {
    const posibles = Object.values(a.opciones).filter((o): o is Opcion => o !== undefined);
    if (posibles.length === 0) continue; // No se puede comprar en ninguna tienda.
    const opcion = masBarata(
      posibles.filter((o) => tiendas.includes(o.tienda)),
      orden,
    );
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
 * mismo, la de menos tiendas (menos viajes) y, por último, el orden de `combinaciones`.
 */
function comparador(combinaciones: Tiendas[]) {
  return (a: Resultado, b: Resultado): number =>
    Number(b.completa) - Number(a.completa) ||
    a.total - b.total ||
    a.tiendas.length - b.tiendas.length ||
    combinaciones.indexOf(a.tiendas) - combinaciones.indexOf(b.tiendas);
}

export function planificar(
  necesidades: Necesidad[],
  buscarProducto: (tienda: IdTienda, id: string) => ProductoApp | undefined,
  opciones: OpcionesPlan,
): Plan {
  const { tiendas } = opciones;
  const analisis = analizar(necesidades, buscarProducto, opciones.semanas, opciones.hoy, tiendas);
  const sinProducto = analisis
    .filter((a) => Object.keys(a.opciones).length === 0)
    .map((a) => a.necesidad);
  // Solo se combinan las tiendas donde se puede comprar algo: las demás no cambian nada.
  const utiles = tiendas.filter((t) => analisis.some((a) => a.opciones[t]));
  const posibles = combinacionesDe(utiles);
  const combinaciones = posibles
    .map((t) => evaluar(analisis, t, opciones.costeVisita, tiendas))
    .sort(comparador(posibles));

  const hayAlgo = analisis.length > sinProducto.length;
  const mejor = hayAlgo ? (combinaciones[0] ?? null) : null;
  const unaTienda = hayAlgo
    ? (combinaciones.find((r) => r.tiendas.length === 1 && r.completa) ?? null)
    : null;
  const ahorro =
    mejor && unaTienda ? centimos(unaTienda.costeProductos - mejor.costeProductos) : null;

  return { mejor, combinaciones, unaTienda, ahorro, sinProducto, analisis };
}
