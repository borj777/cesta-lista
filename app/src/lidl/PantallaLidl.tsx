import { useMemo, useState } from 'preact/hooks';
import { Icono } from '../componentes/Icono.tsx';
import { Opciones } from '../componentes/Opciones.tsx';
import { InfoProducto } from '../componentes/Producto.tsx';
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
import { borrarLidl, guardarLidl, useLidl } from './estado.ts';
import {
  aFormato,
  aProductoApp,
  confirmarPrecio,
  crearProductoLidl,
  deFormato,
  DIAS_PRECIO_ANTIGUO,
  diasDesde,
  editarProductoLidl,
  leerPrecio,
  precioAntiguo,
  textoAntiguedad,
  validarBorradorLidl,
  type ErroresLidl,
  type ProductoLidl,
} from './modelo.ts';

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

/** Nota de un producto de Lidl: cuándo se comprobó su precio, en naranja si es antiguo. */
export function notaLidl(p: ProductoLidl, ahora: Date): { texto: string; atencion: boolean } {
  const antiguo = precioAntiguo(p, ahora);
  return {
    texto: `Precio comprobado ${textoAntiguedad(p.actualizado, ahora)}${antiguo ? ': compruébalo' : ''}`,
    atencion: antiguo,
  };
}

/**
 * Rutas: #lidl (lista), #lidl/nuevo, #lidl/nuevo/<id de necesidad> (lo añade y lo elige
 * para esa necesidad) y #lidl/<id> (editar).
 */
export function PantallaLidl({ sub }: { sub: string | null }) {
  const { productos, error } = useLidl();
  const { necesidades } = useNecesidades();

  if (error) {
    return (
      <>
        <h1>Precios de Lidl</h1>
        <p class="aviso aviso--error" role="alert">
          <Icono nombre="alerta" tamano={20} />
          <span>{error}</span>
        </p>
      </>
    );
  }
  if (productos === null || necesidades === null) return <h1>Precios de Lidl</h1>;

  if (sub?.startsWith('nuevo')) {
    const para = necesidades.find((n) => n.id === sub.split('/')[1]);
    return <FormLidl key={sub} para={para} necesidades={necesidades} />;
  }
  // #lidl/<id>/<id de necesidad>: se ha abierto desde la ficha de esa necesidad y vuelve a ella.
  const [id, idDesde] = sub?.split('/') ?? [];
  const existente = id ? productos.find((p) => p.id === id) : undefined;
  if (existente) {
    return (
      <FormLidl
        key={existente.id}
        existente={existente}
        desde={necesidades.find((n) => n.id === idDesde)}
        necesidades={necesidades}
      />
    );
  }
  return <ListaLidl productos={productos} />;
}

