import { useEffect, useRef, useState } from 'preact/hooks';
import { Icono } from '../componentes/Icono.tsx';
import { hoyEnEspana } from '../formato.ts';
import { guardarVarias, useNecesidades } from '../necesidades/estado.ts';
import {
  estadoEquivalencia,
  NOMBRE_UNIDAD,
  textoNecesidad,
  type Necesidad,
} from '../necesidades/modelo.ts';
import type { IdTienda } from '../tiendas/modelo.ts';
import { quitarOfertasTerminadas } from '../tiendas/ofertas.ts';
import type { DatosApp, ProductoApp } from '../tipos.ts';
import { useRecetas } from '../menu/estado.ts';
import { aportesDelMenu, necesidadesConMenu, type Menu } from '../menu/menu.ts';
import type { Receta } from '../menu/recetas.ts';
import {
  actualizarAutomaticas,
  actualizarOfertas,
  cambioDeUnidad,
  elegirPorMi,
  gastoSemanal,
  ingredienteDe,
  tiendasPorElegir,
  unidadCompatible,
} from './automatico.ts';

const NOMBRES: Record<string, string> = { mercadona: 'Mercadona', consum: 'Consum' };
const enumerar = (xs: string[]) =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} y ${xs.at(-1) ?? ''}`;

/**
 * Pone al día lo que eligió la app. No enseña nada.
 * - Una vez por cada descarga de precios: si hoy hay otro producto válido más barato, lo cambia.
 * - Siempre que cambian las necesidades o los precios: quita las ofertas de Lidl terminadas y
 *   elige la mejor oferta de la semana para cada necesidad (así una necesidad nueva la tiene al
 *   momento). Todo se guarda de una vez para no pisar un cambio con otro.
 */
export function PonerAlDia({ datos }: { datos: DatosApp | null }) {
  const { necesidades } = useNecesidades();
  const { recetas, menu } = useRecetas();
  const hecho = useRef<string | null>(null);
  const guardando = useRef(false);
  useEffect(() => {
    if (!datos || !necesidades || !recetas || guardando.current) return;
    const hoy = hoyEnEspana();
    const ahora = new Date().toISOString();
    const cambios = new Map<string, Necesidad>();
    const aplicar = (lista: Necesidad[]) => {
      for (const n of lista) cambios.set(n.id, n);
    };
    const actuales = () => necesidades.map((n) => cambios.get(n.id) ?? n);

    aplicar(quitarOfertasTerminadas(necesidades, datos, hoy, ahora));
    const gasto = gastosConMenu(actuales(), recetas, menu);
    const semanalDe = (n: Necesidad) => gasto.get(n.id) ?? gastoSemanal(n);
    const nuevaDescarga = hecho.current !== datos.generado;
    if (nuevaDescarga) aplicar(actualizarAutomaticas(actuales(), datos, hoy, ahora, semanalDe));
    aplicar(actualizarOfertas(actuales(), datos, hoy, ahora, semanalDe));
    hecho.current = datos.generado;
    if (cambios.size === 0) return;

    guardando.current = true;
    guardarVarias([...cambios.values()])
      .catch(() => {
        // Si no se puede guardar, se reintenta con la próxima descarga.
        if (nuevaDescarga) hecho.current = null;
      })
      .finally(() => {
        guardando.current = false;
      });
  }, [datos, necesidades, recetas, menu]);
  return null;
}

/** Lo que se gasta a la semana de cada necesidad contando el menú, en kg, l o ud. */
export function gastosConMenu(
  necesidades: readonly Necesidad[],
  recetas: readonly Receta[],
  menu: Menu,
): Map<string, number> {
  const conMenu = necesidadesConMenu(necesidades, aportesDelMenu(menu, recetas, necesidades));
  return new Map(conMenu.map((n) => [n.id, gastoSemanal(n)]));
}

/** Tiendas con catálogo en las que la app puede elegir y aún no hay un producto que valga. */
export function tiendasSinProducto(
  n: Necesidad,
  buscarProducto: (tienda: IdTienda, id: string) => ProductoApp | undefined,
): string[] {
  return tiendasPorElegir(n).filter(
    (t) => estadoEquivalencia(n, t, buscarProducto).tipo !== 'elegido',
  );
}

/** Recuadro de la ficha: «La app puede elegir sola…» con el botón «Elegir por mí». */
export function ElegirPorMi({
  necesidad,
  datos,
  buscarProducto,
  alCambiar,
}: {
  necesidad: Necesidad;
  datos: DatosApp;
  buscarProducto: (tienda: IdTienda, id: string) => ProductoApp | undefined;
  alCambiar: (n: Necesidad) => Promise<void>;
}) {
  const [aviso, setAviso] = useState<string | null>(null);
  const { recetas, menu } = useRecetas();
  const cambio = cambioDeUnidad(necesidad);
  if (cambio) {
    return (
      <CambiarUnidad
        necesidad={necesidad}
        {...cambio}
        alCambiar={async (arreglada) => {
          const semanal = gastosConMenu([arreglada], recetas ?? [], menu).get(arreglada.id);
          const r = elegirPorMi(arreglada, datos, hoyEnEspana(), new Date().toISOString(), semanal);
          await alCambiar(r?.necesidad ?? arreglada);
        }}
      />
    );
  }
  const ingrediente = ingredienteDe(necesidad);
  if (!ingrediente || !unidadCompatible(ingrediente, necesidad)) return null;
  const pendientes = tiendasSinProducto(necesidad, buscarProducto);
  if (pendientes.length === 0 && !aviso) return null;

  const elegir = async () => {
    const semanal = gastosConMenu([necesidad], recetas ?? [], menu).get(necesidad.id);
    const r = elegirPorMi(necesidad, datos, hoyEnEspana(), new Date().toISOString(), semanal);
    if (!r) return;
    await alCambiar(r.necesidad);
    setAviso(
      r.sinProducto.length > 0
        ? `No he encontrado «${ingrediente.nombre}» en ${enumerar(r.sinProducto.map((t) => NOMBRES[t] ?? t))}: elígelo a mano.`
        : null,
    );
  };

  return (
    <section class="tarjeta elegir-por-mi">
      {pendientes.length > 0 && (
        <>
          <p>
            La app puede elegir sola el producto de «{ingrediente.nombre}» en{' '}
            {enumerar(pendientes.map((t) => NOMBRES[t] ?? t))}: el que menos cuesta para lo que
            gastas en 4 semanas. Lo cambiará cuando haya otro más barato.
          </p>
          <button
            type="button"
            class="boton boton--principal boton--ancho"
            onClick={() => void elegir()}
          >
            Elegir por mí
          </button>
        </>
      )}
      {aviso && (
        <p class="aviso aviso--atencion">
          <Icono nombre="alerta" tamano={20} />
          <span>{aviso}</span>
        </p>
      )}
    </section>
  );
}

const SE_VENDE: Record<string, string> = {
  kg: 'se vende por peso',
  l: 'se vende por litros',
  ud: 'se cuenta por unidades',
};

/**
 * Aviso de la ficha cuando la necesidad va en una unidad que no es la de su ingrediente
 * (huevos en kg): así no se puede elegir el producto ni entra en la Lista.
 */
function CambiarUnidad({
  necesidad,
  ingrediente,
  arreglada,
  alCambiar,
}: {
  necesidad: Necesidad;
  ingrediente: { nombre: string; unidad: string };
  arreglada: Necesidad | null;
  alCambiar: (n: Necesidad) => Promise<void>;
}) {
  const [guardando, setGuardando] = useState(false);
  return (
    <section class="tarjeta elegir-por-mi">
      <p class="aviso aviso--atencion">
        <Icono nombre="alerta" tamano={20} />
        <span>
          «{ingrediente.nombre}» {SE_VENDE[ingrediente.unidad] ?? 'se vende en otra unidad'}, pero
          aquí está en {NOMBRE_UNIDAD[necesidad.unidad].varias}. Así la app no puede elegir el
          producto ni ponerlo en la Lista.
        </span>
      </p>
      {arreglada ? (
        <button
          type="button"
          class="boton boton--principal boton--ancho"
          disabled={guardando}
          onClick={() => {
            setGuardando(true);
            void alCambiar(arreglada).finally(() => setGuardando(false));
          }}
        >
          {arreglada.soloRecetas
            ? `Pasar a ${NOMBRE_UNIDAD[arreglada.unidad].varias}`
            : `Cambiar a ${textoNecesidad(arreglada)}`}
        </button>
      ) : (
        <a class="boton boton--principal boton--ancho" href={`#necesidades/${necesidad.id}/editar`}>
          Cambiar la unidad
        </a>
      )}
    </section>
  );
}

