import { useEffect, useMemo, useState } from 'preact/hooks';
import { leerAjuste, guardarAjuste } from '../../almacen.ts';
import { useCatalogo } from '../../catalogo.ts';
import { Contador } from '../../componentes/Contador.tsx';
import { Icono } from '../../componentes/Icono.tsx';
import { hoyEnEspana, textoFormato, textoPrecio } from '../../formato.ts';
import { INGREDIENTES } from '../../ingredientes/catalogo.ts';
import { useNecesidades } from '../../necesidades/estado.ts';
import type { DatosApp } from '../../tipos.ts';
import { usarDieta, useRecetas } from '../estado.ts';
import { MAX_PERSONAS, menuSinPlatos } from '../menu.ts';
import {
  AJUSTE_APRENDIDOS,
  cambiosDeLaDieta,
  nombreCorto,
  planDeLaDieta,
  productoDe,
  type Cosa,
} from './automatica.ts';
import {
  cambiarRevision,
  empezarRevision,
  revisionActual,
  terminarRevision,
  type Revision,
} from './estado.ts';
import { clavePlato, leerDieta } from './leer.ts';
import { ErrorPdf, leerPdf } from './pdf.ts';

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

const TIENDAS = [
  { id: 'mercadona', nombre: 'Mercadona' },
  { id: 'consum', nombre: 'Consum' },
];

const numero = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });

/** «450 g», «1,2 kg», «600 ml», «5 unidades» a la semana. */
function textoSemanal(c: Cosa): string {
  if (c.unidad === 'ud') {
    const n = Math.round(c.semanal * 10) / 10;
    return n === 1 ? '1 unidad' : `${numero.format(n)} unidades`;
  }
  const pequena = c.semanal < 1;
  const valor = pequena ? Math.round(c.semanal * 1000) : c.semanal;
  const unidad = c.unidad === 'kg' ? (pequena ? 'g' : 'kg') : pequena ? 'ml' : 'l';
  return `${numero.format(valor)} ${unidad}`;
}

/** «Paella», «Paella · Lentejas» o «Paella, Lentejas y 3 platos más». */
function textoPlatos(platos: string[]): string {
  if (platos.length <= 2) return platos.join(' · ');
  const resto = platos.length - 2;
  return `${platos.slice(0, 2).join(' · ')} y ${resto === 1 ? 'otro plato' : `${resto} platos más`}`;
}

const ordenados = [...INGREDIENTES].sort((a, b) =>
  nombreCorto(a).localeCompare(nombreCorto(b), 'es', { sensitivity: 'base' }),
);

/**
 * #menu/dieta: lee el PDF de la dieta y enseña lo que se compraría cada semana, con el producto
 * de cada tienda. Al usarla, guarda el menú, las recetas y las necesidades. El PDF no se guarda.
 */
