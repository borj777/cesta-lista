/**
 * Avisos de la despensa: lo que se ha acabado, lo que queda poco y lo que hace tiempo que no
 * se compra. Se calculan al abrir la app (no hay notificaciones: harían falta un servidor).
 * Funciones puras. Las necesidades deben llevar ya sumado el menú.
 */
import { consumoSemanal, diasEntre, seAcaba } from '../lista/compra.ts';
import { SEMANAS, type Necesidad } from '../necesidades/modelo.ts';
import { estadoDespensa, type EstadoDespensa } from './despensa.ts';

/** «Queda poco»: lo que dura 3 días o menos. */
export const DIAS_AVISO_POCO = 3;
/** «Hace tiempo»: sin comprar el doble de lo que suele durar. */
export const VECES_OLVIDO = 2;

export type FilaDespensa = {
  necesidad: Necesidad;
  estado: EstadoDespensa;
  /** Día en que se acaba (si se sabe). */
  fin: string | null;
};

export type ResumenDespensa = {
  acabado: FilaDespensa[];
  /** Dura DIAS_AVISO_POCO días o menos, de lo que menos dura a lo que más. */
  poco: FilaDespensa[];
  /** Hay para más días, de lo que menos dura a lo que más. */
  queda: FilaDespensa[];
  /** No se sabe lo que queda (nunca se ha comprado con la app ni se ha dicho). */
  desconocido: FilaDespensa[];
};

const porNombre = (a: FilaDespensa, b: FilaDespensa) =>
  a.necesidad.nombre.localeCompare(b.necesidad.nombre, 'es');
const dias = (f: FilaDespensa) => (f.estado.tipo === 'queda' ? f.estado.dias : 0);

/** Lo que queda en casa de cada necesidad, repartido por cómo va. */
export function resumenDespensa(necesidades: readonly Necesidad[], hoy: string): ResumenDespensa {
  const resumen: ResumenDespensa = { acabado: [], poco: [], queda: [], desconocido: [] };
  for (const n of necesidades) {
    const estado = estadoDespensa(n, consumoSemanal(n), hoy);
    const fila: FilaDespensa = { necesidad: n, estado, fin: seAcaba(n) };
    if (estado.tipo === 'desconocido') resumen.desconocido.push(fila);
    else if (estado.tipo === 'acabado') resumen.acabado.push(fila);
    else if (estado.dias <= DIAS_AVISO_POCO) resumen.poco.push(fila);
    else resumen.queda.push(fila);
  }
  resumen.acabado.sort(porNombre);
  resumen.poco.sort((a, b) => dias(a) - dias(b) || porNombre(a, b));
  resumen.queda.sort((a, b) => dias(a) - dias(b) || porNombre(a, b));
  resumen.desconocido.sort(porNombre);
  return resumen;
}

/**
 * ¿Hace tiempo que no se compra? Solo cuando no se sabe lo que queda (si se sabe, el aviso es
 * «se ha acabado» o «queda poco»): la última compra es de hace más del doble de su frecuencia.
 */
export function olvidada(n: Necesidad, hoy: string): boolean {
  if (!n.ultimaCompra) return false;
  return diasEntre(n.ultimaCompra, hoy) > Math.round(SEMANAS[n.frecuencia] * 7 * VECES_OLVIDO);
}

export type AvisosDespensa = {
  acabado: FilaDespensa[];
  poco: FilaDespensa[];
  olvidado: FilaDespensa[];
  /** Cuántos avisos hay en total (el número del icono). */
  total: number;
};

export function avisosDespensa(necesidades: readonly Necesidad[], hoy: string): AvisosDespensa {
  const { acabado, poco, desconocido } = resumenDespensa(necesidades, hoy);
  const olvidado = desconocido
    .filter((f) => olvidada(f.necesidad, hoy))
    .sort((a, b) => (a.necesidad.ultimaCompra ?? '').localeCompare(b.necesidad.ultimaCompra ?? ''));
  return { acabado, poco, olvidado, total: acabado.length + poco.length + olvidado.length };
}
