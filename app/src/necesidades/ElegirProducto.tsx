import { useMemo, useState } from 'preact/hooks';
import { buscar } from '../buscador.ts';
import { Icono } from '../componentes/Icono.tsx';
import { InfoProducto } from '../componentes/Producto.tsx';
import { unidadDeComparacion } from '../formato.ts';
import { useTiendas } from '../tiendas/estado.ts';
import type { IdTienda, InfoTienda } from '../tiendas/modelo.ts';
import { notaPrecio } from '../tiendas/productos.ts';
import type { ProductoApp } from '../tipos.ts';
import { guardar } from './estado.ts';
import { elegirProducto, noComprarEn, type Necesidad } from './modelo.ts';

const UNIDAD_TEXTO = { kg: '€/kg', l: '€/l', ud: '€/unidad', lavado: '€/lavado', m: '€/metro' };

/**
 * Buscador para elegir qué producto de una tienda corresponde a una necesidad. En las tiendas
 * propias busca entre los precios apuntados a mano y permite añadir uno nuevo.
 */
export function ElegirProducto({
  necesidad,
  info,
  productos,
  buscarProducto,
}: {
  necesidad: Necesidad;
  info: InfoTienda;
  productos: ProductoApp[];
  buscarProducto: (tienda: IdTienda, id: string) => ProductoApp | undefined;
}) {
  const tienda = info.id;
  const [consulta, setConsulta] = useState(necesidad.nombre);
  const esPropia = !info.automatica;
  const { productos: propios } = useTiendas();
  const propiosPorId = useMemo(() => new Map((propios ?? []).map((p) => [p.id, p])), [propios]);
  const ahora = new Date();
  const [fallo, setFallo] = useState<string | null>(null);
  const nombreTienda = info.nombre;
  const unidad = unidadDeComparacion(necesidad.unidad);
  const volver = `necesidades/${necesidad.id}`;
  const elegidoAhora = necesidad.equivalencias?.[tienda];
  const idElegido = elegidoAhora && 'id' in elegidoAhora ? elegidoAhora.id : null;

  // Códigos de barras de lo elegido en otras tiendas, para sugerir el mismo producto.
  const eans = useMemo(() => {
    const codigos = new Set<string>();
    for (const [otra, e] of Object.entries(necesidad.equivalencias ?? {})) {
      if (otra === tienda || !e || !('id' in e)) continue;
      const ean = buscarProducto(otra, e.id)?.ean;
      if (ean) codigos.add(ean);
    }
    return codigos;
  }, [necesidad, tienda, buscarProducto]);

  const resultado = useMemo(
    () => buscar(productos, { consulta, tienda, unidad, eans, todosSiVacia: esPropia }),
    [productos, consulta, tienda, unidad, eans, esPropia],
  );
  // En las tiendas propias hay pocos productos: si la búsqueda no encuentra nada, salen todos.
  const todosPropios = useMemo(
    () =>
      esPropia
        ? buscar(productos, { consulta: '', tienda, unidad, todosSiVacia: true, limite: 500 })
        : null,
    [esPropia, productos, tienda, unidad],
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
    const apuntado = esPropia ? propiosPorId.get(p.id) : undefined;
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
            nota={apuntado ? notaPrecio(apuntado, ahora) : undefined}
          />
        </button>
      </li>
    );
  };

  const hayResultados =
    resultado.mismoCodigo.length + resultado.comparables.length + resultado.otros.length > 0;
  const mostrarTodos =
    todosPropios !== null &&
    !hayResultados &&
    todosPropios.comparables.length + todosPropios.otros.length > 0;
  const anadirPropio = (
    <button
      type="button"
      class={
        hayResultados || mostrarTodos ? 'boton boton--ancho' : 'boton boton--principal boton--ancho'
      }
      onClick={() => {
        location.hash = `tiendas/${tienda}/nuevo/${necesidad.id}`;
      }}
    >
      Añadir un producto de {nombreTienda}
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
        {esPropia && !productos.some((p) => p.tienda === tienda)
          ? `Todavía no has apuntado ningún precio de ${nombreTienda}. Añade el producto que compras allí con su formato y su precio.`
          : hayResultados
            ? `Ordenado por ${UNIDAD_TEXTO[unidad]}, del más barato al más caro. Toca uno para elegirlo.`
            : consulta.trim()
              ? esPropia
                ? `Ninguno de tus productos de ${nombreTienda} tiene esas palabras.`
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

      {mostrarTodos && todosPropios && (
        <>
          <h2 class="grupo__titulo grupo__titulo--separado">
            Todos tus productos de {nombreTienda}
          </h2>
          <ul class="filas tarjeta tarjeta--lista">
            {todosPropios.comparables.map((p) => fila(p, true))}
            {todosPropios.otros.map((p) => fila(p, false))}
          </ul>
        </>
      )}

      <div class="acciones">
        {esPropia && anadirPropio}
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
