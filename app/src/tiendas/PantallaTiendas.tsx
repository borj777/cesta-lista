import { useMemo, useState } from 'preact/hooks';
import { Icono } from '../componentes/Icono.tsx';
import { Opciones } from '../componentes/Opciones.tsx';
import { InfoProducto } from '../componentes/Producto.tsx';
import { Interruptor, NombreTienda, Punto } from '../componentes/Tienda.tsx';
import { fechaCorta, miles } from '../estado.ts';
import { hoyEnEspana, textoDia, textoFormato, textoPrecio, textoPrecioRef } from '../formato.ts';
import { guardar as guardarNecesidad, useNecesidades } from '../necesidades/estado.ts';
import {
  elegirProducto,
  escribirCantidad,
  leerCantidad,
  OPCIONES_UNIDAD,
  type Necesidad,
  type UnidadNecesidad,
} from '../necesidades/modelo.ts';
import type { DatosApp } from '../tipos.ts';
import { OfertasSemana } from './OfertasSemana.tsx';
import { ofertasDe } from './ofertas.ts';
import {
  borrarProducto,
  borrarTienda,
  cambiarActiva,
  guardarProducto,
  guardarTienda,
  useTiendas,
} from './estado.ts';
import {
  crearTienda,
  esAutomatica,
  MAX_TIENDAS_PROPIAS,
  renombrarTienda,
  validarNombreTienda,
  type InfoTienda,
  type TiendaPropia,
} from './modelo.ts';
import {
  aFormato,
  aProductoApp,
  confirmarPrecio,
  crearProducto,
  deFormato,
  DIAS_PRECIO_ANTIGUO,
  diasDesde,
  editarProducto,
  leerPrecio,
  notaPrecio,
  precioAntiguo,
  textoAntiguedad,
  validarBorradorProducto,
  type ErroresProducto,
  type ProductoPropio,
} from './productos.ts';

/** Ejemplo de cantidad del envase según la unidad elegida. */
const EJEMPLO_CANTIDAD: Record<UnidadNecesidad, string> = {
  kg: '1',
  g: '500',
  l: '1',
  ml: '330',
  ud: '12',
  lavado: '40',
  m: '25',
};

const ir = (ruta: string) => {
  location.hash = ruta;
};

const falloDe = (error: unknown) =>
  `No se ha podido guardar (${error instanceof Error ? error.message : String(error)}).`;

/** Necesidades que tienen elegido algo en una tienda (un producto concreto, si se indica). */
function usosDe(necesidades: Necesidad[], tienda: string, idProducto?: string): Necesidad[] {
  return necesidades.filter((n) => {
    const e = n.equivalencias?.[tienda];
    return e && 'id' in e && (idProducto === undefined || e.id === idProducto);
  });
}

function Fallo({ texto }: { texto: string | null }) {
  if (!texto) return null;
  return (
    <p class="aviso aviso--error" role="alert">
      <Icono nombre="alerta" tamano={20} />
      <span>{texto}</span>
    </p>
  );
}

/**
 * Rutas: #tiendas (lista), #tiendas/nueva, #tiendas/<tienda>, #tiendas/<tienda>/editar,
 * #tiendas/<tienda>/nuevo[/<necesidad>] (al guardarlo, lo elige para esa necesidad) y
 * #tiendas/<tienda>/p/<producto>[/<necesidad>] (vuelve a la ficha de esa necesidad).
 */
