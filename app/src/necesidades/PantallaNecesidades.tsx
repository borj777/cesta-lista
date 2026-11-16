import { useState } from 'preact/hooks';
import { useCatalogo } from '../catalogo.ts';
import { Icono } from '../componentes/Icono.tsx';
import { Opciones } from '../componentes/Opciones.tsx';
import type { DatosApp } from '../tipos.ts';
import { DetalleNecesidad } from './DetalleNecesidad.tsx';
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
 * #necesidades/<id>/elegir/<tienda>.
 */
export function PantallaNecesidades({
  sub,
  datos,
}: {
  sub: string | null;
  datos: DatosApp | null;
}) {
  const { necesidades, error } = useNecesidades();
  const { productosLidl, buscarProducto } = useCatalogo(datos);

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
  if (sub) {
    const [id, accion, tienda] = sub.split('/');
    const existente = necesidades.find((n) => n.id === id);
    if (existente && accion === 'editar') {
      return <FormNecesidad key={existente.id} existente={existente} />;
    }
    if (
      existente &&
      accion === 'elegir' &&
      (tienda === 'mercadona' || tienda === 'consum' || tienda === 'lidl')
    ) {
      if (!datos || !productosLidl || !buscarProducto) {
        return <p class="secundario">Cargando precios…</p>;
      }
      return (
        <ElegirProducto
          key={`${existente.id}-${tienda}`}
          necesidad={existente}
          tienda={tienda}
          productos={tienda === 'lidl' ? productosLidl : datos.productos}
          buscarProducto={buscarProducto}
        />
      );
    }
    if (existente)
      return <DetalleNecesidad necesidad={existente} buscarProducto={buscarProducto} />;
  }
  return <ListaNecesidades necesidades={necesidades} />;
}

/** Puntos de color de las tiendas con producto elegido, o «Sin elegir». */
function TiendasElegidas({ necesidad }: { necesidad: Necesidad }) {
  const e = necesidad.equivalencias ?? {};
  const elegidas = (['mercadona', 'consum', 'lidl'] as const).filter((t) => {
    const x = e[t];
    return x && 'id' in x;
  });
  const decididas = Object.keys(e).length;
  if (decididas === 0) return <span class="sin-elegir">Sin elegir</span>;
  return (
    <span class="puntos" aria-label={`Elegido en ${elegidas.length} tiendas`}>
      {elegidas.map((t) => (
        <span key={t} class={`punto punto--${t}`} />
      ))}
    </span>
  );
}

function ListaNecesidades({ necesidades }: { necesidades: Necesidad[] }) {
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
        {necesidades.length === 1 ? '1 cosa apuntada' : `${necesidades.length} cosas apuntadas`}
      </p>
      {agruparPorCategoria(necesidades).map((grupo) => (
        <section key={grupo.categoria} class="grupo">
          <h2 class="grupo__titulo">{NOMBRE_CATEGORIA[grupo.categoria]}</h2>
          <ul class="filas tarjeta tarjeta--lista">
            {grupo.necesidades.map((n) => (
              <li key={n.id}>
                <a class="fila fila--enlace" href={`#necesidades/${n.id}`}>
                  <div class="fila__texto">
                    <span>{n.nombre}</span>
                    <span class="secundario">{textoNecesidad(n)}</span>
                  </div>
                  <TiendasElegidas necesidad={n} />
                  <span class="chevron" aria-hidden="true">
                    ›
                  </span>
                </a>
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
    existente ? escribirCantidad(existente.cantidad) : '',
  );
  const [unidad, setUnidad] = useState<UnidadNecesidad>(existente?.unidad ?? 'kg');
  const [frecuencia, setFrecuencia] = useState<Frecuencia>(existente?.frecuencia ?? 'semana');
  const [notas, setNotas] = useState(existente?.notas ?? '');
  const [errores, setErrores] = useState<ErroresBorrador>({});
  const [fallo, setFallo] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cantidad = leerCantidad(cantidadTexto);

  const alGuardar = async (evento: Event) => {
    evento.preventDefault();
    const nuevosErrores = validarBorrador({ nombre, cantidad });
    setErrores(nuevosErrores);
    if (Object.keys(nuevosErrores).length > 0 || cantidad === null) return;
    setGuardando(true);
    setFallo(null);
    const borrador = { nombre, categoria, cantidad, unidad, frecuencia, notas };
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
    if (!existente || !confirm(`¿Borrar «${existente.nombre}» de tus necesidades?`)) return;
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
          Cuánto gastáis
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
