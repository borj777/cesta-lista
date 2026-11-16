/** Grupo de botones grandes para elegir una opción (más cómodo con el pulgar que un menú). */
export function Opciones<T extends string>({
  nombre,
  etiqueta,
  opciones,
  valor,
  alCambiar,
  columnas = 2,
}: {
  nombre: string;
  etiqueta: string;
  opciones: readonly { valor: T; texto: string }[];
  valor: T;
  alCambiar: (valor: T) => void;
  columnas?: number;
}) {
  return (
    <fieldset class="campo">
      <legend class="campo__etiqueta">{etiqueta}</legend>
      <div class="opciones" style={{ gridTemplateColumns: `repeat(${columnas}, minmax(0, 1fr))` }}>
        {opciones.map((o) => (
          <label key={o.valor} class={o.valor === valor ? 'opcion opcion--elegida' : 'opcion'}>
            <input
              type="radio"
              name={nombre}
              value={o.valor}
              checked={o.valor === valor}
              onChange={() => alCambiar(o.valor)}
            />
            <span>{o.texto}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
