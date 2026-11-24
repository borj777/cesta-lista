/**
 * «Elegir por mí»: qué ingrediente del catálogo es cada necesidad, qué producto elige la app
 * en Mercadona y Consum y qué oferta de la semana en Lidl. Lo elegido por la app (`auto`) se pone al día con los precios de cada
 * día; lo elegido a mano no se toca nunca. Funciones puras.
 */
import { palabras } from '../buscador.ts';
import { unidadDeComparacion } from '../formato.ts';
import {
  elegidoPorLaApp,
  elegirAutomatico,
  SEMANAS,
  type Necesidad,
} from '../necesidades/modelo.ts';
import { TIENDAS_AUTOMATICAS } from '../tiendas/modelo.ts';
import {
  elegirOferta,
  esOfertaSemanal,
  estadoOferta,
  noVale,
  quitarOferta,
} from '../tiendas/ofertas.ts';
import type { DatosApp, ProductoApp } from '../tipos.ts';
import { INGREDIENTES, type Ingrediente } from './catalogo.ts';
import { elegirProducto } from './elegir.ts';

type Datos = Pick<DatosApp, 'productos' | 'secciones'>;

const porId = new Map(INGREDIENTES.map((i) => [i.id, i]));

/** Texto comparable: sin tildes, mayúsculas, signos ni plurales sencillos. */
const clave = (texto: string) => palabras(texto).join(' ');

/**
 * El ingrediente que corresponde a un texto («Pechuga de pollo», «pollo», «Leche»): primero el
 * que se llama exactamente así; si no, aquel cuyas palabras están todas en el texto (el de más
 * palabras gana: «tomate frito» antes que «tomate»).
 */
export function ingredientePorNombre(texto: string): Ingrediente | undefined {
  const k = clave(texto);
  if (!k) return undefined;
  const nombres = (i: Ingrediente) => [i.nombre, ...(i.nombres ?? [])];
  const exacto = INGREDIENTES.find((i) => nombres(i).some((n) => clave(n) === k));
  if (exacto) return exacto;
  const suyas = new Set(palabras(texto));
  let mejor: { ingrediente: Ingrediente; palabras: number } | undefined;
  for (const i of INGREDIENTES) {
    for (const n of nombres(i)) {
      // Lo que va entre paréntesis («Fruta (la más barata del día)») no cuenta.
      const ps = palabras(n.replace(/\(.*?\)/g, ''));
      if (ps.length === 0 || !ps.every((p) => suyas.has(p))) continue;
      if (!mejor || ps.length > mejor.palabras) mejor = { ingrediente: i, palabras: ps.length };
    }
  }
  return mejor?.ingrediente;
}

/** El ingrediente de una necesidad: el que tiene apuntado o, si no, el de su nombre. */
export function ingredienteDe(
  n: Pick<Necesidad, 'nombre' | 'ingrediente'>,
): Ingrediente | undefined {
  return (n.ingrediente ? porId.get(n.ingrediente) : undefined) ?? ingredientePorNombre(n.nombre);
}

/** ¿Se puede comparar el ingrediente con la necesidad? (kg con kg o g, l con l o ml, ud con ud). */
export const unidadCompatible = (i: Ingrediente, n: Pick<Necesidad, 'unidad'>) =>
  unidadDeComparacion(n.unidad) === i.unidad;

/**
 * Unidad que corresponde a un nombre («Huevos» → ud, «Leche» → l), si es de un ingrediente
 * conocido. Sirve para poner la unidad al crear una necesidad.
 */
export function unidadDelNombre(nombre: string): Ingrediente['unidad'] | undefined {
  return ingredientePorNombre(nombre)?.unidad;
}

export type CambioDeUnidad = {
  ingrediente: Ingrediente;
  /** La necesidad pasada a la unidad del ingrediente, o null si no se puede pasar sola. */
  arreglada: Necesidad | null;
};

