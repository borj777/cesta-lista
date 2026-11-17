import { useState } from 'preact/hooks';
import { Icono } from '../../componentes/Icono.tsx';
import { leerDieta, resumirDieta, type Dieta, type Lectura } from './leer.ts';
import { ErrorPdf, leerPdf } from './pdf.ts';

type Estado =
  | { tipo: 'inicio' }
  | { tipo: 'leyendo' }
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'leido'; lectura: Lectura };

/** «Lunes, comida», «Martes, cena» → «lunes comida, martes cena». */
const cuandoTexto = (cuando: string[]) =>
  cuando.map((c) => c.toLowerCase().replace(',', '')).join(', ');

const vecesTexto = (veces: number) => (veces === 1 ? '1 vez' : `${veces} veces`);

/** «a», «a y b», «a, b y c». */
const enumerar = (cosas: string[]) =>
  cosas.length <= 1 ? (cosas[0] ?? '') : `${cosas.slice(0, -1).join(', ')} y ${cosas.at(-1) ?? ''}`;

/** #menu/dieta: lee el PDF de la dieta y enseña lo que ha encontrado. No guarda nada. */
export function PantallaDieta() {
  const [estado, setEstado] = useState<Estado>({ tipo: 'inicio' });

  const elegir = (archivo: File | undefined) => {
    if (!archivo) return;
    setEstado({ tipo: 'leyendo' });
    archivo
      .arrayBuffer()
      .then(leerPdf)
      .then((paginas) => setEstado({ tipo: 'leido', lectura: leerDieta(paginas) }))
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
          se envía a ningún sitio ni se guarda. Por ahora la app te enseña los platos que encuentra;
          pronto podrás convertirlos en tu menú.
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
      {estado.tipo === 'leido' && <Resultado lectura={estado.lectura} />}
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

function Resultado({ lectura }: { lectura: Lectura }) {
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
            No he encontrado la tabla de la semana (los días en columnas). Estas son las líneas con
            viñeta del PDF; en el siguiente paso podrás elegir cuáles son platos.
          </span>
        </p>
        {lectura.lineas.length > 0 ? (
          <ul class="filas tarjeta tarjeta--lista">
            {lectura.lineas.map((l) => (
              <li key={l} class="fila">
                <span>{l}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p class="secundario">No hay ninguna.</p>
        )}
      </>
    );
  }
  return <ResultadoTabla dieta={lectura.dieta} />;
}

function ResultadoTabla({ dieta }: { dieta: Dieta }) {
  const resumen = resumirDieta(dieta);
  const porDia = dieta.filas.filter((f) => !f.opciones);
  return (
    <>
      <p class="aviso aviso--bien" role="status">
        <Icono nombre="hecho" tamano={20} />
        <span>
          He leído la semana: {resumen.platos.length}{' '}
          {resumen.platos.length === 1 ? 'plato distinto' : 'platos distintos'}
          {resumen.opciones.length > 0 &&
            ` y opciones para ${enumerar(resumen.opciones.map((o) => o.comida.toLowerCase()))}`}
          . Comprueba que está todo bien.
        </span>
      </p>

      <section class="grupo">
        <h2 class="grupo__titulo">Platos de la semana</h2>
        <ul class="filas tarjeta tarjeta--lista">
          {resumen.platos.map((p) => (
            <li key={p.texto} class="fila">
              <div class="fila__texto">
                <span>{p.texto}</span>
                <span class="secundario">
                  {vecesTexto(p.veces)}: {cuandoTexto(p.cuando)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {resumen.opciones.map((o) => (
        <section key={o.comida} class="grupo">
          <h2 class="grupo__titulo">{o.comida}: opciones para cualquier día</h2>
          <ul class="filas tarjeta tarjeta--lista">
            {o.platos.map((p) => (
              <li key={p} class="fila">
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {resumen.libres.length > 0 && (
        <p class="secundario">
          {resumen.libres.length === 1 ? 'Comida libre' : 'Comidas libres'} (no se compra nada para{' '}
          {resumen.libres.length === 1 ? 'ella' : 'ellas'}):{' '}
          {enumerar(resumen.libres.map((l) => l.toLowerCase().replace(',', '')))}.
        </p>
      )}

      {porDia.length > 0 && (
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
      )}
    </>
  );
}
