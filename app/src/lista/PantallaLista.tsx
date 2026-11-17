import { useMemo, useState } from 'preact/hooks';
import { semanasDe, useAjustesCompra, NOMBRE_PERIODO } from '../ajustes.ts';
import { useCatalogo } from '../catalogo.ts';
import { ComoInstalar } from '../componentes/Banderas.tsx';
import { FechaPrecios } from '../componentes/EstadoPrecios.tsx';
import { Icono } from '../componentes/Icono.tsx';
import { NombreTienda } from '../componentes/Tienda.tsx';
import { hoyEnEspana, textoDia, textoFormato, textoPrecio } from '../formato.ts';
import { useNecesidades } from '../necesidades/estado.ts';
import { useTiendas } from '../tiendas/estado.ts';
import type { InfoTienda } from '../tiendas/modelo.ts';
import { precioAntiguo } from '../tiendas/productos.ts';
import { textoNecesidad, type Necesidad } from '../necesidades/modelo.ts';
import { existencias, textoEnUnidad } from '../despensa/despensa.ts';
import {
  consumoSemanal,
  empezarCompra,
  existenciasDe,
  repartirNecesidades,
  seAcaba,
  tocaComprar,
} from './compra.ts';
import { guardarAdelantadas, guardarCompra, useCompra } from './estado.ts';
import { ModoCompra } from './ModoCompra.tsx';
import { useRecetas } from '../menu/estado.ts';
import { aportesDelMenu, necesidadesConMenu } from '../menu/menu.ts';
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
  const { listo, compra, adelantadas, pantallaEncendida } = useCompra();
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const hoy = hoyEnEspana(ahora);
  const semanas = ajustes ? semanasDe(ajustes.periodo) : 1;

  // Lo que dura más que una compra y aún no se ha acabado se deja fuera («puede que aún te quede»).
  // Las necesidades con lo que gasta el menú sumado (las que son solo para recetas y no están
  // en el menú no se compran).
  const { recetas, menu } = useRecetas();
  const conMenu = useMemo(
    () =>
      necesidades && recetas
        ? necesidadesConMenu(necesidades, aportesDelMenu(menu, recetas, necesidades))
        : null,
    [necesidades, recetas, menu],
  );
  const reparto = useMemo(
    () => (conMenu ? repartirNecesidades(conMenu, hoy, semanas, adelantadas) : null),
    [conMenu, hoy, semanas, adelantadas],
  );

  const plan = useMemo(
    () =>
      reparto && buscarProducto && ajustes && tiendas
        ? planificar(reparto.tocan, buscarProducto, {
            semanas,
            costeVisita: ajustes.costeVisita,
            hoy,
            tiendas: tiendas.filter((t) => t.activa).map((t) => t.id),
            // Lo que queda en casa: se compra solo lo que falta.
            existencias: existenciasDe(reparto.tocan, hoy),
          })
        : null,
    [reparto, buscarProducto, ajustes, hoy, tiendas, semanas],
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

  if (!listo) return <h1>Lista de compra</h1>;
  if (compra && necesidades) {
    return (
      <ModoCompra
        compra={compra}
        necesidades={necesidades}
        pantallaEncendida={pantallaEncendida}
        alTerminar={(texto) => {
          setMensaje(texto);
          window.scrollTo(0, 0);
        }}
      />
    );
  }

  const empezar = () => {
    if (!plan || !tiendas) return;
    const nueva = empezarCompra(plan, tiendas, new Date().toISOString());
    if (!nueva) return;
    setMensaje(null);
    setFallo(null);
    guardarCompra(nueva)
      .then(() => window.scrollTo(0, 0))
      .catch((e: unknown) =>
        setFallo(`No se ha podido empezar (${e instanceof Error ? e.message : String(e)}).`),
      );
  };

  return (
    <>
      <h1>Lista de compra</h1>
      {mensaje && (
        <p class="aviso aviso--bien" role="status">
          <Icono nombre="hecho" tamano={20} />
          <span>{mensaje}</span>
        </p>
      )}
      {fallo && (
        <p class="aviso aviso--error" role="alert">
          <Icono nombre="alerta" tamano={20} />
          <span>{fallo}</span>
        </p>
      )}
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
              alEmpezar={empezar}
            />
          ) : necesidades?.length === 0 ? null : reparto?.tocan.length === 0 ? (
            <section class="tarjeta">
              <h2>Esta vez no hace falta comprar nada</h2>
              <p class="secundario">
                Todo lo que compras te dura más que esta compra y aún te queda. Si se te ha acabado
                algo, añádelo desde «Aún te queda en casa».
              </p>
            </section>
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
          {reparto && (
            <PuedeQueTeQuede
              necesidades={conMenu ?? []}
              quedan={reparto.quedan}
              adelantadas={adelantadas}
              hoy={hoy}
              semanas={semanas}
            />
          )}
          {plan.mejor && <OtrasOpciones plan={plan} mejor={plan.mejor} tiendas={tiendas} />}
        </>
      )}
    </>
  );
}