/**
 * Si la necesidad es de un ingrediente conocido pero va en otra unidad (huevos en kg), la app
 * no puede elegir el producto ni sumarla a la compra. Propone pasarla a la unidad del
 * ingrediente con el mismo número (12 kg → 12 unidades; g y ml se pasan a kg y l). De g o ml
 * a unidades no se sabe cuántas son: hay que escribirlo (arreglada = null).
 */
export function cambioDeUnidad(n: Necesidad): CambioDeUnidad | null {
  const ingrediente = ingredienteDe(n);
  if (!ingrediente || unidadCompatible(ingrediente, n)) return null;
  const pequena = n.unidad === 'g' || n.unidad === 'ml';
  if (pequena && ingrediente.unidad === 'ud') return { ingrediente, arreglada: null };
  const cantidad = pequena ? n.cantidad / 1000 : n.cantidad;
  const arreglada: Necesidad = { ...n, unidad: ingrediente.unidad, cantidad };
  // Lo apuntado de la despensa iba en la unidad de antes: ya no vale.
  delete arreglada.despensa;
  delete arreglada.duraHasta;
  return { ingrediente, arreglada };
}

/** ¿En qué tiendas con catálogo puede elegir la app? Donde no hay nada o lo eligió ella. */
export function tiendasPorElegir(n: Necesidad): string[] {
  return TIENDAS_AUTOMATICAS.filter((t) => !n.equivalencias?.[t] || elegidoPorLaApp(n, t));
}

export type ResultadoEleccion = {
  necesidad: Necesidad;
  ingrediente: Ingrediente;
  /** Tiendas en las que la app ha elegido producto. */
  elegidas: string[];
  /** Tiendas en las que no hay ningún producto que valga. */
  sinProducto: string[];
};

/**
 * Elige el producto más barato del ingrediente en cada tienda con catálogo, sin tocar lo
 * elegido a mano ni lo marcado como «no lo compro aquí». Devuelve null si la necesidad no
 * corresponde a ningún ingrediente o se mide en otra unidad.
 */
export function elegirPorMi(
  n: Necesidad,
  datos: Datos,
  hoy: string,
  ahora: string,
  /** Lo que se gasta a la semana en kg, l o ud. (con el menú); si falta, el de la necesidad. */
  semanal: number = gastoSemanal(n),
): ResultadoEleccion | null {
  const ingrediente = ingredienteDe(n);
  if (!ingrediente || !unidadCompatible(ingrediente, n)) return null;
  let necesidad: Necesidad = { ...n, ingrediente: ingrediente.id };
  const elegidas: string[] = [];
  const sinProducto: string[] = [];
  for (const tienda of tiendasPorElegir(n)) {
    const producto = elegirProducto(ingrediente, datos, tienda, hoy, semanal);
    if (!producto) {
      sinProducto.push(tienda);
      continue;
    }
    elegidas.push(tienda);
    const actual = necesidad.equivalencias?.[tienda];
    if (!actual || !('id' in actual) || actual.id !== producto.id || !actual.auto) {
      necesidad = elegirAutomatico(necesidad, tienda, producto.id, ahora);
    }
  }
  return { necesidad, ingrediente, elegidas, sinProducto };
}

/**
 * Pone al día lo elegido por la app con los precios de hoy: si en su sección hay otro producto
 * más barato por kg (o el elegido ha desaparecido), lo cambia. Devuelve solo las necesidades
 * que cambian.
 */
