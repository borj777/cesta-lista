import { PantallaDieta } from './dieta/PantallaDieta.tsx';
import { useMemo, useState } from 'preact/hooks';
import { Icono } from '../componentes/Icono.tsx';
import { Opciones } from '../componentes/Opciones.tsx';
import { normalizar } from '../buscador.ts';
import { useNecesidades } from '../necesidades/estado.ts';
import {
  escribirCantidad,
  leerCantidad,
  OPCIONES_UNIDAD,
  textoCantidad,
  textoNecesidad,
  type Necesidad,
  type UnidadNecesidad,
} from '../necesidades/modelo.ts';
import { borrarReceta, guardarMenu, guardarReceta, useRecetas } from './estado.ts';
import { aportesDelMenu, MAX_PERSONAS, MAX_VECES, type PlatoMenu } from './menu.ts';
import {
  necesidadParaIngrediente,
  sugerirNecesidades,
  UNIDADES_INGREDIENTE,
  unidadesCompatibles,
  validarReceta,
  type ErroresReceta,
  type Receta,
} from './recetas.ts';

const ir = (ruta: string) => {
  location.hash = ruta;
};
const falloDe = (error: unknown) =>
  `No se ha podido guardar (${error instanceof Error ? error.message : String(error)}).`;

/** ¿Tiene producto elegido en alguna tienda? */
const conProducto = (n: Necesidad) =>
  Object.values(n.equivalencias ?? {}).some((e) => e && 'id' in e);

/** Rutas: #menu, #menu/receta/nueva, #menu/receta/<id> y #menu/dieta (leer el PDF). */
export function PantallaMenu({ sub }: { sub: string | null }) {
  const { recetas, menu, error } = useRecetas();
  const { necesidades } = useNecesidades();

  if (error) {
    return (
      <>
        <h1>Menú</h1>
        <p class="aviso aviso--error" role="alert">
          <Icono nombre="alerta" tamano={20} />
          <span>{error}</span>
        </p>
      </>
    );
  }
  if (!recetas || !necesidades) return <h1>Menú</h1>;

  const [seccion, id] = sub?.split('/') ?? [];
  if (seccion === 'dieta') return <PantallaDieta />;
  if (seccion === 'receta' && id === 'nueva') {
    return <FormReceta key="nueva" necesidades={necesidades} />;
  }
  const existente = seccion === 'receta' ? recetas.find((r) => r.id === id) : undefined;
  if (existente) {
    return <FormReceta key={existente.id} existente={existente} necesidades={necesidades} />;
  }
  return (
    <>
      <h1>Menú</h1>
      <a class="boton boton--ancho boton-dieta" href="#menu/dieta">
        <Icono nombre="documento" tamano={20} /> Leer el PDF de la dieta
      </a>
      <MenuSemanal recetas={recetas} menu={menu} necesidades={necesidades} />
      <ListaRecetas recetas={recetas} necesidades={necesidades} />
    </>
  );
}

/** Botones − y + para un número pequeño. */
function Contador({
  valor,
  min = 1,
  max,
  etiqueta,
  alCambiar,
}: {
  valor: number;
  min?: number;
  max: number;
  etiqueta: string;
  alCambiar: (v: number) => void;
}) {
  return (
    <div class="contador">
      <span class="contador__etiqueta">{etiqueta}</span>
      <button
        type="button"
        class="contador__boton"
        aria-label={`${etiqueta}: uno menos`}
        disabled={valor <= min}
        onClick={() => alCambiar(valor - 1)}
      >
        −
      </button>
      <span class="contador__valor" aria-live="polite">
        {valor}
      </span>
      <button
        type="button"
        class="contador__boton"
        aria-label={`${etiqueta}: uno más`}
        disabled={valor >= max}
        onClick={() => alCambiar(valor + 1)}
      >
        +
      </button>
    </div>
  );
}

