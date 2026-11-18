/**
 * La dieta que se está revisando, en memoria: se conserva al ir a otra pantalla y volver, pero
 * no se guarda (el PDF y su contenido no salen de la pantalla hasta que se usa).
 */
import type { Lectura } from './leer.ts';

export type Revision = {
  lectura: Lectura;
  personas: number | null;
  /** Cosas quitadas de la compra (por su clave). */
  quitadas: string[];
};

let revision: Revision | null = null;

export const revisionActual = () => revision;

export function empezarRevision(lectura: Lectura): Revision {
  revision = { lectura, personas: null, quitadas: [] };
  return revision;
}

export function cambiarRevision(cambios: Partial<Pick<Revision, 'personas' | 'quitadas'>>): void {
  if (revision) revision = { ...revision, ...cambios };
}

export function terminarRevision(): void {
  revision = null;
}