export function actualizarAutomaticas(
  necesidades: readonly Necesidad[],
  datos: Datos,
  hoy: string,
  ahora: string,
  /** Lo que se gasta a la semana de cada necesidad (con el menú), en kg, l o ud. */
  semanalDe: (n: Necesidad) => number = gastoSemanal,
): Necesidad[] {
  const cambiadas: Necesidad[] = [];
  for (const n of necesidades) {
    const automaticas = TIENDAS_AUTOMATICAS.filter((t) => elegidoPorLaApp(n, t));
    if (automaticas.length === 0) continue;
    const ingrediente = ingredienteDe(n);
    if (!ingrediente || !unidadCompatible(ingrediente, n)) continue;
    let nueva = n;
    for (const tienda of automaticas) {
      const producto = elegirProducto(ingrediente, datos, tienda, hoy, semanalDe(n));
      const actual = n.equivalencias?.[tienda];
      if (producto && actual && 'id' in actual && actual.id !== producto.id) {
        nueva = elegirAutomatico(nueva, tienda, producto.id, ahora);
      }
    }
    if (nueva !== n) cambiadas.push(nueva);
  }
  return cambiadas;
}

/** Lo que se gasta a la semana de una necesidad, en kg, l o ud. (g y ml pasan a kg y l). */
export function gastoSemanal(n: Pick<Necesidad, 'cantidad' | 'unidad' | 'frecuencia'>): number {
  const base = unidadDeComparacion(n.unidad);
  const factor = n.unidad === 'g' || n.unidad === 'ml' ? 0.001 : 1;
  return base === 'kg' || base === 'l' || base === 'ud'
    ? (n.cantidad * factor) / SEMANAS[n.frecuencia]
    : 0;
}

/** «por kg», «por litro» o «por unidad», para explicar cómo elige la app. */
export const textoPorUnidad = (i: Ingrediente) =>
  i.unidad === 'kg' ? 'por kg' : i.unidad === 'l' ? 'por litro' : 'por unidad';

/**
 * La oferta de la semana que elige la app para una necesidad en una tienda sin catálogo
 * (Lidl): la que menos cuesta para lo que se gasta entre las ofertas de hoy que son su
 * ingrediente, sin las que el usuario ha dicho que no le valen.
 */
export function ofertaAutomatica(
  n: Necesidad,
  datos: Datos,
  tienda: string,
  hoy: string,
  semanal: number = gastoSemanal(n),
): ProductoApp | undefined {
  const ingrediente = ingredienteDe(n);
  if (!ingrediente || !unidadCompatible(ingrediente, n)) return undefined;
  const ofertas = datos.productos.filter(
    (p) =>
      p.tienda === tienda &&
      esOfertaSemanal(p) &&
      estadoOferta(p, hoy) === 'vigente' &&
      !noVale(n, tienda, p.id),
  );
  if (ofertas.length === 0) return undefined;
  return elegirProducto(
    ingrediente,
    { productos: ofertas, secciones: datos.secciones },
    tienda,
    hoy,
    semanal,
  );
}

/**
 * Pone al día las ofertas elegidas por la app: en cada tienda con ofertas, la mejor de hoy
 * para cada necesidad, o ninguna si ya no hay. Las elegidas a mano no se tocan. Devuelve solo
 * las necesidades que cambian.
 */
export function actualizarOfertas(
  necesidades: readonly Necesidad[],
  datos: Datos,
  hoy: string,
  ahora: string,
  semanalDe: (n: Necesidad) => number = gastoSemanal,
): Necesidad[] {
  const tiendas = [
    ...new Set(datos.productos.filter((p) => esOfertaSemanal(p)).map((p) => p.tienda)),
  ];
  const cambiadas: Necesidad[] = [];
  for (const n of necesidades) {
    let nueva = n;
    for (const tienda of tiendas) {
      const actual = nueva.ofertas?.[tienda];
      if (actual && !actual.auto) continue;
      const mejor = ofertaAutomatica(nueva, datos, tienda, hoy, semanalDe(n));
      if (mejor && mejor.id !== actual?.id)
        nueva = elegirOferta(nueva, tienda, mejor.id, ahora, true);
      else if (!mejor && actual) nueva = quitarOferta(nueva, tienda, ahora);
    }
    if (nueva !== n) cambiadas.push(nueva);
  }
  return cambiadas;
}
