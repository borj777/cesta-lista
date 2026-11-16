import { useMemo, useState } from 'preact/hooks';
import { buscar } from '../buscador.ts';
import { Icono } from '../componentes/Icono.tsx';
import { InfoProducto } from '../componentes/Producto.tsx';
import { NOMBRE_TIENDA } from '../estado.ts';
import { unidadDeComparacion } from '../formato.ts';
import { useLidl } from '../lidl/estado.ts';
import { notaLidl } from '../lidl/PantallaLidl.tsx';
import type { ProductoApp } from '../tipos.ts';
import { guardar } from './estado.ts';
import { elegirProducto, noComprarEn, type Necesidad, type TiendaEquivalencia } from './modelo.ts';

const UNIDAD_TEXTO = { kg: '€/kg', l: '€/l', ud: '€/unidad', lavado: '€/lavado', m: '€/metro' };

/**
 * Buscador para elegir qué producto de una tienda corresponde a una necesidad. En Lidl busca
 * entre los precios apuntados a mano y permite añadir uno nuevo.
 */
export function ElegirProducto({
  necesidad,
  tienda,
  productos,
  buscarProducto,
}: {
  necesidad: Necesidad;
  tienda: TiendaEquivalencia;
  productos: ProductoApp[];
  buscarProducto: (tienda: TiendaEquivalencia, id: string) => ProductoApp | undefined;
}) {
  const [consulta, setConsulta] = useState(necesidad.nombre);
  const esLidl = tienda === 'lidl';
  const { productos: lidl } = useLidl();
  const lidlPorId = useMemo(() => new Map((lidl ?? []).map((p) => [p.id, p])), [lidl]);
  const ahora = new Date();
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
    () => buscar(productos, { consulta, tienda, unidad, eans, todosSiVacia: esLidl }),
    [productos, consulta, tienda, unidad, eans, esLidl],
  );
  // En Lidl hay pocos productos: si la búsqueda no encuentra nada, se enseñan todos.
  const todosLidl = useMemo(
    () =>
      esLidl
        ? buscar(productos, { consulta: '', tienda, unidad, todosSiVacia: true, limite: 500 })
        : null,
    [esLidl, productos, tienda, unidad],
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

  const fila = (p: ProductoApp, comparable: boolean) => {
    const apuntado = esLidl ? lidlPorId.get(p.id) : undefined;
    return (
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
          <InfoProducto
            producto={p}
            comparable={comparable}
            nota={apuntado ? notaLidl(apuntado, ahora) : undefined}
          />
        </button>
      </li>
    );
  };

  const hayResultados =
    resultado.mismoCodigo.length + resultado.comparables.length + resultado.otros.length > 0;
  const mostrarTodosLidl =
    todosLidl !== null &&
    !hayResultados &&
    todosLidl.comparables.length + todosLidl.otros.length > 0;
  const anadirLidl = (
    <button
      type="button"
      class={
        hayResultados || mostrarTodosLidl
          ? 'boton boton--ancho'
          : 'boton boton--principal boton--ancho'
      }
      onClick={() => {
        location.hash = `lidl/nuevo/${necesidad.id}`;
      }}
    >
      Añadir un producto de Lidl
    </button>
  );

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
        {esLidl && productos.length === 0
          ? 'Todavía no has apuntado ningún precio de Lidl. Añade el producto que compras allí con su formato y su precio.'
          : hayResultados
            ? `Ordenado por ${UNIDAD_TEXTO[unidad]}, del más barato al más caro. Toca uno para elegirlo.`
            : consulta.trim()
              ? esLidl
                ? 'Ninguno de tus productos de Lidl tiene esas palabras.'
                : 'No hay productos con esas palabras. Prueba con menos palabras o con otras.'
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

      {mostrarTodosLidl && todosLidl && (
        <>
          <h2 class="grupo__titulo grupo__titulo--separado">Todos tus productos de Lidl</h2>
          <ul class="filas tarjeta tarjeta--lista">
            {todosLidl.comparables.map((p) => fila(p, true))}
            {todosLidl.otros.map((p) => fila(p, false))}
          </ul>
        </>
      )}

      <div class="acciones">
        {esLidl && anadirLidl}
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