/**
 * Lo que dura más que una compra y aún no se ha acabado (p. ej. el detergente del mes en una
 * compra semanal): no entra en esta compra, pero se puede añadir si se ha acabado antes.
 */
function PuedeQueTeQuede({
  necesidades,
  quedan,
  adelantadas,
  hoy,
  semanas,
}: {
  necesidades: Necesidad[];
  quedan: Necesidad[];
  adelantadas: string[];
  hoy: string;
  semanas: number;
}) {
  // Las añadidas a mano que, si no, no tocarían.
  const anadidas = necesidades.filter(
    (n) => adelantadas.includes(n.id) && !tocaComprar(n, hoy, semanas),
  );
  if (quedan.length === 0 && anadidas.length === 0) return null;
  const cambiar = (ids: string[]) => void guardarAdelantadas(ids);
  const fila = (n: Necesidad, anadida: boolean) => {
    const fin = seAcaba(n);
    const queda = existencias(n, consumoSemanal(n), hoy);
    return (
      <li key={n.id} class="fila">
        <div class="fila__texto">
          <a href={`#necesidades/${n.id}`} class="enlace-fila">
            {n.nombre}
          </a>
          <span class="secundario">
            {queda !== null
              ? `Te quedan unos ${textoEnUnidad(queda, n)}`
              : `${textoNecesidad(n)}${n.ultimaCompra ? ` · comprado el ${textoDia(n.ultimaCompra)}` : ''}`}
            {fin ? `, hasta el ${textoDia(fin)} más o menos` : ''}
          </span>
        </div>
        <button
          type="button"
          class="boton boton--pequeno"
          onClick={() =>
            cambiar(anadida ? adelantadas.filter((id) => id !== n.id) : [...adelantadas, n.id])
          }
        >
          {anadida ? 'Quitar' : 'Añadir'}
        </button>
      </li>
    );
  };
  return (
    <section class="grupo">
      <h2 class="grupo__titulo grupo__titulo--separado">Aún te queda en casa</h2>
      <p class="secundario">
        Te llega hasta la siguiente compra, así que no se cuenta. Si se te ha acabado antes,
        añádelo, o toca su nombre para corregir lo que te queda.
      </p>
      <ul class="filas tarjeta tarjeta--lista">
        {anadidas.map((n) => fila(n, true))}
        {quedan.map((n) => fila(n, false))}
      </ul>
    </section>
  );
}

function ResumenPlan({
  plan,
  mejor,
  periodo,
  tiendas,
  alEmpezar,
}: {
  plan: Plan;
  mejor: Resultado;
  periodo: string;
  tiendas: InfoTienda[];
  alEmpezar: () => void;
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
      <button type="button" class="boton boton--principal boton--ancho" onClick={alEmpezar}>
        <Icono nombre="carrito" tamano={20} /> Empezar la compra
      </button>
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