export function PantallaTiendas({
  sub,
  datos,
  ahora,
}: {
  sub: string | null;
  datos: DatosApp | null;
  ahora: Date;
}) {
  const { propias, productos, lista, error } = useTiendas();
  const { necesidades } = useNecesidades();

  if (error) {
    return (
      <>
        <h1>Tiendas</h1>
        <Fallo texto={error} />
      </>
    );
  }
  if (!propias || !productos || !lista || !necesidades) return <h1>Tiendas</h1>;

  if (sub === 'nueva')
    return <FormTienda key="nueva" propias={propias} necesidades={necesidades} />;

  const [idTienda = '', accion, a, b] = sub?.split('/') ?? [];
  const info = lista.find((t) => t.id === idTienda);
  const propia = propias.find((t) => t.id === idTienda);
  const suyos = productos.filter((p) => p.tienda === idTienda);

  if (propia && accion === 'editar') {
    return (
      <FormTienda
        key={`editar-${propia.id}`}
        existente={propia}
        propias={propias}
        necesidades={necesidades}
        productos={suyos.length}
      />
    );
  }
  if (propia && accion === 'nuevo') {
    return (
      <FormProducto
        key={sub}
        tienda={propia}
        para={necesidades.find((n) => n.id === a)}
        necesidades={necesidades}
      />
    );
  }
  const existente = propia && accion === 'p' ? suyos.find((p) => p.id === a) : undefined;
  if (propia && existente) {
    return (
      <FormProducto
        key={existente.id}
        tienda={propia}
        existente={existente}
        desde={necesidades.find((n) => n.id === b)}
        necesidades={necesidades}
      />
    );
  }
  if (info) {
    return (
      <PaginaTienda
        tienda={info}
        productos={suyos}
        datos={datos}
        ahora={ahora}
        usos={usosDe(necesidades, info.id).length}
      />
    );
  }
  return <ListaTiendas tiendas={lista} productos={productos} datos={datos} ahora={ahora} />;
}

/** "4.345 productos · precios del 16/11" para Mercadona y Consum. */
function resumenAutomatica(id: string, datos: DatosApp | null): string {
  if (!datos || !esAutomatica(id)) return 'Cargando precios…';
  const n = datos.productos.filter((p) => p.tienda === id).length;
  const fecha = datos.tiendas[id]?.actualizado;
  return `${miles(n)} productos${fecha ? ` · precios del ${fechaCorta(fecha)}` : ''}`;
}

function resumenPropia(suyos: ProductoPropio[], ahora: Date): string {
  if (suyos.length === 0) return 'Sin productos todavía';
  const antiguos = suyos.filter((p) => precioAntiguo(p, ahora)).length;
  const total = suyos.length === 1 ? '1 producto' : `${suyos.length} productos`;
  return antiguos > 0 ? `${total} · ${antiguos} para comprobar` : total;
}

function ListaTiendas({
  tiendas,
  productos,
  datos,
  ahora,
}: {
  tiendas: InfoTienda[];
  productos: ProductoPropio[];
  datos: DatosApp | null;
  ahora: Date;
}) {
  const automaticas = tiendas.filter((t) => t.automatica);
  const propias = tiendas.filter((t) => !t.automatica);
  const fila = (t: InfoTienda, detalle: string) => (
    <li key={t.id}>
      <a class="fila fila--enlace" href={`#tiendas/${t.id}`}>
        <div class="fila__texto">
          <span>
            <NombreTienda tienda={t} />
          </span>
          <span class="secundario">{detalle}</span>
        </div>
        {!t.activa && <span class="etiqueta-apagada">Apagada</span>}
        <span class="fila__flecha" aria-hidden="true">
          ›
        </span>
      </a>
    </li>
  );

  return (
    <>
      <h1>Tiendas</h1>
      <p class="secundario">
        Toca una tienda para apagarla si no vas nunca: la app no te mandará allí al repartir la
        compra.
      </p>

      <h2 class="grupo__titulo">Con precios automáticos</h2>
      <ul class="filas tarjeta tarjeta--lista">
        {automaticas.map((t) => fila(t, resumenAutomatica(t.id, datos)))}
      </ul>

      <h2 class="grupo__titulo grupo__titulo--separado">Tus tiendas</h2>
      <p class="secundario">
        Las que no publican sus precios en internet: apunta los de lo que compras allí, mirando el
        ticket o la etiqueta.
      </p>
      {propias.length > 0 && (
        <ul class="filas tarjeta tarjeta--lista">
          {propias.map((t) => {
            const resumen = resumenPropia(
              productos.filter((p) => p.tienda === t.id),
              ahora,
            );
            const ofertas = datos ? ofertasDe(datos, t.id, hoyEnEspana(ahora)).length : 0;
            return fila(
              t,
              ofertas > 0
                ? `${resumen} · ${ofertas === 1 ? '1 oferta' : `${ofertas} ofertas`} esta semana`
                : resumen,
            );
          })}
        </ul>
      )}
      {propias.length < MAX_TIENDAS_PROPIAS ? (
        <div class="acciones">
          <a class="boton boton--principal boton--ancho" href="#tiendas/nueva">
            Añadir una tienda
          </a>
        </div>
      ) : (
        <p class="secundario">
          Has llegado al máximo de {MAX_TIENDAS_PROPIAS} tiendas propias. Borra alguna que no uses
          para añadir otra.
        </p>
      )}
    </>
  );
}

