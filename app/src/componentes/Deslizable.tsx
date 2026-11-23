import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

/** Ancho del botón que aparece al deslizar, en px. */
const ANCHO = 88;
/** Lo que hay que mover el dedo para decidir si se desliza o se sube y baja la lista. */
const UMBRAL = 10;

type Inicio = { x: number; y: number; base: number; modo: 'lado' | 'arriba' | null };

/**
 * Fila que se desliza hacia la izquierda para enseñar un botón (como en las listas del
 * iPhone). Al tocar fuera o en la propia fila, se cierra. Solo hay una abierta a la vez:
 * quien la usa guarda cuál.
 */
export function Deslizable({
  abierta,
  alCambiar,
  accion,
  etiquetaAccion,
  alPulsar,
  children,
}: {
  abierta: boolean;
  alCambiar: (abierta: boolean) => void;
  /** Texto del botón (p. ej. «Borrar»). */
  accion: string;
  /** Texto completo para lectores de pantalla (p. ej. «Borrar Leche»). */
  etiquetaAccion: string;
  alPulsar: () => void;
  children: ComponentChildren;
}) {
  const raiz = useRef<HTMLDivElement>(null);
  const inicio = useRef<Inicio | null>(null);
  /** Si se ha deslizado, el toque no abre el enlace de la fila. */
  const movida = useRef(false);
  const [arrastre, setArrastre] = useState<number | null>(null);

  // Tocar fuera de la fila abierta la cierra.
  useEffect(() => {
    if (!abierta) return;
    const fuera = (e: PointerEvent) => {
      if (!raiz.current?.contains(e.target as Node)) alCambiar(false);
    };
    document.addEventListener('pointerdown', fuera);
    return () => document.removeEventListener('pointerdown', fuera);
  }, [abierta, alCambiar]);

  const desplazamiento = arrastre ?? (abierta ? -ANCHO : 0);

  const alBajar = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    inicio.current = { x: e.clientX, y: e.clientY, base: abierta ? -ANCHO : 0, modo: null };
    movida.current = false;
  };
  const alMover = (e: PointerEvent) => {
    const i = inicio.current;
    if (!i) return;
    const dx = e.clientX - i.x;
    const dy = e.clientY - i.y;
    if (i.modo === null) {
      if (Math.abs(dx) > UMBRAL && Math.abs(dx) > Math.abs(dy)) {
        i.modo = 'lado';
        movida.current = true;
        try {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } catch {
          // Sin captura también funciona mientras el dedo siga encima de la fila.
        }
      } else if (Math.abs(dy) > UMBRAL) {
        i.modo = 'arriba';
      }
    }
    if (i.modo === 'lado') setArrastre(Math.min(0, Math.max(-ANCHO, i.base + dx)));
  };
  const alSoltar = () => {
    const i = inicio.current;
    inicio.current = null;
    if (i?.modo !== 'lado') return;
    alCambiar((arrastre ?? i.base) < -ANCHO / 2);
    setArrastre(null);
  };
  const alTocar = (e: MouseEvent) => {
    // Un deslizamiento no es un toque; con la fila abierta, tocarla solo la cierra.
    if (movida.current || abierta) {
      e.preventDefault();
      e.stopPropagation();
      movida.current = false;
      if (abierta) alCambiar(false);
    }
  };

  return (
    <div
      class={abierta || arrastre !== null ? 'deslizable deslizable--activa' : 'deslizable'}
      ref={raiz}
    >
      <button
        type="button"
        class="deslizable__accion"
        style={{ width: `${ANCHO}px` }}
        aria-label={etiquetaAccion}
        tabIndex={abierta ? 0 : -1}
        aria-hidden={!abierta}
        onClick={alPulsar}
      >
        {accion}
      </button>
      <div
        class={arrastre === null ? 'deslizable__fila deslizable__fila--suelta' : 'deslizable__fila'}
        style={{ transform: `translateX(${desplazamiento}px)` }}
        onPointerDown={alBajar}
        onPointerMove={alMover}
        onPointerUp={alSoltar}
        onPointerCancel={alSoltar}
        onClickCapture={alTocar}
      >
        {children}
      </div>
    </div>
  );
}
