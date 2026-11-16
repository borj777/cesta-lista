import {
  guardarAjustesCompra,
  NOMBRE_PERIODO,
  PERIODOS,
  useAjustesCompra,
  type Periodo,
} from '../ajustes.ts';
import { Opciones } from './Opciones.tsx';

const OPCIONES_PERIODO = PERIODOS.map((p) => ({ valor: p, texto: NOMBRE_PERIODO[p] }));
const COSTES = ['0', '1', '2', '3', '5'] as const;
const OPCIONES_COSTE = COSTES.map((c) => ({ valor: c, texto: `${c} €` }));

/** Ajustes → Cómo haces la compra: periodo y coste de ir a una tienda más. */
export function AjustesCompra() {
  const ajustes = useAjustesCompra();
  if (!ajustes) return null;
  const coste = String(ajustes.costeVisita);
  return (
    <section class="tarjeta">
      <h2>Cómo haces la compra</h2>
      <Opciones
        nombre="periodo"
        etiqueta="Compras para"
        opciones={OPCIONES_PERIODO}
        valor={ajustes.periodo}
        alCambiar={(periodo: Periodo) => void guardarAjustesCompra({ periodo })}
        columnas={3}
      />
      <Opciones
        nombre="coste-visita"
        etiqueta="Ir a una tienda más te compensa si ahorras más de"
        opciones={
          COSTES.includes(coste as (typeof COSTES)[number])
            ? OPCIONES_COSTE
            : [...OPCIONES_COSTE, { valor: coste, texto: `${coste} €` }]
        }
        valor={coste}
        alCambiar={(valor: string) => void guardarAjustesCompra({ costeVisita: Number(valor) })}
        columnas={5}
      />
      <p class="secundario">
        Es lo que vale para ti el tiempo y el desplazamiento de ir a otra tienda. Con 0 €, cada cosa
        se compra donde sea más barata; cuanto más alto, más se junta la compra en menos tiendas.
      </p>
    </section>
  );
}