function PaginaTienda({
  tienda,
  productos,
  datos,
  ahora,
  usos,
}: {
  tienda: InfoTienda;
  productos: ProductoPropio[];
  datos: DatosApp | null;
  ahora: Date;
  usos: number;
}) {
  const [fallo, setFallo] = useState<string | null>(null);
  const ordenados = [...productos].sort((a, b) =>
    a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }),
  );
  const antiguos = productos.filter((p) => precioAntiguo(p, ahora)).length;
  const ofertas =
    datos && !tienda.automatica ? ofertasDe(datos, tienda.id, hoyEnEspana(ahora)) : [];
  const cambiar = (activa: boolean) => {
    setFallo(null);
    cambiarActiva(tienda.id, activa).catch((e: unknown) => setFallo(falloDe(e)));
  };

  return (
    <>
      <a class="volver" href="#tiendas">
        ‹ Tiendas
      </a>
      <h1>
        <Punto color={tienda.color} /> {tienda.nombre}
      </h1>
      <section class="tarjeta">
        <Interruptor
          id={`activa-${tienda.id}`}
          etiqueta={`Compro en ${tienda.nombre}`}
          detalle={
            tienda.activa
              ? 'La app la tiene en cuenta al repartir la compra.'
              : `Apagada: la app no te mandará a ${tienda.nombre}${usos > 0 ? ' (lo que tienes elegido aquí se guarda por si la vuelves a encender)' : ''}.`
          }
          encendido={tienda.activa}
          alCambiar={cambiar}
        />
      </section>
      <Fallo texto={fallo} />

      {tienda.automatica ? (
        <p class="secundario">
          Sus precios se descargan solos cada mañana: {resumenAutomatica(tienda.id, datos)}.
        </p>
      ) : (
        <>
          {antiguos > 0 && (
            <p class="aviso aviso--atencion">
              <Icono nombre="alerta" tamano={20} />
              <span>
                {antiguos === 1
                  ? `1 precio tiene más de ${DIAS_PRECIO_ANTIGUO} días. Compruébalo la próxima vez que vayas a ${tienda.nombre}.`
                  : `${antiguos} precios tienen más de ${DIAS_PRECIO_ANTIGUO} días. Compruébalos la próxima vez que vayas a ${tienda.nombre}.`}
              </span>
            </p>
          )}
          <h2 class="grupo__titulo grupo__titulo--separado">Productos</h2>
          {ordenados.length === 0 ? (
            <section class="tarjeta">
              <p class="secundario">
                Todavía no hay ninguno. Por ejemplo: «Leche semidesnatada», 6 litros, 4,74&nbsp;€.
                La app calcula el precio por litro para compararlo con las otras tiendas.
              </p>
            </section>
          ) : (
            <ul class="filas tarjeta tarjeta--lista">
              {ordenados.map((p) => (
                <li key={p.id}>
                  <a class="producto producto--boton" href={`#tiendas/${tienda.id}/p/${p.id}`}>
                    <InfoProducto producto={aProductoApp(p)} nota={notaPrecio(p, ahora)} />
                  </a>
                </li>
              ))}
            </ul>
          )}
          <div class="acciones">
            <button
              type="button"
              class="boton boton--principal boton--ancho"
              onClick={() => ir(`tiendas/${tienda.id}/nuevo`)}
            >
              Añadir un producto
            </button>
            <a class="boton boton--ancho" href={`#tiendas/${tienda.id}/editar`}>
              Cambiar el nombre o borrar la tienda
            </a>
          </div>
          {datos && ofertas.length > 0 && (
            <OfertasSemana
              ofertas={ofertas}
              datos={datos}
              tienda={tienda.id}
              nombre={tienda.nombre}
            />
          )}
        </>
      )}
    </>
  );
}

