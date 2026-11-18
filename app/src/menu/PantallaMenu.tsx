import { useMemo, useState } from 'preact/hooks';
import { Contador } from '../componentes/Contador.tsx';
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
import { PantallaDieta } from './dieta/PantallaDieta.tsx';
import type { DatosApp } from '../tipos.ts';
import { borrarReceta, guardarMenu, guardarReceta, useRecetas } from './estado.ts';
import {
  COMIDAS,
  comidasDelDia,
  DIAS_SEMANA,
  diaDeLaSemana,
  MAX_PERSONAS,
  MAX_PLATOS_DIA,
  menuSinPlatos,
  menuVacio,
  nombrePlato,
  type Menu,
  type PlatoDia,
} from './menu.ts';
import { hoyEnEspana } from '../formato.ts';
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

/**
 * Rutas: #menu, #menu/receta/nueva, #menu/receta/<id>, #menu/dieta (leer el PDF) y
 * #menu/dieta/receta/<plato> (crear la receta de un plato de la dieta).
 */
export function PantallaMenu({ sub, datos }: { sub: string | null; datos: DatosApp | null }) {
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
  if (seccion === 'dieta') return <PantallaDieta datos={datos} />;
  if (seccion === 'recetas') return <ListaRecetas recetas={recetas} necesidades={necesidades} />;
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
      <MenuPorDias recetas={recetas} menu={menu} />
      <a class="boton boton--ancho boton-recetas" href="#menu/recetas">
        Mis recetas ({recetas.length})
      </a>
    </>
  );
}

