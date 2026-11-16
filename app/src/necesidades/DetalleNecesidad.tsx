import { useState } from 'preact/hooks';
import { Icono } from '../componentes/Icono.tsx';
import { InfoProducto } from '../componentes/Producto.tsx';
import { NOMBRE_TIENDA } from '../estado.ts';
import { unidadDeComparacion } from '../formato.ts';
import { useLidl } from '../lidl/estado.ts';
import { notaLidl } from '../lidl/PantallaLidl.tsx';
import { precioAntiguo } from '../lidl/modelo.ts';
import type { ProductoApp } from '../tipos.ts';
import { guardar } from './estado.ts';
import {
  estadoEquivalencia,
  NOMBRE_CATEGORIA,
  noComprarEn,
  quitarEquivalencia,
  textoNecesidad,
  TIENDAS_EQUIVALENCIA,
  type Necesidad,
  type TiendaEquivalencia,
} from './modelo.ts';

const ir = (ruta: string) => {
  location.hash = ruta;
};

/** Detalle de una necesidad: el producto elegido en cada tienda. */
export function DetalleNecesidad({
  necesidad,
  buscarProducto,
}: {
  necesidad: Necesidad;
  buscarProducto: ((tienda: TiendaEquivalencia, id: string) => ProductoApp | undefined) | null;
}) {
  const [fallo, setFallo] = useState<string | null>(null);
  const { productos: lidl } = useLidl();
  const hoy = new Date();
  const cambiar = async (nueva: Necesidad) => {
    try {
      setFallo(null);
      await guardar(nueva);
    } catch (error) {
      setFallo(`No se ha podido guardar (${error instanceof Error ? error.message : error}).`);
    }
  };
  const ahora = () => new Date().toISOString();

  return (
    <>
      <a class="volver" href="#necesidades">
        ‹ Mis necesidades
      </a>
      <h1>{necesidad.nombre}</h1>
      <p class="secundario">
        {textoNecesidad(necesidad)} · {NOMBRE_CATEGORIA[necesidad.categoria]}
        {necesidad.notas ? ` · ${necesidad.notas}` : ''}
      </p>
      <a class="boton boton--ancho" href={`#necesidades/${necesidad.id}/editar`}>
        Editar cantidad y frecuencia
      </a>

      <h2 class="grupo__titulo grupo__titulo--separado">Qué compras en cada tienda</h2>
      {fallo && (
        <p class="aviso aviso--error" role="alert">
          <Icono nombre="alerta" tamano={20} />
          <span>{fallo}</span>
        </p>
      )}
      {!buscarProducto && <p class="secundario">Cargando precios…</p>}
      {buscarProducto &&
        TIENDAS_EQUIVALENCIA.map((tienda) => {
          const nombre = NOMBRE_TIENDA[tienda];
          const elegir = `#necesidades/${necesidad.id}/elegir/${tienda}`;
          const estado = estadoEquivalencia(necesidad, tienda, buscarProducto);
          const precioLidl =
            tienda === 'lidl' && estado.tipo === 'elegido'
              ? lidl?.find((p) => p.id === estado.producto.id)
              : undefined;
          return (
            <section key={tienda} class="tarjeta tienda">
              <h3 class="tienda__titulo">
                <span class={`punto punto--${tienda}`} aria-hidden="true" /> {nombre}
              </h3>
              {estado.tipo === 'elegido' && (
                <>
                  <div class="producto">
                    <InfoProducto
                      producto={estado.producto}
                      comparable={
                        estado.producto.formato.unidad === unidadDeComparacion(necesidad.unidad)
                      }
                      nota={precioLidl ? notaLidl(precioLidl, hoy) : undefined}
                    />
                  </div>
                  {precioLidl && precioAntiguo(precioLidl, hoy) && (
                    <a class="boton boton--ancho" href={`#lidl/${precioLidl.id}`}>
                      Actualizar el precio de Lidl
                    </a>
                  )}
                  {estado.producto.formato.unidad !== unidadDeComparacion(necesidad.unidad) && (
                    <p class="aviso aviso--atencion">
                      <Icono nombre="alerta" tamano={20} />
                      <span>
                        Este producto se vende por otra unidad que tu necesidad: no se podrá
                        comparar su precio por unidad con las otras tiendas.
                      </span>
                    </p>
                  )}
                  <div class="acciones acciones--fila">
                    <a class="boton" href={elegir}>
                      Cambiar
                    </a>
                    <button
                      type="button"
                      class="boton"
                      onClick={() => void cambiar(quitarEquivalencia(necesidad, tienda, ahora()))}
                    >
                      Quitar
                    </button>
                  </div>
                </>
              )}
              {estado.tipo === 'desaparecido' && (
                <>
                  <p class="aviso aviso--atencion">
                    <Icono nombre="alerta" tamano={20} />
                    <span>
                      {tienda === 'lidl'
                        ? 'Has borrado de tus precios de Lidl el producto que elegiste. Elige otro.'
                        : `El producto que elegiste ya no está en ${nombre}. Elige otro: no se cambia solo por uno que se llame igual.`}
                    </span>
                  </p>
                  <a class="boton boton--principal boton--ancho" href={elegir}>
                    Elegir otro en {nombre}
                  </a>
                </>
              )}
              {estado.tipo === 'no-compro' && (
                <div class="tienda__no-compro">
                  <span class="secundario">No lo compras en {nombre}.</span>
                  <button
                    type="button"
                    class="boton boton--pequeno"
                    onClick={() => void cambiar(quitarEquivalencia(necesidad, tienda, ahora()))}
                  >
                    Deshacer
                  </button>
                </div>
              )}
              {estado.tipo === 'sin-elegir' && (
                <div class="acciones">
                  <button
                    type="button"
                    class="boton boton--principal boton--ancho"
                    onClick={() => ir(elegir.slice(1))}
                  >
                    Elegir en {nombre}
                  </button>
                  <button
                    type="button"
                    class="boton boton--ancho"
                    onClick={() => void cambiar(noComprarEn(necesidad, tienda, ahora()))}
                  >
                    No lo compro en {nombre}
                  </button>
                </div>
              )}
            </section>
          );
        })}
    </>
  );
}