function ListaLidl({ productos }: { productos: ProductoLidl[] }) {
  const ahora = new Date();
  const ordenados = [...productos].sort((a, b) =>
    a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }),
  );
  const antiguos = productos.filter((p) => precioAntiguo(p, ahora)).length;

  return (
    <>
      <h1>Precios de Lidl</h1>
      <p class="secundario">
        Lidl no publica sus precios en internet: apunta aquí los de lo que compras allí, mirando el
        ticket o la etiqueta de la tienda.
      </p>
      {antiguos > 0 && (
        <p class="aviso aviso--atencion">
          <Icono nombre="alerta" tamano={20} />
          <span>
            {antiguos === 1
              ? `1 precio tiene más de ${DIAS_PRECIO_ANTIGUO} días. Compruébalo la próxima vez que vayas a Lidl.`
              : `${antiguos} precios tienen más de ${DIAS_PRECIO_ANTIGUO} días. Compruébalos la próxima vez que vayas a Lidl.`}
          </span>
        </p>
      )}
      {ordenados.length === 0 ? (
        <section class="tarjeta">
          <h2>Todavía no hay ninguno</h2>
          <p class="secundario">
            Por ejemplo: «Leche semidesnatada», 6 litros, 4,74&nbsp;€. La app calcula el precio por
            litro para compararlo con Mercadona y Consum.
          </p>
        </section>
      ) : (
        <ul class="filas tarjeta tarjeta--lista">
          {ordenados.map((p) => (
            <li key={p.id}>
              <a class="producto producto--boton" href={`#lidl/${p.id}`}>
                <InfoProducto producto={aProductoApp(p)} nota={notaLidl(p, ahora)} />
              </a>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        class="boton boton--principal boton--ancho"
        onClick={() => ir('lidl/nuevo')}
      >
        Añadir producto de Lidl
      </button>
    </>
  );
}

function FormLidl({
  existente,
  para,
  desde,
  necesidades,
}: {
  existente?: ProductoLidl;
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
  const [errores, setErrores] = useState<ErroresLidl>({});
  const [fallo, setFallo] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cantidad = leerCantidad(cantidadTexto);
  const precio = leerPrecio(precioTexto);
  const ahora = new Date();
  const volver = para
    ? `necesidades/${para.id}/elegir/lidl`
    : desde
      ? `necesidades/${desde.id}`
      : 'lidl';

  // Necesidades que usan este producto, para avisar al borrarlo.
  const usos = useMemo(
    () =>
      existente
        ? necesidades.filter((n) => {
            const e = n.equivalencias?.lidl;
            return e && 'id' in e && e.id === existente.id;
          })
        : [],
    [existente, necesidades],
  );

  const alGuardar = async (evento: Event) => {
    evento.preventDefault();
    const nuevosErrores = validarBorradorLidl({ nombre, cantidad, precio });
    setErrores(nuevosErrores);
    if (Object.keys(nuevosErrores).length > 0 || cantidad === null || precio === null) return;
    setGuardando(true);
    setFallo(null);
    const borrador = { nombre, marca, cantidad, unidad, precio };
    const momento = new Date().toISOString();
    try {
      const guardado = existente
        ? editarProductoLidl(existente, borrador, momento)
        : crearProductoLidl(borrador, momento, crypto.randomUUID());
      await guardarLidl(guardado);
      if (para) {
        await guardarNecesidad(elegirProducto(para, 'lidl', guardado.id, momento));
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
      await guardarLidl(confirmarPrecio(existente, new Date().toISOString()));
      ir(volver);
    } catch (error) {
      setFallo(falloDe(error));
    }
  };

  const alBorrar = async () => {
    if (!existente) return;
    const aviso =
      usos.length > 0
        ? `\n\nLo tienes elegido para: ${usos.map((n) => n.nombre).join(', ')}. Tendrás que elegir otro producto de Lidl para ${usos.length === 1 ? 'esa necesidad' : 'esas necesidades'}.`
        : '';
    if (!confirm(`¿Borrar «${existente.nombre}» de tus precios de Lidl?${aviso}`)) return;
    try {
      await borrarLidl(existente.id);
      ir(volver);
    } catch (error) {
      setFallo(falloDe(error));
    }
  };

  const titulo = existente ? 'Editar precio de Lidl' : 'Nuevo producto de Lidl';
  const formato = cantidad !== null ? aFormato(cantidad, unidad) : null;

  return (
    <form onSubmit={alGuardar} noValidate>
      <a class="volver" href={`#${volver}`}>
        ‹ {para ? 'Elegir en Lidl' : desde ? desde.nombre : 'Precios de Lidl'}
      </a>
      <h1>{titulo}</h1>
      {para && (
        <p class="secundario">Al guardarlo, quedará elegido en Lidl para «{para.nombre}».</p>
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
        <label class="campo__etiqueta" for="nombre-lidl">
          Producto
        </label>
        <input
          id="nombre-lidl"
          class={errores.nombre ? 'entrada entrada--error' : 'entrada'}
          type="text"
          placeholder="Leche semidesnatada"
          autocomplete="off"
          enterkeyhint="next"
          value={nombre}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              document.getElementById('marca-lidl')?.focus();
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
        <label class="campo__etiqueta" for="marca-lidl">
          Marca (opcional)
        </label>
        <input
          id="marca-lidl"
          class="entrada"
          type="text"
          placeholder="Milbona"
          autocomplete="off"
          enterkeyhint="next"
          value={marca}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              document.getElementById('cantidad-lidl')?.focus();
            }
          }}
          onInput={(e) => setMarca(e.currentTarget.value)}
        />
      </div>

      <div class="campo">
        <label class="campo__etiqueta" for="cantidad-lidl">
          Cuánto trae el envase
        </label>
        <input
          id="cantidad-lidl"
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
        nombre="unidad-lidl"
        etiqueta="Unidad"
        opciones={OPCIONES_UNIDAD}
        valor={unidad}
        alCambiar={setUnidad}
        columnas={4}
      />

      <div class="campo">
        <label class="campo__etiqueta" for="precio-lidl">
          Precio del envase (€)
        </label>
        <input
          id="precio-lidl"
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