export function PantallaDieta({ datos }: { datos: DatosApp | null }) {
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
      <h1>{estado.tipo === 'leido' ? 'Tu compra para esta dieta' : 'Leer la dieta'}</h1>
      {estado.tipo !== 'leido' && (
        <p class="secundario">
          Elige el PDF de la dieta que te manda tu nutricionista. Se lee dentro de este iPhone: no
          se envía a ningún sitio ni se guarda. La app sacará lo que lleva cada plato y elegirá el
          producto más barato de cada tienda; tú solo corriges lo que no te cuadre.
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
      {estado.tipo === 'leido' && <Resultado revision={estado.revision} datos={datos} />}
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

function Resultado({ revision, datos }: { revision: Revision; datos: DatosApp | null }) {
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
  if (lectura.tipo === 'lineas' && lectura.lineas.length === 0) {
    return <p class="secundario">No he encontrado ningún plato en este PDF.</p>;
  }
  if (!datos) return <p class="secundario">Cargando precios…</p>;
  return <TuCompra revision={revision} datos={datos} />;
}

/** Lo que se compra cada semana con la dieta: cada cosa con su producto en cada tienda. */
function TuCompra({ revision, datos }: { revision: Revision; datos: DatosApp }) {
  const { recetas, menu, sinCompra } = useRecetas();
  const { necesidades } = useNecesidades();
  const { buscarProducto } = useCatalogo(datos);
  const [personas, setPersonas] = useState(revision.personas ?? menu.personas);
  const [quitadas, setQuitadas] = useState(revision.quitadas);
  const [aprendidos, setAprendidos] = useState<Record<string, string> | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    leerAjuste<Record<string, string>>(AJUSTE_APRENDIDOS)
      .then((a) => setAprendidos(a && typeof a === 'object' ? a : {}))
      .catch(() => setAprendidos({}));
  }, []);

  const quitadasSet = useMemo(() => new Set(quitadas), [quitadas]);
  const plan = useMemo(
    () =>
      recetas && necesidades && aprendidos
        ? planDeLaDieta(revision.lectura, {
            recetas,
            necesidades,
            sinCompra,
            aprendidos,
            personas,
            quitadas: quitadasSet,
          })
        : null,
    [revision.lectura, recetas, necesidades, sinCompra, aprendidos, personas, quitadasSet],
  );
  // Las quitadas no salen en el plan: para poder volver a ponerlas, su nombre sale del plan sin quitar.
  const todas = useMemo(
    () =>
      recetas && necesidades && aprendidos && quitadas.length > 0
        ? planDeLaDieta(revision.lectura, { recetas, necesidades, sinCompra, aprendidos, personas })
            .cosas
        : [],
    [revision.lectura, recetas, necesidades, sinCompra, aprendidos, personas, quitadas.length],
  );
  if (!plan || !buscarProducto || !necesidades || !aprendidos) {
    return <p class="secundario">Preparando tu compra…</p>;
  }

  const platos = [...plan.platos.values()].filter((p) => p.veces > 0);
  const desconocidos = [
    ...new Map(
      platos.flatMap((p) =>
        p.desconocidos.map((d) => [clavePlato(d), { texto: d, plato: p.texto }]),
      ),
    ).values(),
  ];
  const sinNada = platos.filter((p) => p.nada || (!p.receta && p.ingredientes.length === 0));
  const hoy = hoyEnEspana();

  const cambiarPersonas = (p: number) => {
    setPersonas(p);
    cambiarRevision({ personas: p });
  };
  const cambiarQuitadas = (q: string[]) => {
    setQuitadas(q);
    cambiarRevision({ quitadas: q });
  };
  const aprender = (trozo: string, ingrediente: string) => {
    const nuevos = { ...aprendidos, [clavePlato(trozo)]: ingrediente };
    setAprendidos(nuevos);
    guardarAjuste(AJUSTE_APRENDIDOS, nuevos).catch((e: unknown) => setFallo(falloDe(e)));
  };

  const usar = async () => {
    const sustituye = menuSinPlatos(menu) ? '' : ' Sustituye a tu menú de ahora.';
    if (
      !confirm(
        `¿Usar esta compra?\n\nSe guardará tu menú de lunes a domingo con los platos de la dieta y ${plan.cosas.length === 1 ? '1 cosa' : `${plan.cosas.length} cosas`} en tus necesidades, con el producto elegido por la app.${sustituye} Tus recetas de otros meses se conservan.`,
      )
    ) {
      return;
    }
    setGuardando(true);
    setFallo(null);
    try {
      const cambios = cambiosDeLaDieta(plan, {
        necesidades,
        personas,
        quitadas: quitadasSet,
        datos,
        hoy,
        ahora: new Date().toISOString(),
        nuevoId: () => crypto.randomUUID(),
      });
      await usarDieta(cambios);
      terminarRevision();
      ir('menu');
    } catch (e) {
      setFallo(falloDe(e));
      setGuardando(false);
    }
  };

  return (
    <>
      <p class="aviso aviso--bien" role="status">
        <Icono nombre="hecho" tamano={20} />
        <span>
          He leído {platos.length === 1 ? '1 plato' : `${platos.length} platos`}. Esto es lo que
          comprarías cada semana; el producto de cada tienda es el más barato que vale.
        </span>
      </p>
      <section class="tarjeta">
        <Contador
          etiqueta="Personas que comen"
          valor={personas}
          max={MAX_PERSONAS}
          alCambiar={cambiarPersonas}
        />
      </section>

      {desconocidos.length > 0 && (
        <section class="tarjeta desconocidos">
          <h2 class="tienda__titulo">¿Qué es esto?</h2>
          <p class="secundario">No sé qué es. Dímelo una vez y lo recordaré para otros meses.</p>
          {desconocidos.map((d) => (
            <label key={d.texto} class="campo">
              <span class="campo__etiqueta">
                «{d.texto}» <span class="secundario">({d.plato})</span>
              </span>
              <select
                class="campo__entrada"
                value="?"
                onChange={(e) => {
                  const v = e.currentTarget.value;
                  aprender(d.texto, v === '-' ? '' : v);
                }}
              >
                <option value="?" disabled>
                  Elige qué es…
                </option>
                <option value="-">No se compra nada</option>
                {ordenados.map((i) => (
                  <option key={i.id} value={i.id}>
                    {nombreCorto(i)}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </section>
      )}

      <h2 class="grupo__titulo grupo__titulo--separado">Lo que compras a la semana</h2>
      <ul class="filas tarjeta tarjeta--lista cosas-dieta">
        {plan.cosas.map((c) => (
          <li key={c.clave} class="cosa-dieta">
            <div class="cosa-dieta__cabecera">
              <strong>{c.nombre}</strong>
              <span class="fila__importe">{textoSemanal(c)}</span>
            </div>
            <span class="secundario cosa-dieta__platos">{textoPlatos(c.platos)}</span>
            {TIENDAS.map((t) => {
              const p = productoDe(c, t.id, datos, buscarProducto, hoy);
              return (
                <span key={t.id} class="cosa-dieta__producto">
                  <span class="cosa-dieta__tienda">{t.nombre}:</span>{' '}
                  {p
                    ? `${p.nombre} · ${textoFormato(p.formato)} · ${textoPrecio(p.precio)}`
                    : 'no lo he encontrado'}
                </span>
              );
            })}
            <button
              type="button"
              class="boton boton--pequeno cosa-dieta__quitar"
              onClick={() => cambiarQuitadas([...quitadas, c.clave])}
            >
              Quitar
            </button>
          </li>
        ))}
      </ul>
      {quitadas.length > 0 && (
        <p class="secundario">
          Quitado:{' '}
          {quitadas.map((q, i) => (
            <span key={q}>
              {i > 0 && ', '}
              {todas.find((c) => c.clave === q)?.nombre ?? q}{' '}
              <button
                type="button"
                class="enlace"
                onClick={() => cambiarQuitadas(quitadas.filter((x) => x !== q))}
              >
                (volver a ponerlo)
              </button>
            </span>
          ))}
        </p>
      )}
      {sinNada.length > 0 && (
        <p class="secundario">Sin compra: {sinNada.map((p) => p.texto).join(' · ')}.</p>
      )}
      <p class="secundario">
        Las cantidades son orientativas (las de la dieta cuando las indica). Después podrás
        cambiarlas en Mis recetas, y los productos, en cada necesidad.
      </p>
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
          disabled={guardando || plan.cosas.length === 0}
          onClick={() => void usar()}
        >
          {guardando ? 'Guardando…' : 'Usar esta compra'}
        </button>
      </div>
    </>
  );
}
