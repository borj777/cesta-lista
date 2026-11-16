import { useMemo } from 'preact/hooks';
import { semanasDe, useAjustesCompra, NOMBRE_PERIODO } from '../ajustes.ts';
import { useCatalogo } from '../catalogo.ts';
import { ComoInstalar } from '../componentes/Banderas.tsx';
import { FechaPrecios } from '../componentes/EstadoPrecios.tsx';
import { Icono } from '../componentes/Icono.tsx';
import { NombreTienda } from '../componentes/Tienda.tsx';
import { hoyEnEspana, textoFormato, textoPrecio } from '../formato.ts';
import { useNecesidades } from '../necesidades/estado.ts';
import { useTiendas } from '../tiendas/estado.ts';
import type { InfoTienda } from '../tiendas/modelo.ts';
import { precioAntiguo } from '../tiendas/productos.ts';
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
export function nombresTiendas(tiendas: Tiendas, info: readonly InfoTienda[]): string {
  const nombres = tiendas.map((t) => info.find((i) => i.id === t)?.nombre ?? t);
  return nombres.length === 1
    ? (nombres[0] ?? '')
    : `${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1) ?? ''}`;
}

const euros = textoPrecio;

/** Lista de compra: en qué tiendas comprar y qué comprar en cada una. */
export function PantallaLista({ datos, ahora }: { datos: DatosApp | null; ahora: Date }) {
  const { necesidades } = useNecesidades();
  const { productos: propios, lista: tiendas } = useTiendas();
  const ajustes = useAjustesCompra();
  const { buscarProducto } = useCatalogo(datos);
  const hoy = hoyEnEspana(ahora);

  const plan = useMemo(
    () =>
      necesidades && buscarProducto && ajustes && tiendas
        ? planificar(necesidades, buscarProducto, {
            semanas: semanasDe(ajustes.periodo),
            costeVisita: ajustes.costeVisita,
            hoy,
            tiendas: tiendas.filter((t) => t.activa).map((t) => t.id),
          })
        : null,
    [necesidades, buscarProducto, ajustes, hoy, tiendas],
  );

  // Precios apuntados a mano con más de 30 días que se usan en la compra elegida.
  const antiguos = useMemo(() => {
    const ids = new Set(
      plan?.mejor?.compras.map((c) => `${c.opcion.tienda}:${c.opcion.producto.id}`),
    );
    return (propios ?? [])
      .filter((p) => ids.has(`${p.tienda}:${p.id}`) && precioAntiguo(p, ahora))
      .map((p) => ({
        nombre: p.nombre,
        tienda: tiendas?.find((t) => t.id === p.tienda)?.nombre ?? '',
        enlace: `#tiendas/${p.tienda}/p/${p.id}`,
      }));
  }, [plan, propios, tiendas, ahora]);

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
            la compra entre Mercadona, Consum, Lidl y las tiendas que añadas para que gastes lo
            mínimo.
          </p>
          <a class="boton boton--principal boton--ancho" href="#necesidades/nueva">
            Añadir la primera
          </a>
        </section>
      )}
      {necesidades && necesidades.length > 0 && !plan && (
        <p class="secundario">Calculando la compra más barata…</p>
      )}
      {plan && ajustes && tiendas && (
        <>
          {plan.mejor ? (
            <ResumenPlan
              plan={plan}
              mejor={plan.mejor}
              periodo={NOMBRE_PERIODO[ajustes.periodo]}
              tiendas={tiendas}
            />
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
          <Avisos plan={plan} antiguos={antiguos} tiendas={tiendas} />
          {plan.mejor && <ComprasPorTienda mejor={plan.mejor} tiendas={tiendas} />}
          {plan.mejor && <OtrasOpciones plan={plan} mejor={plan.mejor} tiendas={tiendas} />}
        </>
      )}
    </>
  );
}

function ResumenPlan({
  plan,
  mejor,
  periodo,
  tiendas,
}: {
  plan: Plan;
  mejor: Resultado;
  periodo: string;
  tiendas: InfoTienda[];
}) {
  const { unaTienda, ahorro } = plan;
  const nombres = (t: Tiendas) => nombresTiendas(t, tiendas);
  return (
    <section class="tarjeta tarjeta--destacada plan">
      <p class="plan__periodo">Compra para {periodo}</p>
      <h2 class="plan__titulo">
        {mejor.tiendas.length === 1 ? 'Ve solo a ' : 'Ve a '}
        {nombres(mejor.tiendas)}
      </h2>
      <p class="plan__total">{euros(mejor.costeProductos)}</p>
      <p>
        {unaTienda === null
          ? 'Ninguna tienda tiene todo lo que compras: hace falta ir a varias.'
          : unaTienda === mejor || !ahorro
            ? `Es lo más barato: comprarlo todo en ${nombres(mejor.tiendas)}.`
            : `Ahorras ${euros(ahorro)} frente a comprarlo todo en ${nombres(unaTienda.tiendas)}.`}
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

function Avisos({
  plan,
  antiguos,
  tiendas,
}: {
  plan: Plan;
  antiguos: { nombre: string; tienda: string; enlace: string }[];
  tiendas: InfoTienda[];
}) {
  const apagadas = tiendas.filter((t) => !t.activa);
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
            Sin producto elegido en ninguna tienda
            {apagadas.length > 0 ? ' encendida' : ''} (no se cuentan): {enlaces(plan.sinProducto)}.
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
      {antiguos.length > 0 && (
        <p class="aviso aviso--atencion">
          <Icono nombre="alerta" tamano={20} />
          <span>
            Precios con más de 30 días; compruébalos:{' '}
            {antiguos.map((p, i) => (
              <span key={p.enlace}>
                {i > 0 && ', '}
                <a href={p.enlace}>
                  {p.nombre} ({p.tienda})
                </a>
              </span>
            ))}
            .
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
            {[opcion.producto.marca, opcion.producto.nombre, textoFormato(opcion.producto.formato)]
              .filter(Boolean)
              .join(' · ')}
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

function ComprasPorTienda({ mejor, tiendas }: { mejor: Resultado; tiendas: InfoTienda[] }) {
  return (
    <>
      {mejor.tiendas.map((tienda) => {
        const info = tiendas.find((t) => t.id === tienda);
        const compras = mejor.compras.filter((c) => c.opcion.tienda === tienda);
        if (compras.length === 0) return null;
        const total = compras.reduce((suma, c) => suma + c.opcion.coste, 0);
        return (
          <section key={tienda} class="grupo">
            <h2 class="grupo__titulo grupo__titulo--tienda">
              <span>{info ? <NombreTienda tienda={info} /> : tienda}</span>
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

function OtrasOpciones({
  plan,
  mejor,
  tiendas,
}: {
  plan: Plan;
  mejor: Resultado;
  tiendas: InfoTienda[];
}) {
  const otras = plan.combinaciones.filter((r) => r !== mejor);
  if (otras.length === 0) return null;
  return (
    <section class="grupo">
      <h2 class="grupo__titulo grupo__titulo--separado">Otras formas de repartir la compra</h2>
      <ul class="filas tarjeta tarjeta--lista">
        {otras.map((r) => (
          <li key={r.tiendas.join()} class="fila">
            <div class="fila__texto">
              <span>{nombresTiendas(r.tiendas, tiendas)}</span>
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
