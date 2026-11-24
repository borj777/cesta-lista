/**
 * Lo que comparten las pantallas de la despensa: las necesidades que se compran y el ajuste
 * «número en el icono» (almacén `ajustes`, así que va en la copia de seguridad).
 */
import { useEffect, useMemo, useState } from 'preact/hooks';
import { guardarAjuste, leerAjuste } from '../almacen.ts';
import { useNecesidades } from '../necesidades/estado.ts';
import type { Necesidad } from '../necesidades/modelo.ts';

/** Necesidades que se compran (las que no tienen cantidad no aparecen). null mientras se leen. */
export function useParaComprar(): Necesidad[] | null {
  const { necesidades } = useNecesidades();
  return useMemo(() => necesidades?.filter((n) => !n.soloRecetas) ?? null, [necesidades]);
}

export const AJUSTE_ICONO = 'numeroEnIcono';

let numeroEnIcono: boolean | null = null;
const oyentes = new Set<(v: boolean) => void>();

function publicar(valor: boolean) {
  numeroEnIcono = valor;
  for (const oyente of oyentes) oyente(valor);
}

export async function recargarNumeroEnIcono(): Promise<void> {
  try {
    publicar((await leerAjuste(AJUSTE_ICONO)) === true);
  } catch {
    publicar(false);
  }
}

export async function guardarNumeroEnIcono(valor: boolean): Promise<void> {
  publicar(valor);
  await guardarAjuste(AJUSTE_ICONO, valor);
}

/** ¿Se muestra el número de avisos en el icono? null mientras se lee (por defecto, no). */
export function useNumeroEnIcono(): boolean | null {
  const [actual, setActual] = useState(numeroEnIcono);
  useEffect(() => {
    oyentes.add(setActual);
    if (numeroEnIcono === null) void recargarNumeroEnIcono();
    else setActual(numeroEnIcono);
    return () => {
      oyentes.delete(setActual);
    };
  }, []);
  return actual;
}
