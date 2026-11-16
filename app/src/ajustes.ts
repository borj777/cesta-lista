/**
 * Ajustes de la compra: cada cuánto se hace y cuánto «cuesta» ir a una tienda más.
 * Se guardan en el almacén `ajustes` de IndexedDB y van en la copia de seguridad.
 */
import { useEffect, useState } from 'preact/hooks';
import { guardarAjuste, leerAjuste } from './almacen.ts';
import { SEMANAS } from './necesidades/modelo.ts';

export const PERIODOS = ['semana', 'quincena', 'mes'] as const;
export type Periodo = (typeof PERIODOS)[number];

export const NOMBRE_PERIODO: Record<Periodo, string> = {
  semana: '1 semana',
  quincena: '2 semanas',
  mes: '1 mes',
};

export type AjustesCompra = {
  periodo: Periodo;
  /** Euros que cuenta ir a cada tienda más allá de la primera (tiempo y desplazamiento). */
  costeVisita: number;
};

export const AJUSTES_INICIALES: AjustesCompra = { periodo: 'semana', costeVisita: 2 };

export const semanasDe = (periodo: Periodo): number => SEMANAS[periodo];

/** Lee los ajustes guardados; si falta alguno o no es válido, usa el valor inicial. */
export function leerAjustesCompra(guardados: { periodo?: unknown; costeVisita?: unknown }) {
  const periodo = PERIODOS.includes(guardados.periodo as Periodo)
    ? (guardados.periodo as Periodo)
    : AJUSTES_INICIALES.periodo;
  const coste = guardados.costeVisita;
  const costeVisita =
    typeof coste === 'number' && Number.isFinite(coste) && coste >= 0 && coste <= 100
      ? coste
      : AJUSTES_INICIALES.costeVisita;
  return { periodo, costeVisita };
}

let estado: AjustesCompra | null = null;
const oyentes = new Set<(a: AjustesCompra) => void>();

function publicar(nuevo: AjustesCompra) {
  estado = nuevo;
  for (const oyente of oyentes) oyente(nuevo);
}

export async function recargarAjustesCompra(): Promise<void> {
  try {
    const [periodo, costeVisita] = await Promise.all([
      leerAjuste('periodo'),
      leerAjuste('costeVisita'),
    ]);
    publicar(leerAjustesCompra({ periodo, costeVisita }));
  } catch {
    publicar(estado ?? AJUSTES_INICIALES);
  }
}

export async function guardarAjustesCompra(cambios: Partial<AjustesCompra>): Promise<void> {
  const nuevos = { ...(estado ?? AJUSTES_INICIALES), ...cambios };
  publicar(nuevos);
  await Promise.all([
    guardarAjuste('periodo', nuevos.periodo),
    guardarAjuste('costeVisita', nuevos.costeVisita),
  ]);
}

/** Ajustes de la compra, o null mientras se leen. */
export function useAjustesCompra(): AjustesCompra | null {
  const [actual, setActual] = useState(estado);
  useEffect(() => {
    oyentes.add(setActual);
    if (estado === null) void recargarAjustesCompra();
    else setActual(estado);
    return () => {
      oyentes.delete(setActual);
    };
  }, []);
  return actual;
}