function FormTienda({
  existente,
  propias,
  necesidades,
  productos = 0,
}: {
  existente?: TiendaPropia;
  propias: TiendaPropia[];
  necesidades: Necesidad[];
  /** Productos apuntados en la tienda que se edita. */
  productos?: number;
}) {
  const [nombre, setNombre] = useState(existente?.nombre ?? '');
  const [error, setError] = useState<string | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const volver = existente ? `tiendas/${existente.id}` : 'tiendas';

  if (!existente && propias.length >= MAX_TIENDAS_PROPIAS) {
    return (
      <>
        <a class="volver" href="#tiendas">
          ‹ Tiendas
        </a>
        <h1>Nueva tienda</h1>
        <p class="secundario">
          Has llegado al máximo de {MAX_TIENDAS_PROPIAS} tiendas propias. Borra alguna que no uses
          para añadir otra.
        </p>
      </>
    );
  }

  const alGuardar = async (evento: Event) => {
    evento.preventDefault();
    const problema = validarNombreTienda(nombre, propias, existente);
    setError(problema);
    if (problema) return;
    setGuardando(true);
    setFallo(null);
    try {
      const tienda = existente
        ? renombrarTienda(existente, nombre)
        : crearTienda(nombre, propias, new Date().toISOString(), crypto.randomUUID());
      await guardarTienda(tienda);
      ir(`tiendas/${tienda.id}`);
    } catch (e) {
      setFallo(falloDe(e));
      setGuardando(false);
    }
  };

  const alBorrar = async () => {
    if (!existente) return;
    const usos = usosDe(necesidades, existente.id);
    const partes = [
      productos > 0 &&
        (productos === 1
          ? 'Se borrará también su producto.'
          : `Se borrarán también sus ${productos} productos.`),
      usos.length > 0 &&
        `Lo que tienes elegido en ella se quitará de: ${usos.map((n) => n.nombre).join(', ')}.`,
    ].filter(Boolean);
    const aviso = partes.length > 0 ? `\n\n${partes.join('\n')}` : '';
    if (!confirm(`¿Borrar la tienda «${existente.nombre}»?${aviso}\n\nNo se puede deshacer.`)) {
      return;
    }
    try {
      await borrarTienda(existente.id);
      ir('tiendas');
    } catch (e) {
      setFallo(falloDe(e));
    }
  };

  return (
    <form onSubmit={alGuardar} noValidate>
      <a class="volver" href={`#${volver}`}>
        ‹ {existente ? existente.nombre : 'Tiendas'}
      </a>
      <h1>{existente ? 'Editar la tienda' : 'Nueva tienda'}</h1>
      {!existente && (
        <p class="secundario">
          Por ejemplo, otro supermercado o la frutería del barrio. Después podrás apuntar los
          precios de lo que compras allí.
        </p>
      )}
      <div class="campo">
        <label class="campo__etiqueta" for="nombre-tienda">
          Nombre
        </label>
        <input
          id="nombre-tienda"
          class={error ? 'entrada entrada--error' : 'entrada'}
          type="text"
          placeholder="Frutería del barrio"
          autocomplete="off"
          enterkeyhint="done"
          value={nombre}
          onInput={(e) => {
            setNombre(e.currentTarget.value);
            if (error) setError(null);
          }}
        />
        {error && <p class="campo__error">{error}</p>}
      </div>
      <Fallo texto={fallo} />
      <div class="acciones">
        <button type="submit" class="boton boton--principal boton--ancho" disabled={guardando}>
          {guardando ? 'Guardando…' : existente ? 'Guardar' : 'Añadir la tienda'}
        </button>
        <a class="boton boton--ancho" href={`#${volver}`}>
          Cancelar
        </a>
        {existente && (
          <button
            type="button"
            class="boton boton--peligro boton--ancho"
            onClick={() => void alBorrar()}
          >
            Borrar la tienda
          </button>
        )}
      </div>
    </form>
  );
}

