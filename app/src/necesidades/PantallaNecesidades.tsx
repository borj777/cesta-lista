import { useState } from 'preact/hooks';
import { useCatalogo } from '../catalogo.ts';
import { Deslizable } from '../componentes/Deslizable.tsx';
import { Icono } from '../componentes/Icono.tsx';
import { Opciones } from '../componentes/Opciones.tsx';
import { Punto } from '../componentes/Tienda.tsx';
import { useRecetas } from '../menu/estado.ts';
import { aportesDelMenu, textoConMenu } from '../menu/menu.ts';
import { recetasCon } from '../menu/recetas.ts';
import { useTiendas } from '../tiendas/estado.ts';
import type { IdTienda, InfoTienda } from '../tiendas/modelo.ts';
import type { DatosApp, ProductoApp } from '../tipos.ts';
import { hoyEnEspana } from '../formato.ts';
import { ofertasDe } from '../tiendas/ofertas.ts';
import { VistaDespensa } from '../despensa/PantallaDespensa.tsx';
import { DetalleNecesidad } from './DetalleNecesidad.tsx';
import { ElegirEnTodas } from '../ingredientes/ElegirPorMi.tsx';
import { ElegirProducto } from './ElegirProducto.tsx';
import { borrar, guardar, useNecesidades } from './estado.ts';
import {
  agruparPorCategoria,
  CATEGORIAS,
  crearNecesidad,
  editarNecesidad,
  escribirCantidad,
  FRECUENCIAS,
  leerCantidad,
  NOMBRE_CATEGORIA,
  OPCIONES_UNIDAD,
  textoNecesidad,
  validarBorrador,
  type Categoria,
  type ErroresBorrador,
  type Frecuencia,
  type Necesidad,
  type UnidadNecesidad,
} from './modelo.ts';

const ir = (ruta: string) => {
  location.hash = ruta;
};

/**
 * Rutas: #necesidades, #necesidades/nueva, #necesidades/<id>, #necesidades/<id>/editar y
 * #necesidades/<id>/elegir/<tienda>, #necesidades/en-casa (la despensa) y #necesidades/<id>/casa
 * (la ficha abierta desde la despensa, que vuelve a ella).
 */
export function PantallaNecesidades({
  sub,
  datos,
}: {
  sub: string | null;
  datos: DatosApp | null;
}) {
  const { necesidades, error } = useNecesidades();
  const { productosPropios, buscarProducto } = useCatalogo(datos);
  const { lista: tiendas } = useTiendas();

  if (error) {
    return (
      <>
        <h1>Mis necesidades</h1>
        <p class="aviso aviso--error" role="alert">
          <Icono nombre="alerta" tamano={20} />
          <span>{error}</span>
        </p>
      </>
    );
  }
  if (necesidades === null) return <h1>Mis necesidades</h1>;

  if (sub === 'nueva') return <FormNecesidad key="nueva" />;
  if (sub === 'en-casa') return <VistaDespensa />;
  if (sub) {
    const [id, accion, tienda] = sub.split('/');
    const existente = necesidades.find((n) => n.id === id);
    if (existente && accion === 'editar') {
      return <FormNecesidad key={existente.id} existente={existente} />;
    }
    const info = tiendas?.find((t) => t.id === tienda);
    if (existente && accion === 'elegir' && (info || !tiendas)) {
      if (!datos || !productosPropios || !buscarProducto || !info) {
        return <p class="secundario">Cargando precios…</p>;
      }
      return (
        <ElegirProducto
          key={`${existente.id}-${info.id}`}
          necesidad={existente}
          info={info}
          productos={info.automatica ? datos.productos : productosPropios}
          ofertas={info.automatica ? [] : ofertasDe(datos, info.id, hoyEnEspana())}
          buscarProducto={buscarProducto}
        />
      );
    }
    if (existente)
      return (
        <DetalleNecesidad
          necesidad={existente}
          datos={datos}
          buscarProducto={buscarProducto}
          tiendas={tiendas}
          desdeCasa={accion === 'casa'}
        />
      );
  }
  return (
    <ListaNecesidades
      necesidades={necesidades}
      tiendas={tiendas ?? []}
      datos={datos}
      buscarProducto={buscarProducto}
    />
  );
}

