import { useMemo, useState } from 'preact/hooks';
import { buscar } from '../buscador.ts';
import { Icono } from '../componentes/Icono.tsx';
import { InfoProducto } from '../componentes/Producto.tsx';
import { NOMBRE_TIENDA } from '../estado.ts';
import { unidadDeComparacion } from '../formato.ts';
import type { ProductoApp } from '../tipos.ts';
import { guardar } from './estado.ts';
import { elegirProducto, noComprarEn, type Necesidad, type TiendaEquivalencia } from './modelo.ts';

const UNIDAD_TEXTO = { kg: '€/kg', l: '€/l', ud: '€/unidad', lavado: '€/lavado', m: '€/metro' };

/** Buscador para elegir qué producto de una tienda corresponde a una necesidad. */
export function ElegirProducto({
  necesidad,
  tienda,
  productos,
  buscarProducto,
}: {
  necesidad: Necesidad;
  tienda: Exclude<TiendaEquivalencia, 'lidl'>;
  productos: ProductoApp[];
  buscarProducto: (tienda: TiendaEquivalencia, id: string) => ProductoApp | undefined;
}) {
  const [consulta, setConsulta] = useState(necesidad.nombre);
  const [fallo, setFallo] = useState<string | null>(null);
  const nombreTienda = NOMBRE_TIENDA[tienda];
  const unidad = unidadDeComparacion(necesidad.unidad);
  const volver = `necesidades/${necesidad.id}`;
  const elegidoAhora = necesidad.equivalencias?.[tienda];
  const idElegido = elegidoAhora && 'id' in elegidoAhora ? elegidoAhora.id : null;

  // Códigos de barras de lo elegido en otras tiendas, para sugerir el mismo producto.
  const eans = useMemo(() => {
    const codigos = new Set<string>();
    for (const [otra, e] of Object.entries(necesidad.equivalencias ?? {})) {
      if (otra === tienda || !e || !('id' in e)) continue;
      const ean = buscarProducto(otra as TiendaEquivalencia, e.id)?.ean;
      if (ean) codigos.add(ean);
    }
    return codigos;
  }, [necesidad, tienda, buscarProducto]);

  const resultado = useMemo(
    () => buscar(productos, { consulta, tienda, unidad, eans }),
    [productos, consulta, tienda, unidad, eans],
  );

  const guardarYVolver = async (nueva: Necesidad) => {
    try {
      await guardar(nueva);
      location.hash = volver;
    } catch (error) {
      setFallo(`No se ha podido guardar (${error instanceof Error ? error.message : error}).`);
    }
  };
  const elegir = (p: ProductoApp) =>
    void guardarYVolver(elegirProducto(necesidad, tienda, p.id, new Date().toISOString()));

  const fila = (p: ProductoApp, comparable: boolean) => (
    <li key={p.id}>
      <button
        type="button"
        class={
          p.id === idElegido
            ? 'producto producto--boton producto--elegido'
            : 'producto producto--boton'
        }
        onClick={() => elegir(p)}
      >
        <InfoProducto producto={p} comparable={comparable} />
      </button>
    </li>
  );

  const hayResultados =
    resultado.mismoCodigo.length + resultado.comparables.length + resultado.otros.length > 0;

  return (
    <>
      <a class="volver" href={`#${volver}`}>
        ‹ {necesidad.nombre}
      </a>
      <h1>Elegir en {nombreTienda}</h1>
      <div class="buscador">
        <Icono nombre="buscar" tamano={20} />
        <input
          class="entrada entrada--busqueda"
          type="search"
          enterkeyhint="search"
          autocomplete="off"
          aria-label={`Buscar en ${nombreTienda}`}
          placeholder={`Buscar en ${nombreTienda}`}
          value={consulta}
          onInput={(e) => setConsulta(e.currentTarget.value)}
        />
      </div>
      <p class="secundario">
        {hayResultados
          ? `Ordenado por ${UNIDAD_TEXTO[unidad]}, del más barato al más caro. Toca uno para elegirlo.`
          : consulta.trim()
            ? 'No hay productos con esas palabras. Prueba con menos palabras o con otras.'
            : 'Escribe qué buscas, por ejemplo «leche semidesnatada».'}
      </p>
      {fallo && (
        <p class="aviso aviso--error" role="alert">
          <Icono nombre="alerta" tamano={20} />
          <span>{fallo}</span>
        </p>
      )}

      {resultado.mismoCodigo.length > 0 && (
        <>
          <h2 class="grupo__titulo">Mismo producto que en la otra tienda</h2>
          <ul class="filas tarjeta tarjeta--lista">
            {resultado.mismoCodigo.map((p) => fila(p, p.formato.unidad === unidad))}
          </ul>
        </>
      )}
      {resultado.comparables.length > 0 && (
        <ul class="filas tarjeta tarjeta--lista">
          {resultado.comparables.map((p) => fila(p, true))}
        </ul>
      )}
      {resultado.otros.length > 0 && (
        <>
          <h2 class="grupo__titulo grupo__titulo--separado">
            Con otra unidad (no se pueden comparar)
          </h2>
          <ul class="filas tarjeta tarjeta--lista">{resultado.otros.map((p) => fila(p, false))}</ul>
        </>
      )}
      {resultado.total >
        resultado.comparables.length + resultado.otros.length + resultado.mismoCodigo.length && (
        <p class="secundario">
          Hay {resultado.total} productos con esas palabras. Escribe alguna más para afinar.
        </p>
      )}

      <div class="acciones">
        <button
          type="button"
          class="boton boton--ancho"
          onClick={() =>
            void guardarYVolver(noComprarEn(necesidad, tienda, new Date().toISOString()))
          }
        >
          No lo compro en {nombreTienda}
        </button>
      </div>
    </>
  );
}