/** El menú de la semana, de lunes a domingo: en cada día, sus comidas y sus platos. */
function MenuPorDias({ recetas, menu }: { recetas: Receta[]; menu: Menu }) {
  const [abierto, setAbierto] = useState<string | null>(null);
  const [anadiendo, setAnadiendo] = useState<number | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const porId = new Map(recetas.map((r) => [r.id, r]));
  const hoy = diaDeLaSemana(hoyEnEspana());
  const vacio = menuSinPlatos(menu);

  const guardar = (nuevo: Menu) => {
    setFallo(null);
    guardarMenu(nuevo).catch((e: unknown) => setFallo(falloDe(e)));
  };
  const cambiarDia = (dia: number, platos: PlatoDia[]) =>
    guardar({ ...menu, dias: menu.dias.map((p, d) => (d === dia ? platos : p)) });

  return (
    <>
      <section class="tarjeta">
        <Contador
          etiqueta="Personas que comen cada plato"
          valor={menu.personas}
          max={MAX_PERSONAS}
          alCambiar={(personas) => guardar({ ...menu, personas })}
        />
      </section>
      {vacio && (
        <p class="secundario">
          Aún no hay platos. Lee el PDF de tu dieta o añade los platos de cada día. Sus ingredientes
          se sumarán a tu lista de la compra.
        </p>
      )}
      {fallo && (
        <p class="aviso aviso--error" role="alert">
          <Icono nombre="alerta" tamano={20} />
          <span>{fallo}</span>
        </p>
      )}
      {DIAS_SEMANA.map((nombreDia, dia) => {
        const platos = menu.dias[dia] ?? [];
        return (
          <section
            key={nombreDia}
            class={dia === hoy ? 'tarjeta dia-menu dia-menu--hoy' : 'tarjeta dia-menu'}
          >
            <h2 class="dia-menu__titulo">
              {nombreDia}
              {dia === hoy && <span class="dia-menu__hoy">Hoy</span>}
            </h2>
            {platos.length === 0 && anadiendo !== dia && <p class="secundario">Sin platos.</p>}
            {comidasDelDia(platos).map((g) => (
              <div key={g.comida} class="dia-menu__comida">
                {g.comida && <h3 class="dia-menu__nombre-comida">{g.comida}</h3>}
                <ul class="dia-menu__platos">
                  {g.platos.map(({ plato, indice }) => {
                    const clave = `${dia}-${indice}`;
                    const receta = plato.receta ? porId.get(plato.receta) : undefined;
                    return (
                      <li key={clave}>
                        <button
                          type="button"
                          class="dia-menu__plato"
                          aria-expanded={abierto === clave}
                          onClick={() => setAbierto(abierto === clave ? null : clave)}
                        >
                          <span>{nombrePlato(plato, porId)}</span>
                          {!receta && <span class="secundario">No se compra nada</span>}
                        </button>
                        {abierto === clave && (
                          <div class="dia-menu__acciones">
                            {receta && (
                              <a class="boton boton--pequeno" href={`#menu/receta/${receta.id}`}>
                                Ver la receta
                              </a>
                            )}
                            <button
                              type="button"
                              class="boton boton--pequeno"
                              onClick={() => {
                                setAbierto(null);
                                cambiarDia(
                                  dia,
                                  platos.filter((_, i) => i !== indice),
                                );
                              }}
                            >
                              Quitar de este día
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            {anadiendo === dia ? (
              <AnadirPlato
                recetas={recetas}
                alAnadir={(plato) => {
                  cambiarDia(dia, [...platos, plato]);
                  setAnadiendo(null);
                }}
                alCancelar={() => setAnadiendo(null)}
              />
            ) : (
              platos.length < MAX_PLATOS_DIA && (
                <button
                  type="button"
                  class="boton boton--pequeno dia-menu__anadir"
                  onClick={() => {
                    setAbierto(null);
                    setAnadiendo(dia);
                  }}
                >
                  + Añadir un plato
                </button>
              )
            )}
          </section>
        );
      })}
      {!vacio && (
        <div class="acciones">
          <button
            type="button"
            class="boton boton--ancho"
            onClick={() => {
              if (confirm('¿Vaciar el menú?\n\nTus recetas se conservan para otros meses.')) {
                guardar(menuVacio(menu.personas));
              }
            }}
          >
            Vaciar el menú (nueva dieta)
          </button>
        </div>
      )}
    </>
  );
}

/** Elegir la comida y la receta del plato que se añade a un día. */
function AnadirPlato({
  recetas,
  alAnadir,
  alCancelar,
}: {
  recetas: Receta[];
  alAnadir: (plato: PlatoDia) => void;
  alCancelar: () => void;
}) {
  const [comida, setComida] = useState<string>('Comida');
  const ordenadas = [...recetas].sort((a, b) =>
    a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }),
  );
  return (
    <div class="dia-menu__anadiendo">
      <Opciones
        nombre="comida"
        etiqueta="¿En qué comida?"
        opciones={COMIDAS.map((c) => ({ valor: c, texto: c }))}
        valor={comida}
        alCambiar={setComida}
        columnas={3}
      />
      {ordenadas.length === 0 ? (
        <p class="secundario">
          Primero añade la receta del plato en <a href="#menu/recetas">Mis recetas</a>.
        </p>
      ) : (
        <>
          <p class="campo__etiqueta">¿Qué plato?</p>
          <ul class="filas elegir-receta__lista">
            {ordenadas.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  class="fila fila--compra"
                  onClick={() => alAnadir({ comida, nombre: '', receta: r.id })}
                >
                  <span class="fila__texto">
                    <span>{r.nombre}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <button type="button" class="boton boton--ancho" onClick={alCancelar}>
        Cancelar
      </button>
    </div>
  );
}

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
      <a class="volver" href="#menu">
        ‹ Menú
      </a>
      <h1>Mis recetas</h1>
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
  const volver = '#menu/recetas';
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
    if (existente?.alias && existente.alias.length > 0) receta.alias = existente.alias;
    try {
      await guardarReceta(receta, nuevas);
      ir('menu/recetas');
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
      ir('menu/recetas');
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
      <a class="volver" href={volver}>
        ‹ Mis recetas
      </a>
      <h1>{existente ? 'Editar receta' : 'Nueva receta'}</h1>
      {existente?.alias && existente.alias.length > 0 && (
        <p class="secundario">
          En el PDF de la dieta: {existente.alias.map((a) => `«${a}»`).join(', ')}.
        </p>
      )}

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
        <a class="boton boton--ancho" href={volver}>
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

/** g para lo que va en kg y ml para lo que va en litros: así se escriben las recetas. */
const unidadParaReceta = (base: UnidadNecesidad): UnidadNecesidad =>
  base === 'kg' ? 'g' : base === 'l' ? 'ml' : base;

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
    // Se respeta la unidad ya puesta (la del plato) si encaja con la necesidad.
    if (base && !unidadesCompatibles(base).includes(unidad)) setUnidad(unidadParaReceta(base));
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