/** Puntos de color de las tiendas encendidas con producto elegido, o «Sin elegir». */
function TiendasElegidas({ necesidad, tiendas }: { necesidad: Necesidad; tiendas: InfoTienda[] }) {
  const e = necesidad.equivalencias ?? {};
  const activas = tiendas.filter((t) => t.activa);
  const elegidas = activas.filter((t) => {
    const x = e[t.id];
    return (x && 'id' in x) || necesidad.ofertas?.[t.id];
  });
  const decididas = activas.filter((t) => e[t.id] || necesidad.ofertas?.[t.id]).length;
  if (decididas === 0) return <span class="sin-elegir">Sin elegir</span>;
  if (elegidas.length === 0) return <span class="sin-elegir">No lo compras</span>;
  return (
    <span
      class="puntos"
      aria-label={
        elegidas.length === 1 ? 'Elegido en 1 tienda' : `Elegido en ${elegidas.length} tiendas`
      }
    >
      {elegidas.map((t) => (
        <Punto key={t.id} color={t.color} />
      ))}
    </span>
  );
}

function ListaNecesidades({
  necesidades,
  tiendas,
  datos,
  buscarProducto,
}: {
  necesidades: Necesidad[];
  tiendas: InfoTienda[];
  datos: DatosApp | null;
  buscarProducto: ((tienda: IdTienda, id: string) => ProductoApp | undefined) | null;
}) {
  const { recetas, menu } = useRecetas();
  const aportes = aportesDelMenu(menu, recetas ?? [], necesidades);
  /** Fila deslizada que enseña «Borrar» (solo una a la vez). */
  const [abierta, setAbierta] = useState<string | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const alBorrar = async (n: Necesidad) => {
    const usadaEn = recetas ? recetasCon(recetas, n.id) : [];
    const aviso =
      usadaEn.length > 0
        ? `\n\nSe quitará también de tus recetas: ${usadaEn.map((r) => r.nombre).join(', ')}.`
        : '';
    if (!confirm(`¿Borrar «${n.nombre}» de tus necesidades?${aviso}`)) return;
    setAbierta(null);
    try {
      await borrar(n.id);
      setFallo(null);
    } catch (error) {
      setFallo(`No se ha podido borrar (${error instanceof Error ? error.message : error}).`);
    }
  };
  if (necesidades.length === 0) {
    return (
      <>
        <h1>Mis necesidades</h1>
        <section class="tarjeta">
          <h2>Apunta lo que compras</h2>
          <p class="secundario">
            Añade cada cosa con la cantidad que gastáis y cada cuánto. Por ejemplo: pechuga de
            pollo, 1,5 kg a la semana; detergente, 50 lavados al mes.
          </p>
          <button
            type="button"
            class="boton boton--principal boton--ancho"
            onClick={() => ir('necesidades/nueva')}
          >
            Añadir la primera
          </button>
        </section>
      </>
    );
  }

  return (
    <>
      <h1>Mis necesidades</h1>
      <p class="secundario">
        {necesidades.length === 1 ? '1 cosa apuntada' : `${necesidades.length} cosas apuntadas`}.
        Desliza una hacia la izquierda para borrarla.
      </p>
      {fallo && (
        <p class="aviso aviso--error" role="alert">
          {fallo}
        </p>
      )}
      <a class="boton boton--ancho" href="#necesidades/en-casa">
        <Icono nombre="casa" tamano={20} /> Lo que tienes en casa
      </a>
      {datos && buscarProducto && (
        <ElegirEnTodas necesidades={necesidades} datos={datos} buscarProducto={buscarProducto} />
      )}
      {agruparPorCategoria(necesidades).map((grupo) => (
        <section key={grupo.categoria} class="grupo">
          <h2 class="grupo__titulo">{NOMBRE_CATEGORIA[grupo.categoria]}</h2>
          <ul class="filas tarjeta tarjeta--lista tarjeta--deslizable">
            {grupo.necesidades.map((n) => (
              <li key={n.id}>
                <Deslizable
                  abierta={abierta === n.id}
                  alCambiar={(si) => setAbierta((a) => (si ? n.id : a === n.id ? null : a))}
                  accion="Borrar"
                  etiquetaAccion={`Borrar ${n.nombre}`}
                  alPulsar={() => void alBorrar(n)}
                >
                  <a class="fila fila--enlace" href={`#necesidades/${n.id}`} draggable={false}>
                    <div class="fila__texto">
                      <span>{n.nombre}</span>
                      <span class="secundario">{textoConMenu(n, aportes.get(n.id))}</span>
                    </div>
                    <TiendasElegidas necesidad={n} tiendas={tiendas} />
                    <span class="chevron" aria-hidden="true">
                      ›
                    </span>
                  </a>
                </Deslizable>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <button
        type="button"
        class="boton boton--principal boton--ancho"
        onClick={() => ir('necesidades/nueva')}
      >
        Añadir necesidad
      </button>
    </>
  );
}

const OPCIONES_CATEGORIA = CATEGORIAS.map((c) => ({ valor: c, texto: NOMBRE_CATEGORIA[c] }));
const OPCIONES_FRECUENCIA = FRECUENCIAS.map((f) => ({
  valor: f,
  texto: { semana: 'Cada semana', quincena: 'Cada 2 semanas', mes: 'Cada mes' }[f],
}));
function FormNecesidad({ existente }: { existente?: Necesidad }) {
  const [nombre, setNombre] = useState(existente?.nombre ?? '');
  const [categoria, setCategoria] = useState<Categoria>(existente?.categoria ?? 'alimentacion');
  const [cantidadTexto, setCantidadTexto] = useState(
    existente && !existente.soloRecetas ? escribirCantidad(existente.cantidad) : '',
  );
  const { recetas } = useRecetas();
  const usadaEn = existente && recetas ? recetasCon(recetas, existente.id) : [];
  // Una necesidad de recetas puede quedarse sin cantidad propia.
  const sinCantidadPropia = !!existente?.soloRecetas && !cantidadTexto.trim();
  const [unidad, setUnidad] = useState<UnidadNecesidad>(existente?.unidad ?? 'kg');
  const [frecuencia, setFrecuencia] = useState<Frecuencia>(existente?.frecuencia ?? 'semana');
  const [notas, setNotas] = useState(existente?.notas ?? '');
  const [errores, setErrores] = useState<ErroresBorrador>({});
  const [fallo, setFallo] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cantidad = leerCantidad(cantidadTexto);

  const alGuardar = async (evento: Event) => {
    evento.preventDefault();
    const nuevosErrores = validarBorrador({ nombre, cantidad: sinCantidadPropia ? 0 : cantidad });
    setErrores(nuevosErrores);
    if (Object.keys(nuevosErrores).length > 0 || (cantidad === null && !sinCantidadPropia)) return;
    setGuardando(true);
    setFallo(null);
    const borrador = {
      nombre,
      categoria,
      cantidad: sinCantidadPropia ? 0 : (cantidad ?? 0),
      unidad,
      frecuencia,
      notas,
    };
    const ahora = new Date().toISOString();
    try {
      const guardada = existente
        ? editarNecesidad(existente, borrador, ahora)
        : crearNecesidad(borrador, ahora, crypto.randomUUID());
      await guardar(guardada);
      // Tras crearla o editarla, se va a su ficha para elegir los productos de cada tienda.
      ir(`necesidades/${guardada.id}`);
    } catch (error) {
      setFallo(`No se ha podido guardar (${error instanceof Error ? error.message : error}).`);
      setGuardando(false);
    }
  };

  const alBorrar = async () => {
    const aviso =
      usadaEn.length > 0
        ? `\n\nSe quitará también de tus recetas: ${usadaEn.map((r) => r.nombre).join(', ')}.`
        : '';
    if (!existente || !confirm(`¿Borrar «${existente.nombre}» de tus necesidades?${aviso}`)) return;
    await borrar(existente.id);
    ir('necesidades');
  };

  return (
    <form onSubmit={alGuardar} noValidate>
      <a class="volver" href={existente ? `#necesidades/${existente.id}` : '#necesidades'}>
        ‹ {existente ? existente.nombre : 'Mis necesidades'}
      </a>
      <h1>{existente ? 'Editar necesidad' : 'Nueva necesidad'}</h1>

      <div class="campo">
        <label class="campo__etiqueta" for="nombre">
          Qué compras
        </label>
        <input
          id="nombre"
          class={errores.nombre ? 'entrada entrada--error' : 'entrada'}
          type="text"
          placeholder="Pechuga de pollo"
          autocomplete="off"
          enterkeyhint="next"
          value={nombre}
          onKeyDown={(e) => {
            // «Siguiente» en el teclado pasa a la cantidad en vez de guardar el formulario.
            if (e.key === 'Enter') {
              e.preventDefault();
              document.getElementById('cantidad')?.focus();
            }
          }}
          onInput={(e) => {
            setNombre(e.currentTarget.value);
            if (errores.nombre) setErrores({ ...errores, nombre: undefined });
          }}
        />
        {errores.nombre && <p class="campo__error">{errores.nombre}</p>}
      </div>

      <Opciones
        nombre="categoria"
        etiqueta="Categoría"
        opciones={OPCIONES_CATEGORIA}
        valor={categoria}
        alCambiar={setCategoria}
      />

      <div class="campo">
        <label class="campo__etiqueta" for="cantidad">
          {existente?.soloRecetas
            ? 'Cuánto gastáis aparte de las recetas (opcional)'
            : 'Cuánto gastáis'}
        </label>
        <input
          id="cantidad"
          class={errores.cantidad ? 'entrada entrada--error' : 'entrada'}
          type="text"
          inputmode="decimal"
          placeholder="1,5"
          autocomplete="off"
          value={cantidadTexto}
          onInput={(e) => {
            setCantidadTexto(e.currentTarget.value);
            if (errores.cantidad) setErrores({ ...errores, cantidad: undefined });
          }}
        />
        {errores.cantidad && <p class="campo__error">{errores.cantidad}</p>}
      </div>

      <Opciones
        nombre="unidad"
        etiqueta="Unidad"
        opciones={OPCIONES_UNIDAD}
        valor={unidad}
        alCambiar={setUnidad}
        columnas={4}
      />

      <Opciones
        nombre="frecuencia"
        etiqueta="Cada cuánto"
        opciones={OPCIONES_FRECUENCIA}
        valor={frecuencia}
        alCambiar={setFrecuencia}
        columnas={3}
      />

      <div class="campo">
        <label class="campo__etiqueta" for="notas">
          Notas (opcional)
        </label>
        <input
          id="notas"
          class="entrada"
          type="text"
          placeholder="Sin piel, la marca que sea"
          autocomplete="off"
          enterkeyhint="done"
          value={notas}
          onKeyDown={(e) => {
            // «OK» en el teclado lo cierra; para guardar está el botón.
            if (e.key === 'Enter') {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          onInput={(e) => setNotas(e.currentTarget.value)}
        />
      </div>

      {existente?.soloRecetas && (
        <p class="secundario">
          Ahora solo se compra para tus recetas. Si también lo gastáis aparte, escribe cuánto.
        </p>
      )}
      {cantidad !== null && nombre.trim() && (
        <p class="resumen-necesidad">
          {nombre.trim()}: {textoNecesidad({ cantidad, unidad, frecuencia })}
          {unidad === 'g' || unidad === 'ml'
            ? ` (se compara en ${unidad === 'g' ? 'kg' : 'litros'})`
            : ''}
          .
        </p>
      )}

      {fallo && (
        <p class="aviso aviso--error" role="alert">
          <Icono nombre="alerta" tamano={20} />
          <span>{fallo}</span>
        </p>
      )}

      <div class="acciones">
        <button type="submit" class="boton boton--principal boton--ancho" disabled={guardando}>
          {guardando ? 'Guardando…' : existente ? 'Guardar cambios' : 'Añadir'}
        </button>
        <a
          class="boton boton--ancho"
          href={existente ? `#necesidades/${existente.id}` : '#necesidades'}
        >
          Cancelar
        </a>
        {existente && (
          <button type="button" class="boton boton--peligro boton--ancho" onClick={alBorrar}>
            Borrar
          </button>
        )}
      </div>
    </form>
  );
}
