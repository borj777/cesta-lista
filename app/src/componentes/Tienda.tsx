import type { InfoTienda } from '../tiendas/modelo.ts';

/** Punto de color que identifica una tienda. */
export function Punto({ color }: { color: string }) {
  return <span class="punto" style={{ background: color }} aria-hidden="true" />;
}

/** Punto y nombre de una tienda. */
export function NombreTienda({ tienda }: { tienda: InfoTienda }) {
  return (
    <>
      <Punto color={tienda.color} /> {tienda.nombre}
    </>
  );
}

/** Interruptor de encendido y apagado, al estilo del iPhone. */
export function Interruptor({
  id,
  etiqueta,
  detalle,
  encendido,
  alCambiar,
}: {
  id: string;
  etiqueta: string;
  detalle?: string;
  encendido: boolean;
  alCambiar: (encendido: boolean) => void;
}) {
  return (
    <label class="interruptor" for={id}>
      <span class="interruptor__texto">
        <span>{etiqueta}</span>
        {detalle && <span class="secundario">{detalle}</span>}
      </span>
      <input
        id={id}
        type="checkbox"
        role="switch"
        class="interruptor__control"
        checked={encendido}
        onChange={(e) => alCambiar(e.currentTarget.checked)}
      />
    </label>
  );
}
