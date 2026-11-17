/**
 * Despensa: lo que queda en casa de cada necesidad. Se guarda lo que había en un día concreto
 * (al terminar una compra o al corregirlo) y, desde entonces, se resta lo que se gasta según
 * el ritmo de la necesidad. Es una estimación: el usuario la corrige con un toque.
 * Funciones puras. Las cantidades van en la unidad de comparación (kg, l, ud, lavado o m).
 */
import { unidadDeComparacion } from '../formato.ts';
import { convertir } from '../menu/recetas.ts';
import {
  escribirCantidad,
  NOMBRE_UNIDAD,
  type Necesidad,
  type UnidadNecesidad,
} from '../necesidades/modelo.ts';

export type Despensa = {
  /** Lo que había ese día. */
  cantidad: number;
  /** AAAA-MM-DD (de España). */
  fecha: string;
  /** Lo que había justo después de la última compra (para «queda la mitad»). */
  lleno?: number;
};

const redondear = (n: number) => Math.round(n * 1e6) / 1e6;
const diasEntre = (desde: string, hasta: string) =>
  Math.round((Date.parse(hasta) - Date.parse(desde)) / 86_400_000);

/**
 * Lo que queda hoy, o null si no se sabe (nunca se ha comprado con la app ni se ha dicho).
 * `semanal` es lo que se gasta a la semana, en la misma unidad.
 */
export function existencias(n: Necesidad, semanal: number, hoy: string): number | null {
  if (n.despensa) {
    const dias = Math.max(0, diasEntre(n.despensa.fecha, hoy));
    return redondear(Math.max(0, n.despensa.cantidad - (semanal * dias) / 7));
  }
  // Compras anteriores a la despensa: solo se sabe hasta cuándo duraba.
  if (n.duraHasta) return redondear(Math.max(0, (semanal * diasEntre(hoy, n.duraHasta)) / 7));
  return null;
}

/** Días que dura lo que queda (Infinity si no se gasta). */
export function diasQueQuedan(cantidad: number, semanal: number): number {
  return semanal > 0 ? Math.floor((cantidad * 7) / semanal + 1e-9) : Infinity;
}

/** «600 g», «1,5 litros», «3 unidades», en la unidad de la necesidad. */
export function textoEnUnidad(cantidad: number, n: Pick<Necesidad, 'unidad'>): string {
  const base = unidadDeComparacion(n.unidad) as UnidadNecesidad;
  const valor = Math.round(convertir(cantidad, base, n.unidad) * 10) / 10;
  const nombre = valor === 1 ? NOMBRE_UNIDAD[n.unidad].una : NOMBRE_UNIDAD[n.unidad].varias;
  return `${escribirCantidad(valor)} ${nombre}`;
}

export type EstadoDespensa =
  { tipo: 'desconocido' } | { tipo: 'acabado' } | { tipo: 'queda'; cantidad: number; dias: number };

export function estadoDespensa(n: Necesidad, semanal: number, hoy: string): EstadoDespensa {
  const cantidad = existencias(n, semanal, hoy);
  if (cantidad === null) return { tipo: 'desconocido' };
  if (cantidad <= 1e-9) return { tipo: 'acabado' };
  return { tipo: 'queda', cantidad, dias: diasQueQuedan(cantidad, semanal) };
}

/** «Te quedan unos 600 g, para 9 días», «Se ha acabado» o «No se sabe todavía». */
export function textoDespensa(n: Necesidad, estado: EstadoDespensa): string {
  if (estado.tipo === 'desconocido') return 'No se sabe todavía cuánto te queda.';
  if (estado.tipo === 'acabado') return 'Se ha acabado (según lo que gastas).';
  const para =
    estado.dias === Infinity
      ? ''
      : estado.dias === 0
        ? ', para menos de un día'
        : `, para unos ${estado.dias} ${estado.dias === 1 ? 'día' : 'días'}`;
  return `Te quedan unos ${textoEnUnidad(estado.cantidad, n)}${para}.`;
}

/** Correcciones rápidas: guardan lo que hay hoy. */
export function corregirDespensa(
  n: Necesidad,
  cantidad: number,
  hoy: string,
  ahora: string,
): Necesidad {
  const despensa: Despensa = { cantidad: redondear(Math.max(0, cantidad)), fecha: hoy };
  if (n.despensa?.lleno !== undefined) despensa.lleno = n.despensa.lleno;
  const nueva: Necesidad = { ...n, despensa, actualizada: ahora };
  delete nueva.duraHasta;
  return nueva;
}

/** «Queda poco»: para unos 2 días de lo que se gasta. */
export const DIAS_POCO = 2;
export const cantidadPoco = (semanal: number) => redondear((semanal * DIAS_POCO) / 7);

/** Lo que escribe el usuario («Tengo 500 g») pasado a la unidad de comparación. */
export function aComparacion(cantidad: number, unidad: UnidadNecesidad): number {
  return convertir(cantidad, unidad, unidadDeComparacion(unidad) as UnidadNecesidad);
}

/** Lo que hay después de comprar: lo que quedaba hoy más lo comprado. */
export function despuesDeComprar(
  n: Necesidad,
  semanal: number,
  comprado: number,
  hoy: string,
): Despensa {
  const total = redondear((existencias(n, semanal, hoy) ?? 0) + comprado);
  return { cantidad: total, fecha: hoy, lleno: total };
}

const esFecha = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const noNegativo = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/** ¿Es válida la despensa de una copia de seguridad? */
export function despensaValida(d: unknown): boolean {
  if (typeof d !== 'object' || d === null) return false;
  const { cantidad, fecha, lleno } = d as Record<string, unknown>;
  return noNegativo(cantidad) && esFecha(fecha) && (lleno === undefined || noNegativo(lleno));
}
