import { useMemo, useState } from 'preact/hooks';
import { Contador } from '../../componentes/Contador.tsx';
import { Icono } from '../../componentes/Icono.tsx';
import { asignarPlato, guardarMenu, useRecetas } from '../estado.ts';
import { MAX_PERSONAS, menuSinPlatos, platosConReceta } from '../menu.ts';
import type { Receta } from '../recetas.ts';
import {
  cambiarRevision,
  empezarRevision,
  revisionActual,
  terminarRevision,
  type Revision,
} from './estado.ts';
import { leerDieta, resumirDieta, type Dieta } from './leer.ts';
import { ErrorPdf, leerPdf } from './pdf.ts';
import {
  decisionDe,
  menuDeLaDieta,
  recetasParecidas,
  vecesDe,
  type Decision,
  type GrupoRevision,
  type PlatoRevision,
} from './revision.ts';

type Estado =
  | { tipo: 'inicio' }
  | { tipo: 'leyendo' }
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'leido'; revision: Revision };

const ir = (ruta: string) => {
  location.hash = ruta;
};
const falloDe = (error: unknown) =>
  `No se ha podido guardar (${error instanceof Error ? error.message : String(error)}).`;

/** «Lunes, comida», «Martes, cena» → «lunes comida, martes cena». */
const cuandoTexto = (cuando: string[]) =>
  cuando.map((c) => c.toLowerCase().replace(',', '')).join(', ');

const vecesTexto = (veces: number) => (veces === 1 ? '1 vez' : `${veces} veces`);
const platosTexto = (n: number) => (n === 1 ? '1 plato' : `${n} platos`);

/** «a», «a y b», «a, b y c». */
const enumerar = (cosas: string[]) =>
  cosas.length <= 1 ? (cosas[0] ?? '') : `${cosas.slice(0, -1).join(', ')} y ${cosas.at(-1) ?? ''}`;

const porNombre = (a: Receta, b: Receta) =>
  a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' });

/**
 * #menu/dieta: lee el PDF de la dieta, ayuda a decir qué receta es cada plato y sustituye el
 * menú de la semana. El PDF no se guarda.
 */
export function PantallaDieta() {
  const [estado, setEstado] = useState<Estado>(() => {
    const actual = revisionActual();
    return actual ? { tipo: 'leido', revision: actual } : { tipo: 'inicio' };
  });

  const elegir = (archivo: File | undefined) => {
    if (!archivo) return;
    setEstado({ tipo: 'leyendo' });
    archivo
      .arrayBuffer()
      .then(leerPdf)
      .then((paginas) =>
        setEstado({ tipo: 'leido', revision: empezarRevision(leerDieta(paginas)) }),
      )
      .catch((e: unknown) => {
        const mensaje =
          e instanceof ErrorPdf
            ? e.message
            : `No se ha podido leer el PDF (${e instanceof Error ? e.message : String(e)}). Si es la primera vez, comprueba que tienes conexión: hace falta descargar el lector.`;
        setEstado({ tipo: 'error', mensaje });
      });
  };

  return (
    <>
      <a class="volver" href="#menu">
        ‹ Menú
      </a>
      <h1>Leer la dieta</h1>
      {estado.tipo !== 'leido' && (
        <p class="secundario">
          Elige el PDF de la dieta que te manda tu nutricionista. Se lee dentro de este iPhone: no
          se envía a ningún sitio ni se guarda. Después dirás qué receta es cada plato y la app
          preparará tu menú de la semana.
        </p>
      )}
      {estado.tipo === 'leyendo' && (
        <p class="aviso aviso--info" role="status">
          <Icono nombre="recargar" tamano={20} />
          <span>Leyendo el PDF… La primera vez tarda algo más porque descarga el lector.</span>
        </p>
      )}
      {estado.tipo === 'error' && (
        <p class="aviso aviso--error" role="alert">
          <Icono nombre="alerta" tamano={20} />
          <span>{estado.mensaje}</span>
        </p>
      )}
      {estado.tipo === 'leido' && <Resultado revision={estado.revision} />}
      {estado.tipo !== 'leyendo' && (
        <label
          class={
            estado.tipo === 'leido'
              ? 'boton boton--ancho elegir-pdf'
              : 'boton boton--principal boton--ancho elegir-pdf'
          }
        >
          <Icono nombre="documento" tamano={20} />{' '}
          {estado.tipo === 'leido' ? 'Leer otro PDF' : 'Elegir el PDF'}
          <input
            type="file"
            accept="application/pdf,.pdf"
            class="elegir-pdf__entrada"
            onChange={(e) => {
              elegir(e.currentTarget.files?.[0]);
              e.currentTarget.value = '';
            }}
          />
        </label>
      )}
    </>
  );
}

