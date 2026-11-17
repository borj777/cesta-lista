/**
 * La dieta que se está revisando, en memoria: se conserva al ir a crear una receta y volver,
 * pero no se guarda (el PDF y su contenido no salen de la pantalla). Lo decidido de cada plato
 * sí se guarda al momento, en las recetas, así que al leer el PDF otra vez se recupera.
 */
import type { Lectura } from './leer.ts';
import { gruposDeRevision, type GrupoRevision, type PlatoRevision } from './revision.ts';

export type Revision = {
  lectura: Lectura;
  grupos: GrupoRevision[];
  /** Veces elegidas de los platos que no son fijos, por id. */
  veces: Record<string, number>;
  personas: number | null;
};

let revision: Revision | null = null;

export const revisionActual = () => revision;

export function empezarRevision(lectura: Lectura): Revision {
  revision = { lectura, grupos: gruposDeRevision(lectura), veces: {}, personas: null };
  return revision;
}

export function cambiarRevision(cambios: Partial<Pick<Revision, 'veces' | 'personas'>>): void {
  if (revision) revision = { ...revision, ...cambios };
}

export function terminarRevision(): void {
  revision = null;
}

export function platoDeRevision(id: string): PlatoRevision | undefined {
  return revision?.grupos.flatMap((g) => g.platos).find((p) => p.id === id);
}
