import { useMemo } from 'preact/hooks';
import { semanasDe, useAjustesCompra, NOMBRE_PERIODO } from '../ajustes.ts';
import { useCatalogo } from '../catalogo.ts';
import { ComoInstalar } from '../componentes/Banderas.tsx';
import { FechaPrecios } from '../componentes/EstadoPrecios.tsx';
import { Icono } from '../componentes/Icono.tsx';
import { NOMBRE_TIENDA } from '../estado.ts';
import { hoyEnEspana, textoFormato, textoPrecio } from '../formato.ts';
import { useLidl } from '../lidl/estado.ts';
import { precioAntiguo } from '../lidl/modelo.ts';
import { useNecesidades } from '../necesidades/estado.ts';
import type { Necesidad } from '../necesidades/modelo.ts';
import {
  planificar,
  type Compra,
  type Plan,
  type Resultado,
  type Tiendas,
} from '../optimizador.ts';
import type { DatosApp } from '../tipos.ts';

/** "Consum", "Consum y Lidl", "Mercadona, Consum y Lidl". */
export function nombresTiendas(tiendas: Tiendas): string {
  const nombres = tiendas.map((t) => NOMBRE_TIENDA[t]);
  return nombres.length === 1
    ? (nombres[0] ?? '')
    : `${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1) ?? ''}`;
}

const euros = textoPrecio;

/** Lista de compra: en qué tiendas comprar y qué comprar en cada una. */
export function PantallaLista({ datos, ahora }: { datos: DatosApp | null; ahora: Date }) {
  const { necesidades } = useNecesidades();
  const { productos: lidl } = useLidl();
  const ajustes = useAjustesCompra();
  const { buscarProducto } = useCatalogo(datos);
  const hoy = hoyEnEspana(ahora);

  const plan = useMemo(
    () =>
      necesidades && buscarProducto && ajustes
        ? planificar(necesidades, buscarProducto, {
            semanas: semanasDe(ajustes.periodo),
            costeVisita: ajustes.costeVisita,
            hoy,
          })
        : null,
    [necesidades, buscarProducto, ajustes, hoy],
  );

  // Precios de Lidl con más de 30 días que se usan en la compra elegida.
  const lidlAntiguos = useMemo(() => {
    const ids = new Set(
      plan?.mejor?.compras
        .filter((c) => c.opcion.tienda === 'lidl')
        .map((c) => c.opcion.producto.id),
    );
    return (lidl ?? []).filter((p) => ids.has(p.id) && precioAntiguo(p, ahora));
  }, [plan, lidl, ahora]);

  return (
    <>
      <h1>Lista de compra</h1>
      {datos && <FechaPrecios datos={datos} ahora={ahora} />}
      <ComoInstalar />
      {necesidades?.length === 0 && (
        <section class="tarjeta">
          <h2>Apunta lo que compras</h2>
          <p class="secundario">
            Añade tus necesidades y elige qué producto compras en cada tienda. Cesta Lista repartirá
            la compra entre Mercadona, Consum y Lidl para que gastes lo mínimo.
          </p>
          <a class="boton boton--principal boton--ancho" href="#necesidades/nueva">
            Añadir la primera
          </a>
        </section>
      )}
      {necesidades && necesidades.length > 0 && !plan && (
        <p class="secundario">Calculando la compra más barata…</p>
      )}
      {plan && ajustes && (
        <>
          {plan.mejor ? (
            <ResumenPlan plan={plan} mejor={plan.mejor} periodo={NOMBRE_PERIODO[ajustes.periodo]} />
          ) : (
            <section class="tarjeta">
              <h2>Elige qué compras en cada tienda</h2>
              <p class="secundario">
                Para calcular la compra más barata, abre cada necesidad y elige el producto que
                compras en cada tienda.
              </p>
              <a class="boton boton--principal boton--ancho" href="#necesidades">
                Ir a mis necesidades
              </a>
            </section>
          )}
          <Avisos plan={plan} lidlAntiguos={lidlAntiguos.map((p) => p.nombre)} />
          {plan.mejor && <ComprasPorTienda mejor={plan.mejor} />}
          {plan.mejor && <OtrasOpciones plan={plan} mejor={plan.mejor} />}
        </>
      )}
    </>
  );
}

function ResumenPlan({ plan, mejor, periodo }: { plan: Plan; mejor: Resultado; periodo: string }) {
  const { unaTienda, ahorro } = plan;
  return (
    <section class="tarjeta tarjeta--destacada plan">
      <p class="plan__periodo">Compra para {periodo}</p>
      <h2 class="plan__titulo">
        {mejor.tiendas.length === 1 ? 'Ve solo a ' : 'Ve a '}
        {nombresTiendas(mejor.tiendas)}
      </h2>
      <p class="plan__total">{euros(mejor.costeProductos)}</p>
      <p>
        {unaTienda === null
          ? 'Ninguna tienda tiene todo lo que compras: hace falta ir a varias.'
          : unaTienda === mejor || !ahorro
            ? `Es lo más barato: comprarlo todo en ${NOMBRE_TIENDA[mejor.tiendas[0] ?? 'mercadona']}.`
            : `Ahorras ${euros(ahorro)} frente a comprarlo todo en ${nombresTiendas(unaTienda.tiendas)}.`}
      </p>
      {mejor.costeVisitas > 0 && (
        <p class="secundario">
          Compensa ir a {mejor.tiendas.length} tiendas aunque cada tienda extra cuente como{' '}
          {euros(mejor.costeVisitas / (mejor.tiendas.length - 1))} de tiempo y desplazamiento.
        </p>
      )}
    </section>
  );
}