function Resultado({ revision }: { revision: Revision }) {
  const { lectura } = revision;
  if (lectura.tipo === 'sin-texto') {
    return (
      <p class="aviso aviso--atencion" role="alert">
        <Icono nombre="alerta" tamano={20} />
        <span>
          Este PDF no tiene texto (parece una foto o un documento escaneado), así que no se puede
          leer. Puedes apuntar tus platos a mano en el menú.
        </span>
      </p>
    );
  }
  if (lectura.tipo === 'lineas') {
    return (
      <>
        <p class="aviso aviso--atencion">
          <Icono nombre="alerta" tamano={20} />
          <span>
            No he encontrado la tabla de la semana (los días en columnas), así que te enseño las
            líneas con viñeta del PDF. Pon cuántas veces a la semana tomas cada plato; lo que no sea
            un plato, déjalo en 0.
          </span>
        </p>
        {revision.grupos.length > 0 ? (
          <RevisarPlatos revision={revision} />
        ) : (
          <p class="secundario">No hay ninguna.</p>
        )}
      </>
    );
  }
  const resumen = resumirDieta(lectura.dieta);
  return (
    <>
      <p class="aviso aviso--bien" role="status">
        <Icono nombre="hecho" tamano={20} />
        <span>
          He leído la semana: {resumen.platos.length}{' '}
          {resumen.platos.length === 1 ? 'plato distinto' : 'platos distintos'}
          {resumen.opciones.length > 0 &&
            ` y opciones para ${enumerar(resumen.opciones.map((o) => o.comida.toLowerCase()))}`}
          . Toca cada plato para decir qué receta es.
        </span>
      </p>
      <RevisarPlatos revision={revision} />
      {resumen.libres.length > 0 && (
        <p class="secundario">
          {resumen.libres.length === 1 ? 'Comida libre' : 'Comidas libres'} (no se compra nada para{' '}
          {resumen.libres.length === 1 ? 'ella' : 'ellas'}):{' '}
          {enumerar(resumen.libres.map((l) => l.toLowerCase().replace(',', '')))}.
        </p>
      )}
      <SemanaDiaADia dieta={lectura.dieta} />
    </>
  );
}

/** Cada plato con su receta, las veces de las opciones, las personas y «Usar este menú». */
function RevisarPlatos({ revision }: { revision: Revision }) {
  const { recetas, menu, sinCompra } = useRecetas();
  const [veces, setVeces] = useState(revision.veces);
  const [personas, setPersonas] = useState(revision.personas ?? menu.personas);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  if (!recetas) return null;

  const libres =
    revision.lectura.tipo === 'tabla' ? resumirDieta(revision.lectura.dieta).libresEn : [];
  const resultado = menuDeLaDieta(revision.grupos, veces, recetas, sinCompra, personas, libres);
  const conReceta = platosConReceta(resultado.menu);
  const hayMenu = !menuSinPlatos(menu);
  const cambiarVeces = (id: string, v: number) => {
    const nuevas = { ...veces, [id]: v };
    setVeces(nuevas);
    cambiarRevision({ veces: nuevas });
  };
  const cambiarPersonas = (p: number) => {
    setPersonas(p);
    cambiarRevision({ personas: p });
  };

  const usar = async () => {
    const sustituye = hayMenu ? ' Sustituye al que tienes ahora.' : '';
    if (
      !confirm(
        `¿Usar este menú?\n\nTendrá ${platosTexto(conReceta)} con ingredientes que comprar, de lunes a domingo.${sustituye} Tus recetas se conservan.`,
      )
    ) {
      return;
    }
    setGuardando(true);
    setFallo(null);
    try {
      await guardarMenu(resultado.menu);
      terminarRevision();
      ir('menu');
    } catch (e) {
      setFallo(falloDe(e));
      setGuardando(false);
    }
  };

  return (
    <>
      {revision.grupos.map((g) => (
        <GrupoPlatos
          key={g.titulo}
          grupo={g}
          veces={veces}
          recetas={recetas}
          sinCompra={sinCompra}
          abierto={abierto}
          alAbrir={setAbierto}
          alCambiarVeces={cambiarVeces}
        />
      ))}

      <section class="tarjeta">
        <Contador
          etiqueta="Personas que comen cada plato"
          valor={personas}
          max={MAX_PERSONAS}
          alCambiar={cambiarPersonas}
        />
      </section>

      {resultado.pendientes.length > 0 ? (
        <p class="aviso aviso--atencion">
          <Icono nombre="alerta" tamano={20} />
          <span>
            Te falta decir la receta de{' '}
            {resultado.pendientes.length === 1
              ? '1 plato'
              : `${resultado.pendientes.length} platos`}{' '}
            (o que no se compra nada para {resultado.pendientes.length === 1 ? 'él' : 'ellos'}).
          </span>
        </p>
      ) : (
        <p class="secundario">
          Tu menú, de lunes a domingo, tendrá {platosTexto(conReceta)} con ingredientes que comprar,
          para {personas === 1 ? '1 persona' : `${personas} personas`}.
          {hayMenu && ' Sustituirá al que tienes ahora; tus recetas se conservan.'}
        </p>
      )}
      {fallo && (
        <p class="aviso aviso--error" role="alert">
          <Icono nombre="alerta" tamano={20} />
          <span>{fallo}</span>
        </p>
      )}
      <div class="acciones">
        <button
          type="button"
          class="boton boton--principal boton--ancho"
          disabled={guardando || resultado.pendientes.length > 0 || menuSinPlatos(resultado.menu)}
          onClick={() => void usar()}
        >
          {guardando ? 'Guardando…' : 'Usar este menú'}
        </button>
      </div>
    </>
  );
}