/** Nota bajo un producto elegido por la app. */
export function NotaAutomatica() {
  return (
    <p class="secundario nota-automatica">
      Elegido por la app: el que menos cuesta hoy para lo que gastas en 4 semanas. Si aparece otro
      más barato, lo cambia sola. Si lo cambias tú, se queda fijo.
    </p>
  );
}

/** Banner de la lista de necesidades: elegir por mí en todas las que se pueda. */
export function ElegirEnTodas({
  necesidades,
  datos,
  buscarProducto,
}: {
  necesidades: Necesidad[];
  datos: DatosApp;
  buscarProducto: (tienda: IdTienda, id: string) => ProductoApp | undefined;
}) {
  const [fallo, setFallo] = useState<string | null>(null);
  const [eligiendo, setEligiendo] = useState(false);
  const { recetas, menu } = useRecetas();
  const posibles = necesidades.filter((n) => {
    const i = ingredienteDe(n);
    return i && unidadCompatible(i, n) && tiendasSinProducto(n, buscarProducto).length > 0;
  });
  if (posibles.length === 0) return null;

  const elegir = async () => {
    setEligiendo(true);
    setFallo(null);
    const hoy = hoyEnEspana();
    const ahora = new Date().toISOString();
    const gasto = gastosConMenu(necesidades, recetas ?? [], menu);
    const cambiadas = posibles
      .map((n) => elegirPorMi(n, datos, hoy, ahora, gasto.get(n.id))?.necesidad)
      .filter((n): n is Necesidad => n !== undefined);
    try {
      await guardarVarias(cambiadas);
    } catch (e) {
      setFallo(`No se ha podido guardar (${e instanceof Error ? e.message : String(e)}).`);
    } finally {
      setEligiendo(false);
    }
  };

  return (
    <section class="tarjeta elegir-por-mi">
      <p>
        {posibles.length === 1
          ? `A 1 necesidad le falta el producto de alguna tienda. La app puede elegirlo sola: el más barato de cada tienda.`
          : `A ${posibles.length} necesidades les falta el producto de alguna tienda. La app puede elegirlo sola: el más barato de cada tienda.`}
      </p>
      <button
        type="button"
        class="boton boton--principal boton--ancho"
        disabled={eligiendo}
        onClick={() => void elegir()}
      >
        {eligiendo ? 'Eligiendo…' : 'Elegir por mí'}
      </button>
      {fallo && (
        <p class="aviso aviso--error" role="alert">
          <Icono nombre="alerta" tamano={20} />
          <span>{fallo}</span>
        </p>
      )}
    </section>
  );
}