/** Qué platos se comen cada semana, cuántas veces y para cuántas personas. */
function MenuSemanal({
  recetas,
  menu,
  necesidades,
}: {
  recetas: Receta[];
  menu: PlatoMenu[];
  necesidades: Necesidad[];
}) {
  const [eligiendo, setEligiendo] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  const porId = new Map(recetas.map((r) => [r.id, r]));
  const platos = menu.filter((p) => porId.has(p.receta));
  const fuera = recetas
    .filter((r) => !menu.some((p) => p.receta === r.id))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));
  const aportes = aportesDelMenu(platos, recetas, necesidades);
  const gasto = necesidades
    .filter((n) => aportes.has(n.id))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  const guardar = (nuevo: PlatoMenu[]) => {
    setFallo(null);
    guardarMenu(nuevo).catch((e: unknown) => setFallo(falloDe(e)));
  };
  const cambiar = (receta: string, cambios: Partial<PlatoMenu>) =>
    guardar(menu.map((p) => (p.receta === receta ? { ...p, ...cambios } : p)));
  const anadir = (receta: string) => {
    // Para las mismas personas que el último plato añadido.
    const personas = platos.at(-1)?.personas ?? 1;
    guardar([...menu, { receta, veces: 1, personas }]);
    setEligiendo(false);
  };

  return (
    <>
      <h2 class="grupo__titulo">Menú de la semana</h2>
      {platos.length === 0 && (
        <p class="secundario">
          Elige qué platos comes cada semana y para cuántas personas. Sus ingredientes se sumarán a
          tu lista de la compra.
        </p>
      )}
      {fallo && (
        <p class="aviso aviso--error" role="alert">
          <Icono nombre="alerta" tamano={20} />
          <span>{fallo}</span>
        </p>
      )}
      {platos.length > 0 && (
        <ul class="filas tarjeta tarjeta--lista">
          {platos.map((p) => (
            <li key={p.receta} class="plato-menu">
              <div class="plato-menu__cabecera">
                <a href={`#menu/receta/${p.receta}`}>{porId.get(p.receta)?.nombre}</a>
                <button
                  type="button"
                  class="boton boton--pequeno"
                  onClick={() => guardar(menu.filter((x) => x.receta !== p.receta))}
                >
                  Quitar
                </button>
              </div>
              <Contador
                etiqueta="Veces a la semana"
                valor={p.veces}
                max={MAX_VECES}
                alCambiar={(veces) => cambiar(p.receta, { veces })}
              />
              <Contador
                etiqueta="Personas"
                valor={p.personas}
                max={MAX_PERSONAS}
                alCambiar={(personas) => cambiar(p.receta, { personas })}
              />
            </li>
          ))}
        </ul>
      )}

      {eligiendo ? (
        <section class="tarjeta">
          <h3 class="tienda__titulo">¿Qué plato añades?</h3>
          <ul class="filas">
            {fuera.map((r) => (
              <li key={r.id}>
                <button type="button" class="fila fila--compra" onClick={() => anadir(r.id)}>
                  <span class="fila__texto">
                    <span>{r.nombre}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <button type="button" class="boton boton--ancho" onClick={() => setEligiendo(false)}>
            Cancelar
          </button>
        </section>
      ) : (
        <div class="acciones">
          {fuera.length > 0 ? (
            <button
              type="button"
              class="boton boton--principal boton--ancho"
              onClick={() => setEligiendo(true)}
            >
              Añadir un plato al menú
            </button>
          ) : recetas.length === 0 ? (
            <p class="secundario">Primero añade las recetas de tus platos, aquí debajo.</p>
          ) : null}
          {platos.length > 0 && (
            <button
              type="button"
              class="boton boton--ancho"
              onClick={() => {
                if (confirm('¿Vaciar el menú?\n\nTus recetas se conservan para otros meses.')) {
                  guardar([]);
                }
              }}
            >
              Vaciar el menú (nueva dieta)
            </button>
          )}
        </div>
      )}

      {gasto.length > 0 && (
        <>
          <h2 class="grupo__titulo grupo__titulo--separado">Lo que gastas a la semana</h2>
          <ul class="filas tarjeta tarjeta--lista">
            {gasto.map((n) => {
              const aporte = aportes.get(n.id);
              return (
                <li key={n.id}>
                  <a class="fila fila--enlace" href={`#necesidades/${n.id}`}>
                    <div class="fila__texto">
                      <span>{n.nombre}</span>
                      <span class="secundario">
                        {aporte?.platos.map((x) => x.receta.nombre).join(', ')}
                      </span>
                    </div>
                    <span class="fila__importe">
                      {aporte ? textoCantidad(redondearTexto(aporte.semanal), n.unidad) : ''}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
          <p class="secundario">
            Se suma a lo que gastas aparte. La lista de la compra lo tiene en cuenta.
          </p>
        </>
      )}
    </>
  );
}

/** 333,333333 g → 333,3 g para mostrarlo. */
const redondearTexto = (n: number) => Math.round(n * 10) / 10;

function ListaRecetas({ recetas, necesidades }: { recetas: Receta[]; necesidades: Necesidad[] }) {
  const porId = new Map(necesidades.map((n) => [n.id, n]));
  const ordenadas = [...recetas].sort((a, b) =>
    a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }),
  );
  // Ingredientes que todavía no tienen producto elegido en ninguna tienda.
  const sinProducto = [...new Set(recetas.flatMap((r) => r.ingredientes.map((i) => i.necesidad)))]
    .map((id) => porId.get(id))
    .filter((n): n is Necesidad => !!n && !conProducto(n))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  return (
    <>
      <h2 class="grupo__titulo grupo__titulo--separado">Mis recetas</h2>
      <p class="secundario">
        Apunta los platos de tu dieta con sus ingredientes. Cada ingrediente es una necesidad: en
        Necesidades eliges qué producto compras de cada tienda, como siempre.
      </p>
      {sinProducto.length > 0 && (
        <p class="aviso aviso--atencion">
          <Icono nombre="alerta" tamano={20} />
          <span>
            Ingredientes sin producto elegido en ninguna tienda:{' '}
            {sinProducto.map((n, i) => (
              <span key={n.id}>
                {i > 0 && ', '}
                <a href={`#necesidades/${n.id}`}>{n.nombre}</a>
              </span>
            ))}
            .
          </span>
        </p>
      )}
      {ordenadas.length === 0 ? (
        <section class="tarjeta">
          <p class="secundario">
            Todavía no hay ninguna. Por ejemplo: «Paella», 2 raciones, con 160 g de arroz, 300 g de
            pollo y 200 g de judía verde.
          </p>
        </section>
      ) : (
        <ul class="filas tarjeta tarjeta--lista">
          {ordenadas.map((r) => (
            <li key={r.id}>
              <a class="fila fila--enlace" href={`#menu/receta/${r.id}`}>
                <div class="fila__texto">
                  <span>{r.nombre}</span>
                  <span class="secundario">
                    {r.raciones === 1 ? '1 ración' : `${r.raciones} raciones`} ·{' '}
                    {r.ingredientes
                      .map((i) => porId.get(i.necesidad)?.nombre)
                      .filter(Boolean)
                      .join(', ') || 'sin ingredientes'}
                  </span>
                </div>
                <span class="fila__flecha" aria-hidden="true">
                  ›
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
      <div class="acciones">
        <a class="boton boton--principal boton--ancho" href="#menu/receta/nueva">
          Añadir receta
        </a>
      </div>
    </>
  );
}

/** Un ingrediente mientras se edita la receta: de una necesidad que ya existe o de una nueva. */
type IngredienteBorrador = {
  clave: string;
  necesidad?: string;
  /** Nombre de la necesidad nueva que se creará al guardar. */
  nueva?: string;
  cantidad: number;
  unidad: UnidadNecesidad;
};

function FormReceta({ existente, necesidades }: { existente?: Receta; necesidades: Necesidad[] }) {
  const porId = useMemo(() => new Map(necesidades.map((n) => [n.id, n])), [necesidades]);
  const [nombre, setNombre] = useState(existente?.nombre ?? '');
  const [racionesTexto, setRacionesTexto] = useState(String(existente?.raciones ?? 2));
  const [ingredientes, setIngredientes] = useState<IngredienteBorrador[]>(
    (existente?.ingredientes ?? [])
      .filter((i) => porId.has(i.necesidad))
      .map((i) => ({ ...i, clave: i.necesidad })),
  );
  const [editando, setEditando] = useState<string | null>(existente ? null : 'nuevo');
  const [errores, setErrores] = useState<ErroresReceta>({});
  const [fallo, setFallo] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const raciones = /^\d+$/.test(racionesTexto.trim()) ? Number(racionesTexto) : null;
  const nombreDe = (i: IngredienteBorrador) =>
    i.nueva ?? (i.necesidad ? porId.get(i.necesidad)?.nombre : undefined) ?? '';

  const alGuardar = async (evento: Event) => {
    evento.preventDefault();
    const nuevosErrores = validarReceta({ nombre, raciones, ingredientes });
    setErrores(nuevosErrores);
    if (Object.keys(nuevosErrores).length > 0 || raciones === null) return;
    setGuardando(true);
    setFallo(null);
    const ahora = new Date().toISOString();
    const nuevas: Necesidad[] = [];
    const receta: Receta = {
      id: existente?.id ?? crypto.randomUUID(),
      nombre: nombre.trim(),
      raciones,
      ingredientes: ingredientes.map((i) => {
        let id = i.necesidad;
        if (!id) {
          const n = necesidadParaIngrediente(i.nueva ?? '', i.unidad, ahora, crypto.randomUUID());
          nuevas.push(n);
          id = n.id;
        }
        return { necesidad: id, cantidad: i.cantidad, unidad: i.unidad };
      }),
      creada: existente?.creada ?? ahora,
      actualizada: ahora,
    };
    if (existente?.notas) receta.notas = existente.notas;
    try {
      await guardarReceta(receta, nuevas);
      ir('menu');
    } catch (e) {
      setFallo(falloDe(e));
      setGuardando(false);
    }
  };

  const alBorrar = async () => {
    if (
      !existente ||
      !confirm(
        `¿Borrar la receta «${existente.nombre}»?\n\nLos ingredientes siguen en tus necesidades.`,
      )
    )
      return;
    try {
      await borrarReceta(existente.id);
      ir('menu');
    } catch (e) {
      setFallo(falloDe(e));
    }
  };

  const guardarIngrediente = (i: IngredienteBorrador) => {
    setIngredientes((todos) =>
      todos.some((x) => x.clave === i.clave)
        ? todos.map((x) => (x.clave === i.clave ? i : x))
        : [...todos, i],
    );
    setEditando(null);
    if (errores.ingredientes) setErrores({ ...errores, ingredientes: undefined });
  };

  return (
    <form onSubmit={alGuardar} noValidate>
      <a class="volver" href="#menu">
        ‹ Menú
      </a>
      <h1>{existente ? 'Editar receta' : 'Nueva receta'}</h1>

      <div class="campo">
        <label class="campo__etiqueta" for="nombre-receta">
          Plato
        </label>
        <input
          id="nombre-receta"
          class={errores.nombre ? 'entrada entrada--error' : 'entrada'}
          type="text"
          placeholder="Paella"
          autocomplete="off"
          enterkeyhint="next"
          value={nombre}
          onInput={(e) => {
            setNombre(e.currentTarget.value);
            if (errores.nombre) setErrores({ ...errores, nombre: undefined });
          }}
        />
        {errores.nombre && <p class="campo__error">{errores.nombre}</p>}
      </div>

      <div class="campo">
        <label class="campo__etiqueta" for="raciones-receta">
          Raciones que salen
        </label>
        <input
          id="raciones-receta"
          class={errores.raciones ? 'entrada entrada--error' : 'entrada'}
          type="text"
          inputmode="numeric"
          autocomplete="off"
          value={racionesTexto}
          onInput={(e) => {
            setRacionesTexto(e.currentTarget.value);
            if (errores.raciones) setErrores({ ...errores, raciones: undefined });
          }}
        />
        {errores.raciones && <p class="campo__error">{errores.raciones}</p>}
      </div>

      <h2 class="grupo__titulo grupo__titulo--separado">Ingredientes</h2>
      <p class="secundario">Escribe las cantidades para todas las raciones, tal como lo compras.</p>
      {ingredientes.length > 0 && (
        <ul class="filas tarjeta tarjeta--lista">
          {ingredientes.map((i) =>
            editando === i.clave ? null : (
              <li key={i.clave}>
                <button
                  type="button"
                  class="fila fila--compra"
                  onClick={() => setEditando(i.clave)}
                >
                  <span class="fila__texto">
                    <span>{nombreDe(i)}</span>
                    {i.nueva ? (
                      <span class="secundario">Nueva: se añadirá a tus necesidades</span>
                    ) : (
                      i.necesidad &&
                      porId.get(i.necesidad) &&
                      !conProducto(porId.get(i.necesidad) as Necesidad) && (
                        <span class="secundario">Sin producto elegido en ninguna tienda</span>
                      )
                    )}
                  </span>
                  <span class="fila__importe">{textoCantidad(i.cantidad, i.unidad)}</span>
                </button>
              </li>
            ),
          )}
        </ul>
      )}
      {errores.ingredientes && <p class="campo__error">{errores.ingredientes}</p>}

      {editando !== null ? (
        <EditorIngrediente
          key={editando}
          inicial={ingredientes.find((i) => i.clave === editando)}
          necesidades={necesidades}
          enUso={ingredientes.filter((i) => i.clave !== editando)}
          nombreDe={nombreDe}
          alGuardar={guardarIngrediente}
          alQuitar={
            ingredientes.some((i) => i.clave === editando)
              ? () => {
                  setIngredientes((todos) => todos.filter((x) => x.clave !== editando));
                  setEditando(null);
                }
              : undefined
          }
          alCancelar={() => setEditando(null)}
        />
      ) : (
        <button type="button" class="boton boton--ancho" onClick={() => setEditando('nuevo')}>
          Añadir ingrediente
        </button>
      )}

      {fallo && (
        <p class="aviso aviso--error" role="alert">
          <Icono nombre="alerta" tamano={20} />
          <span>{fallo}</span>
        </p>
      )}

      <div class="acciones">
        <button
          type="submit"
          class="boton boton--principal boton--ancho"
          disabled={guardando || editando !== null}
        >
          {guardando ? 'Guardando…' : existente ? 'Guardar cambios' : 'Guardar la receta'}
        </button>
        {editando !== null && (
          <p class="secundario">Termina antes el ingrediente que estás escribiendo.</p>
        )}
        <a class="boton boton--ancho" href="#menu">
          Cancelar
        </a>
        {existente && (
          <button
            type="button"
            class="boton boton--peligro boton--ancho"
            onClick={() => void alBorrar()}
          >
            Borrar la receta
          </button>
        )}
      </div>
    </form>
  );
}

function EditorIngrediente({
  inicial,
  necesidades,
  enUso,
  nombreDe,
  alGuardar,
  alQuitar,
  alCancelar,
}: {
  inicial?: IngredienteBorrador;
  necesidades: Necesidad[];
  enUso: IngredienteBorrador[];
  nombreDe: (i: IngredienteBorrador) => string;
  alGuardar: (i: IngredienteBorrador) => void;
  alQuitar?: () => void;
  alCancelar: () => void;
}) {
  const [texto, setTexto] = useState('');
  const [elegida, setElegida] = useState<{ necesidad?: Necesidad; nueva?: string } | null>(
    inicial
      ? inicial.necesidad
        ? { necesidad: necesidades.find((n) => n.id === inicial.necesidad) }
        : { nueva: inicial.nueva }
      : null,
  );
  const [cantidadTexto, setCantidadTexto] = useState(
    inicial ? escribirCantidad(inicial.cantidad) : '',
  );
  const [unidad, setUnidad] = useState<UnidadNecesidad>(inicial?.unidad ?? 'g');
  const [error, setError] = useState<string | null>(null);

  const usadas = new Set(enUso.map((i) => normalizar(nombreDe(i)).trim()));
  const sugeridas = sugerirNecesidades(texto, necesidades).filter(
    (n) => !usadas.has(normalizar(n.nombre).trim()),
  );
  const exacta = necesidades.find((n) => normalizar(n.nombre).trim() === normalizar(texto).trim());
  const unidades: readonly UnidadNecesidad[] = elegida?.necesidad
    ? unidadesCompatibles(elegida.necesidad.unidad)
    : UNIDADES_INGREDIENTE;
  const opcionesUnidad = OPCIONES_UNIDAD.filter((o) => unidades.includes(o.valor));

  const elegir = (e: { necesidad?: Necesidad; nueva?: string }) => {
    setElegida(e);
    setError(null);
    const base = e.necesidad?.unidad;
    if (base) setUnidad(base === 'kg' ? 'g' : base === 'l' ? 'ml' : base);
  };

  const guardar = () => {
    const cantidad = leerCantidad(cantidadTexto);
    if (!elegida) return setError('Elige o escribe el ingrediente.');
    if (cantidad === null) return setError('Escribe la cantidad, por ejemplo 160.');
    if (!unidades.includes(unidad)) return setError('Elige la unidad.');
    alGuardar({
      clave: inicial?.clave ?? crypto.randomUUID(),
      ...(elegida.necesidad ? { necesidad: elegida.necesidad.id } : { nueva: elegida.nueva }),
      cantidad,
      unidad,
    });
  };

  const nombreElegido = elegida?.necesidad?.nombre ?? elegida?.nueva;

  return (
    <section class="tarjeta editor-ingrediente">
      <h3 class="tienda__titulo">{inicial ? 'Cambiar ingrediente' : 'Nuevo ingrediente'}</h3>
      {nombreElegido ? (
        <div class="tienda__no-compro">
          <span>
            <strong>{nombreElegido}</strong>
            {elegida?.necesidad && (
              <span class="secundario"> · {textoNecesidad(elegida.necesidad)}</span>
            )}
            {elegida?.nueva && <span class="secundario"> · nueva necesidad</span>}
          </span>
          {!inicial && (
            <button
              type="button"
              class="boton boton--pequeno"
              onClick={() => {
                setTexto(nombreElegido);
                setElegida(null);
              }}
            >
              Cambiar
            </button>
          )}
        </div>
      ) : (
        <>
          <div class="campo">
            <label class="campo__etiqueta" for="ingrediente">
              Ingrediente
            </label>
            <input
              id="ingrediente"
              class="entrada"
              type="text"
              placeholder="Arroz"
              autocomplete="off"
              enterkeyhint="done"
              value={texto}
              onInput={(e) => {
                setTexto(e.currentTarget.value);
                setError(null);
              }}
            />
          </div>
          {texto.trim() && (
            <ul class="filas tarjeta tarjeta--lista sugerencias">
              {sugeridas.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    class="fila fila--compra"
                    onClick={() => elegir({ necesidad: n })}
                  >
                    <span class="fila__texto">
                      <span>{n.nombre}</span>
                      <span class="secundario">{textoNecesidad(n)}</span>
                    </span>
                  </button>
                </li>
              ))}
              {!exacta && !usadas.has(normalizar(texto).trim()) && (
                <li>
                  <button
                    type="button"
                    class="fila fila--compra"
                    onClick={() => elegir({ nueva: texto.trim().slice(0, 80) })}
                  >
                    <span class="fila__texto">
                      <span>Añadir «{texto.trim()}»</span>
                      <span class="secundario">Como necesidad nueva, solo para tus recetas</span>
                    </span>
                  </button>
                </li>
              )}
            </ul>
          )}
        </>
      )}

      {nombreElegido && (
        <>
          <div class="campo">
            <label class="campo__etiqueta" for="cantidad-ingrediente">
              Cantidad para todas las raciones
            </label>
            <input
              id="cantidad-ingrediente"
              class="entrada"
              type="text"
              inputmode="decimal"
              placeholder={unidad === 'ud' ? '2' : '160'}
              autocomplete="off"
              value={cantidadTexto}
              onInput={(e) => {
                setCantidadTexto(e.currentTarget.value);
                setError(null);
              }}
            />
          </div>
          <Opciones
            nombre="unidad-ingrediente"
            etiqueta="Unidad"
            opciones={opcionesUnidad}
            valor={unidad}
            alCambiar={setUnidad}
            columnas={Math.min(opcionesUnidad.length, 4)}
          />
        </>
      )}
      {error && <p class="campo__error">{error}</p>}
      <div class="acciones">
        {nombreElegido && (
          <button type="button" class="boton boton--principal boton--ancho" onClick={guardar}>
            {inicial ? 'Guardar ingrediente' : 'Añadir a la receta'}
          </button>
        )}
        {alQuitar && (
          <button type="button" class="boton boton--peligro boton--ancho" onClick={alQuitar}>
            Quitar de la receta
          </button>
        )}
        <button type="button" class="boton boton--ancho" onClick={alCancelar}>
          Cancelar
        </button>
      </div>
    </section>
  );
}