function GrupoPlatos({
  grupo,
  veces,
  recetas,
  sinCompra,
  abierto,
  alAbrir,
  alCambiarVeces,
}: {
  grupo: GrupoRevision;
  veces: Record<string, number>;
  recetas: Receta[];
  sinCompra: string[];
  abierto: string | null;
  alAbrir: (id: string | null) => void;
  alCambiarVeces: (id: string, v: number) => void;
}) {
  const suma = grupo.platos.reduce((s, p) => s + vecesDe(p, veces), 0);
  return (
    <section class="grupo">
      <h2 class="grupo__titulo">{grupo.titulo}</h2>
      {grupo.dias !== undefined && (
        <p class="secundario">
          ¿Cuántos días tomas cada opción? Ahora suman {suma} de {grupo.dias}.
        </p>
      )}
      <ul class="filas tarjeta tarjeta--lista">
        {grupo.platos.map((p) => (
          <PlatoDieta
            key={p.id}
            plato={p}
            maxVeces={grupo.maxVeces}
            veces={vecesDe(p, veces)}
            decision={decisionDe(p.texto, recetas, sinCompra)}
            recetas={recetas}
            abierto={abierto === p.id}
            alAbrir={(si) => alAbrir(si ? p.id : null)}
            alCambiarVeces={(v) => alCambiarVeces(p.id, v)}
          />
        ))}
      </ul>
    </section>
  );
}

function EstadoPlato({ decision }: { decision: Decision }) {
  if (decision.tipo === 'receta') {
    return <span class="texto--bien">Receta: {decision.receta.nombre}</span>;
  }
  if (decision.tipo === 'sin-compra') return <span class="secundario">No se compra nada</span>;
  return <span class="texto--atencion">Falta decir qué receta es</span>;
}

function PlatoDieta({
  plato,
  maxVeces,
  veces,
  decision,
  recetas,
  abierto,
  alAbrir,
  alCambiarVeces,
}: {
  plato: PlatoRevision;
  maxVeces: number;
  veces: number;
  decision: Decision;
  recetas: Receta[];
  abierto: boolean;
  alAbrir: (si: boolean) => void;
  alCambiarVeces: (v: number) => void;
}) {
  return (
    <li class="plato-dieta">
      <button
        type="button"
        class="fila fila--compra plato-dieta__fila"
        aria-expanded={abierto}
        onClick={() => alAbrir(!abierto)}
      >
        <span class="fila__texto">
          <span>{plato.texto}</span>
          {plato.cuando && (
            <span class="secundario">
              {vecesTexto(plato.veces)}: {cuandoTexto(plato.cuando)}
            </span>
          )}
          {(veces > 0 || plato.fijo) && <EstadoPlato decision={decision} />}
        </span>
        <span class="fila__flecha" aria-hidden="true">
          {abierto ? '⌄' : '›'}
        </span>
      </button>
      {!plato.fijo && (
        <div class="plato-dieta__veces">
          <Contador
            etiqueta="Veces a la semana"
            min={0}
            valor={veces}
            max={maxVeces}
            alCambiar={alCambiarVeces}
          />
        </div>
      )}
      {abierto && (
        <ElegirReceta
          plato={plato}
          decision={decision}
          recetas={recetas}
          alTerminar={() => alAbrir(false)}
        />
      )}
    </li>
  );
}

