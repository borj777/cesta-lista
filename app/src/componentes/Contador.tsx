/** Botones − y + para un número pequeño. */
export function Contador({
  valor,
  min = 1,
  max,
  etiqueta,
  alCambiar,
}: {
  valor: number;
  min?: number;
  max: number;
  etiqueta: string;
  alCambiar: (v: number) => void;
}) {
  return (
    <div class="contador">
      <span class="contador__etiqueta">{etiqueta}</span>
      <button
        type="button"
        class="contador__boton"
        aria-label={`${etiqueta}: uno menos`}
        disabled={valor <= min}
        onClick={() => alCambiar(valor - 1)}
      >
        −
      </button>
      <span class="contador__valor" aria-live="polite">
        {valor}
      </span>
      <button
        type="button"
        class="contador__boton"
        aria-label={`${etiqueta}: uno más`}
        disabled={valor >= max}
        onClick={() => alCambiar(valor + 1)}
      >
        +
      </button>
    </div>
  );
}
