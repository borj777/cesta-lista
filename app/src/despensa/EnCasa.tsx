import { useState } from 'preact/hooks';
import { Icono } from '../componentes/Icono.tsx';
import { Opciones } from '../componentes/Opciones.tsx';
import { hoyEnEspana } from '../formato.ts';
import { consumoSemanal } from '../lista/compra.ts';
import { unidadesCompatibles } from '../menu/recetas.ts';
import { guardar } from '../necesidades/estado.ts';
import {
  leerCantidad,
  OPCIONES_UNIDAD,
  type Necesidad,
  type UnidadNecesidad,
} from '../necesidades/modelo.ts';
import {
  aComparacion,
  cantidadPoco,
  corregirDespensa,
  estadoDespensa,
  textoDespensa,
} from './despensa.ts';

/**
 * Lo que queda en casa de una necesidad, con correcciones de un toque. `conMenu` es la
 * necesidad con el menú sumado (para saber lo que se gasta); se guarda sobre `necesidad`.
 */
export function EnCasa({ necesidad, conMenu }: { necesidad: Necesidad; conMenu: Necesidad }) {
  const [escribiendo, setEscribiendo] = useState(false);
  const [cantidadTexto, setCantidadTexto] = useState('');
  const [unidad, setUnidad] = useState<UnidadNecesidad>(necesidad.unidad);
  const [error, setError] = useState<string | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const hoy = hoyEnEspana();
  const semanal = consumoSemanal(conMenu);
  const estado = estadoDespensa(conMenu, semanal, hoy);
  const lleno = necesidad.despensa?.lleno;
  const unidades = unidadesCompatibles(necesidad.unidad);

  const corregir = (cantidad: number) => {
    setFallo(null);
    guardar(corregirDespensa(necesidad, cantidad, hoy, new Date().toISOString()))
      .then(() => setEscribiendo(false))
      .catch((e: unknown) =>
        setFallo(`No se ha podido guardar (${e instanceof Error ? e.message : String(e)}).`),
      );
  };

  return (
    <section class="tarjeta en-casa">
      <h3 class="tienda__titulo">
        <Icono nombre="casa" tamano={20} /> En casa
      </h3>
      <p class={estado.tipo === 'acabado' ? 'texto--atencion' : 'secundario'}>
        {textoDespensa(conMenu, estado)}
      </p>
      {estado.tipo !== 'desconocido' && (
        <p class="secundario en-casa__nota">
          Es una estimación según lo que gastas. Corrígela si no cuadra.
        </p>
      )}
      {fallo && (
        <p class="aviso aviso--error" role="alert">
          <Icono nombre="alerta" tamano={20} />
          <span>{fallo}</span>
        </p>
      )}
      {escribiendo ? (
        <>
          <div class="campo">
            <label class="campo__etiqueta" for="tengo">
              Cuánto tienes
            </label>
            <input
              id="tengo"
              class={error ? 'entrada entrada--error' : 'entrada'}
              type="text"
              inputmode="decimal"
              autocomplete="off"
              placeholder="500"
              value={cantidadTexto}
              onInput={(e) => {
                setCantidadTexto(e.currentTarget.value);
                setError(null);
              }}
            />
            {error && <p class="campo__error">{error}</p>}
          </div>
          {unidades.length > 1 && (
            <Opciones
              nombre="unidad-tengo"
              etiqueta="Unidad"
              opciones={OPCIONES_UNIDAD.filter((o) => unidades.includes(o.valor))}
              valor={unidad}
              alCambiar={setUnidad}
            />
          )}
          <div class="acciones acciones--fila">
            <button
              type="button"
              class="boton boton--principal"
              onClick={() => {
                const cantidad = cantidadTexto.trim() === '0' ? 0 : leerCantidad(cantidadTexto);
                if (cantidad === null) {
                  setError('Escribe cuánto tienes, por ejemplo 500.');
                  return;
                }
                corregir(aComparacion(cantidad, unidad));
              }}
            >
              Guardar
            </button>
            <button type="button" class="boton" onClick={() => setEscribiendo(false)}>
              Cancelar
            </button>
          </div>
        </>
      ) : (
        <div class="en-casa__botones">
          <button type="button" class="boton boton--pequeno" onClick={() => corregir(0)}>
            Se ha acabado
          </button>
          {semanal > 0 && (
            <button
              type="button"
              class="boton boton--pequeno"
              onClick={() => corregir(cantidadPoco(semanal))}
            >
              Queda poco
            </button>
          )}
          {lleno !== undefined && lleno > 0 && (
            <button type="button" class="boton boton--pequeno" onClick={() => corregir(lleno / 2)}>
              Queda la mitad
            </button>
          )}
          <button
            type="button"
            class="boton boton--pequeno"
            onClick={() => {
              setCantidadTexto('');
              setEscribiendo(true);
            }}
          >
            Tengo…
          </button>
        </div>
      )}
    </section>
  );
}