function FormProducto({
  tienda,
  existente,
  para,
  desde,
  necesidades,
}: {
  tienda: TiendaPropia;
  existente?: ProductoPropio;
  /** Necesidad para la que se añade el producto: al guardarlo, se elige para ella. */
  para?: Necesidad;
  /** Necesidad desde cuya ficha se ha abierto: se vuelve a ella al terminar. */
  desde?: Necesidad;
  necesidades: Necesidad[];
}) {
  const inicial = existente ? deFormato(existente.formato) : null;
  const [nombre, setNombre] = useState(existente?.nombre ?? para?.nombre ?? '');
  const [marca, setMarca] = useState(existente?.marca ?? '');
  const [cantidadTexto, setCantidadTexto] = useState(
    inicial ? escribirCantidad(inicial.cantidad) : '',
  );
  const [unidad, setUnidad] = useState<UnidadNecesidad>(inicial?.unidad ?? para?.unidad ?? 'g');
  const [precioTexto, setPrecioTexto] = useState(
    existente ? escribirCantidad(existente.precio).replace(/,(\d)$/, ',$10') : '',
  );
  const [errores, setErrores] = useState<ErroresProducto>({});
  const [fallo, setFallo] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cantidad = leerCantidad(cantidadTexto);
  const precio = leerPrecio(precioTexto);
  const ahora = new Date();
  const volver = para
    ? `necesidades/${para.id}/elegir/${tienda.id}`
    : desde
      ? `necesidades/${desde.id}`
      : `tiendas/${tienda.id}`;

  // Necesidades que usan este producto, para avisar al borrarlo.
  const usos = useMemo(
    () => (existente ? usosDe(necesidades, tienda.id, existente.id) : []),
    [existente, necesidades, tienda.id],
  );

  const alGuardar = async (evento: Event) => {
    evento.preventDefault();
    const nuevosErrores = validarBorradorProducto({ nombre, cantidad, precio });
    setErrores(nuevosErrores);
    if (Object.keys(nuevosErrores).length > 0 || cantidad === null || precio === null) return;
    setGuardando(true);
    setFallo(null);
    const borrador = { nombre, marca, cantidad, unidad, precio };
    const momento = new Date().toISOString();
    try {
      const guardado = existente
        ? editarProducto(existente, borrador, momento)
        : crearProducto(tienda.id, borrador, momento, crypto.randomUUID());
      await guardarProducto(guardado);
      if (para) {
        await guardarNecesidad(elegirProducto(para, tienda.id, guardado.id, momento));
        ir(`necesidades/${para.id}`);
      } else {
        ir(volver);
      }
    } catch (error) {
      setFallo(falloDe(error));
      setGuardando(false);
    }
  };

  const alConfirmar = async () => {
    if (!existente) return;
    try {
      await guardarProducto(confirmarPrecio(existente, new Date().toISOString()));
      ir(volver);
    } catch (error) {
      setFallo(falloDe(error));
    }
  };

  const alBorrar = async () => {
    if (!existente) return;
    const aviso =
      usos.length > 0
        ? `\n\nLo tienes elegido para: ${usos.map((n) => n.nombre).join(', ')}. Tendrás que elegir otro producto de ${tienda.nombre} para ${usos.length === 1 ? 'esa necesidad' : 'esas necesidades'}.`
        : '';
    if (!confirm(`¿Borrar «${existente.nombre}» de ${tienda.nombre}?${aviso}`)) return;
    try {
      await borrarProducto(existente.id);
      ir(volver);
    } catch (error) {
      setFallo(falloDe(error));
    }
  };

  const formato = cantidad !== null ? aFormato(cantidad, unidad) : null;

  return (
    <form onSubmit={alGuardar} noValidate>
      <a class="volver" href={`#${volver}`}>
        ‹ {para ? `Elegir en ${tienda.nombre}` : desde ? desde.nombre : tienda.nombre}
      </a>
      <h1>
        {existente ? `Editar precio de ${tienda.nombre}` : `Nuevo producto de ${tienda.nombre}`}
      </h1>
      {para && (
        <p class="secundario">
          Al guardarlo, quedará elegido en {tienda.nombre} para «{para.nombre}».
        </p>
      )}
      {existente && (
        <p class={precioAntiguo(existente, ahora) ? 'texto--atencion' : 'secundario'}>
          Precio comprobado {textoAntiguedad(existente.actualizado, ahora)}
          {diasDesde(existente.actualizado, ahora) > 1
            ? ` (el ${textoDia(hoyEnEspana(new Date(existente.actualizado)))})`
            : ''}
          .
        </p>
      )}

      <div class="campo">
        <label class="campo__etiqueta" for="nombre-producto">
          Producto
        </label>
        <input
          id="nombre-producto"
          class={errores.nombre ? 'entrada entrada--error' : 'entrada'}
          type="text"
          placeholder="Leche semidesnatada"
          autocomplete="off"
          enterkeyhint="next"
          value={nombre}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              document.getElementById('marca-producto')?.focus();
            }
          }}
          onInput={(e) => {
            setNombre(e.currentTarget.value);
            if (errores.nombre) setErrores({ ...errores, nombre: undefined });
          }}
        />
        {errores.nombre && <p class="campo__error">{errores.nombre}</p>}
      </div>

      <div class="campo">
        <label class="campo__etiqueta" for="marca-producto">
          Marca (opcional)
        </label>
        <input
          id="marca-producto"
          class="entrada"
          type="text"
          placeholder={tienda.id === 'lidl' ? 'Milbona' : 'Marca'}
          autocomplete="off"
          enterkeyhint="next"
          value={marca}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              document.getElementById('cantidad-producto')?.focus();
            }
          }}
          onInput={(e) => setMarca(e.currentTarget.value)}
        />
      </div>

      <div class="campo">
        <label class="campo__etiqueta" for="cantidad-producto">
          Cuánto trae el envase
        </label>
        <input
          id="cantidad-producto"
          class={errores.cantidad ? 'entrada entrada--error' : 'entrada'}
          type="text"
          inputmode="decimal"
          placeholder={EJEMPLO_CANTIDAD[unidad]}
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
        nombre="unidad-producto"
        etiqueta="Unidad"
        opciones={OPCIONES_UNIDAD}
        valor={unidad}
        alCambiar={setUnidad}
        columnas={4}
      />

      <div class="campo">
        <label class="campo__etiqueta" for="precio-producto">
          Precio del envase (€)
        </label>
        <input
          id="precio-producto"
          class={errores.precio ? 'entrada entrada--error' : 'entrada'}
          type="text"
          inputmode="decimal"
          placeholder="1,29"
          autocomplete="off"
          value={precioTexto}
          onInput={(e) => {
            setPrecioTexto(e.currentTarget.value);
            if (errores.precio) setErrores({ ...errores, precio: undefined });
          }}
        />
        {errores.precio && <p class="campo__error">{errores.precio}</p>}
      </div>

      {formato && precio !== null && (
        <p class="resumen-necesidad">
          {textoFormato(formato)} por {textoPrecio(precio)}:{' '}
          <strong>{textoPrecioRef(precio / formato.cantidad, formato.unidad)}</strong>
        </p>
      )}

      {usos.length > 0 && (
        <p class="secundario">Lo tienes elegido para: {usos.map((n) => n.nombre).join(', ')}.</p>
      )}

      <Fallo texto={fallo} />

      <div class="acciones">
        <button type="submit" class="boton boton--principal boton--ancho" disabled={guardando}>
          {guardando ? 'Guardando…' : existente ? 'Guardar cambios' : 'Añadir'}
        </button>
        {existente && diasDesde(existente.actualizado, ahora) > 0 && (
          <button type="button" class="boton boton--ancho" onClick={() => void alConfirmar()}>
            Sigue al mismo precio
          </button>
        )}
        <a class="boton boton--ancho" href={`#${volver}`}>
          Cancelar
        </a>
        {existente && (
          <button
            type="button"
            class="boton boton--peligro boton--ancho"
            onClick={() => void alBorrar()}
          >
            Borrar
          </button>
        )}
      </div>
    </form>
  );
}