/** Qué receta es un plato: una parecida, cualquier otra, una nueva o ninguna. */
function ElegirReceta({
  plato,
  decision,
  recetas,
  alTerminar,
}: {
  plato: PlatoRevision;
  decision: Decision;
  recetas: Receta[];
  alTerminar: () => void;
}) {
  const [todas, setTodas] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  const actual = decision.tipo === 'receta' ? decision.receta.id : null;
  const parecidas = useMemo(
    () => recetasParecidas(plato.texto, recetas).filter((r) => r.id !== actual),
    [plato.texto, recetas, actual],
  );
  const resto = recetas.filter((r) => r.id !== actual && !parecidas.includes(r)).sort(porNombre);

  const elegir = async (destino: { receta: string } | 'sin-compra') => {
    setFallo(null);
    try {
      await asignarPlato(plato.texto, destino);
      alTerminar();
    } catch (e) {
      setFallo(falloDe(e));
    }
  };

  const fila = (r: Receta) => (
    <li key={r.id}>
      <button type="button" class="fila fila--compra" onClick={() => void elegir({ receta: r.id })}>
        <span class="fila__texto">
          <span>{r.nombre}</span>
        </span>
      </button>
    </li>
  );

  return (
    <div class="elegir-receta">
      {decision.tipo === 'receta' && (
        <p class="secundario">
          Ahora es tu receta «{decision.receta.nombre}».{' '}
          <a href={`#menu/receta/${decision.receta.id}`}>Ver la receta</a>
        </p>
      )}
      {parecidas.length > 0 && (
        <>
          <h3 class="tienda__titulo">¿Es una de estas recetas?</h3>
          <ul class="filas elegir-receta__lista">{parecidas.map(fila)}</ul>
        </>
      )}
      {resto.length > 0 &&
        (todas ? (
          <>
            <h3 class="tienda__titulo">
              {parecidas.length > 0 ? 'Otras recetas' : '¿Es una de tus recetas?'}
            </h3>
            <ul class="filas elegir-receta__lista">{resto.map(fila)}</ul>
          </>
        ) : (
          <button type="button" class="boton boton--ancho" onClick={() => setTodas(true)}>
            {parecidas.length > 0 ? 'Ver las demás recetas' : 'Elegir una de tus recetas'} (
            {resto.length})
          </button>
        ))}
      {fallo && (
        <p class="aviso aviso--error" role="alert">
          <Icono nombre="alerta" tamano={20} />
          <span>{fallo}</span>
        </p>
      )}
      <div class="acciones">
        <a
          class={
            parecidas.length === 0 && decision.tipo !== 'receta'
              ? 'boton boton--principal boton--ancho'
              : 'boton boton--ancho'
          }
          href={`#menu/dieta/receta/${plato.id}`}
        >
          Crear una receta nueva
        </a>
        {decision.tipo !== 'sin-compra' && (
          <button
            type="button"
            class="boton boton--ancho"
            onClick={() => void elegir('sin-compra')}
          >
            No se compra nada para este plato
          </button>
        )}
        <button type="button" class="boton boton--ancho" onClick={alTerminar}>
          Cerrar
        </button>
      </div>
    </div>
  );
}

function SemanaDiaADia({ dieta }: { dieta: Dieta }) {
  const porDia = dieta.filas.filter((f) => !f.opciones);
  if (porDia.length === 0) return null;
  return (
    <details class="tarjeta dieta-dias">
      <summary>Ver la semana día a día</summary>
      {dieta.dias.map((dia, d) => (
        <div key={dia} class="dieta-dias__dia">
          <h3>{dia}</h3>
          {porDia.map((f) => {
            const platos = f.porDia[d] ?? [];
            return (
              <p key={f.comida}>
                <strong>{f.comida}:</strong>{' '}
                {platos.length > 0 ? platos.map((p) => p.texto).join(' · ') : '—'}
              </p>
            );
          })}
        </div>
      ))}
    </details>
  );
}