function Avisos({ plan, lidlAntiguos }: { plan: Plan; lidlAntiguos: string[] }) {
  const enlaces = (necesidades: Necesidad[]) =>
    necesidades.map((n, i) => (
      <span key={n.id}>
        {i > 0 && ', '}
        <a href={`#necesidades/${n.id}`}>{n.nombre}</a>
      </span>
    ));
  const desaparecidos = plan.analisis
    .filter((a) => a.problemas.some((p) => p.tipo === 'desaparecido'))
    .map((a) => a.necesidad);
  const otraUnidad = plan.analisis
    .filter((a) => a.problemas.some((p) => p.tipo === 'otra-unidad'))
    .map((a) => a.necesidad);

  return (
    <>
      {plan.mejor && plan.sinProducto.length > 0 && (
        <p class="aviso aviso--atencion">
          <Icono nombre="alerta" tamano={20} />
          <span>
            Sin producto elegido en ninguna tienda (no se cuentan): {enlaces(plan.sinProducto)}.
          </span>
        </p>
      )}
      {desaparecidos.length > 0 && (
        <p class="aviso aviso--atencion">
          <Icono nombre="alerta" tamano={20} />
          <span>
            Un producto que elegiste ya no está en la tienda; elige otro en:{' '}
            {enlaces(desaparecidos)}.
          </span>
        </p>
      )}
      {otraUnidad.length > 0 && (
        <p class="aviso aviso--atencion">
          <Icono nombre="alerta" tamano={20} />
          <span>
            Hay productos que se venden en otra unidad y no se puede saber cuántos comprar; elige
            otro en: {enlaces(otraUnidad)}.
          </span>
        </p>
      )}
      {lidlAntiguos.length > 0 && (
        <p class="aviso aviso--atencion">
          <Icono nombre="alerta" tamano={20} />
          <span>
            Precios de Lidl con más de 30 días: {lidlAntiguos.join(', ')}.{' '}
            <a href="#lidl">Compruébalos</a>.
          </span>
        </p>
      )}
    </>
  );
}

function FilaCompra({ compra }: { compra: Compra }) {
  const { analisis, opcion } = compra;
  return (
    <li>
      <a class="fila fila--enlace" href={`#necesidades/${analisis.necesidad.id}`}>
        <div class="fila__texto">
          <span>{analisis.necesidad.nombre}</span>
          <span class="secundario">
            {opcion.producto.nombre} · {textoFormato(opcion.producto.formato)}
          </span>
          <span class="secundario">
            {opcion.envases} × {euros(opcion.precio)}
            {opcion.porEnvase ? ' (un envase por unidad)' : ''}
          </span>
        </div>
        <span class="fila__importe">{euros(opcion.coste)}</span>
      </a>
    </li>
  );
}

function ComprasPorTienda({ mejor }: { mejor: Resultado }) {
  return (
    <>
      {mejor.tiendas.map((tienda) => {
        const compras = mejor.compras.filter((c) => c.opcion.tienda === tienda);
        if (compras.length === 0) return null;
        const total = compras.reduce((suma, c) => suma + c.opcion.coste, 0);
        return (
          <section key={tienda} class="grupo">
            <h2 class="grupo__titulo grupo__titulo--tienda">
              <span>
                <span class={`punto punto--${tienda}`} aria-hidden="true" /> {NOMBRE_TIENDA[tienda]}
              </span>
              <span>{euros(total)}</span>
            </h2>
            <ul class="filas tarjeta tarjeta--lista">
              {compras.map((c) => (
                <FilaCompra key={c.analisis.necesidad.id} compra={c} />
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}

function OtrasOpciones({ plan, mejor }: { plan: Plan; mejor: Resultado }) {
  const otras = plan.combinaciones.filter((r) => r !== mejor);
  return (
    <section class="grupo">
      <h2 class="grupo__titulo grupo__titulo--separado">Otras formas de repartir la compra</h2>
      <ul class="filas tarjeta tarjeta--lista">
        {otras.map((r) => (
          <li key={r.tiendas.join()} class="fila">
            <div class="fila__texto">
              <span>{nombresTiendas(r.tiendas)}</span>
              <span class="secundario">
                {r.completa
                  ? r.costeVisitas > 0
                    ? `${euros(r.costeProductos)} en caja + ${euros(r.costeVisitas)} por ir a ${r.tiendas.length} tiendas`
                    : `${euros(r.costeProductos)} en caja`
                  : `Falta: ${r.faltan.map((n) => n.nombre).join(', ')}`}
              </span>
            </div>
            <span class={r.completa ? 'fila__importe' : 'fila__importe fila__importe--apagado'}>
              {!r.completa
                ? '—'
                : r.total > mejor.total
                  ? `+${euros(r.total - mejor.total)}`
                  : 'Igual'}
            </span>
          </li>
        ))}
      </ul>
      <p class="secundario">
        Lo que cuesta de más cada opción frente a la elegida, contando el tiempo de ir a cada tienda
        extra. Lo puedes cambiar en <a href="#ajustes">Ajustes</a>.
      </p>
    </section>
  );
}
