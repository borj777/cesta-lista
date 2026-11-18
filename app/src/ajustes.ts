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
  /** Tiene la app Lidl Plus: en las ofertas de Lidl cuenta el precio con Lidl Plus. */
  lidlPlus: boolean;
};

export const AJUSTES_INICIALES: AjustesCompra = {
  periodo: 'semana',
  costeVisita: 2,
  lidlPlus: false,
};

export const semanasDe = (periodo: Periodo): number => SEMANAS[periodo];

/** Lee los ajustes guardados; si falta alguno o no es válido, usa el valor inicial. */
export function leerAjustesCompra(guardados: {
  periodo?: unknown;
  costeVisita?: unknown;
  lidlPlus?: unknown;
}): AjustesCompra {
  const periodo = PERIODOS.includes(guardados.periodo as Periodo)
    ? (guardados.periodo as Periodo)
    : AJUSTES_INICIALES.periodo;
  const coste = guardados.costeVisita;
  const costeVisita =
    typeof coste === 'number' && Number.isFinite(coste) && coste >= 0 && coste <= 100
      ? coste
      : AJUSTES_INICIALES.costeVisita;
  const lidlPlus =
    typeof guardados.lidlPlus === 'boolean' ? guardados.lidlPlus : AJUSTES_INICIALES.lidlPlus;
  return { periodo, costeVisita, lidlPlus };
}

let estado: AjustesCompra | null = null;
const oyentes = new Set<(a: AjustesCompra) => void>();

function publicar(nuevo: AjustesCompra) {
  estado = nuevo;
  for (const oyente of oyentes) oyente(nuevo);
}

export async function recargarAjustesCompra(): Promise<void> {
  try {
    const [periodo, costeVisita, lidlPlus] = await Promise.all([
      leerAjuste('periodo'),
      leerAjuste('costeVisita'),
      leerAjuste('lidlPlus'),
    ]);
    publicar(leerAjustesCompra({ periodo, costeVisita, lidlPlus }));
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
    guardarAjuste('lidlPlus', nuevos.lidlPlus),
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
