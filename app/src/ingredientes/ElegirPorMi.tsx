import { useEffect, useRef, useState } from 'preact/hooks';
import { Icono } from '../componentes/Icono.tsx';
import { hoyEnEspana } from '../formato.ts';
import { guardarVarias, useNecesidades } from '../necesidades/estado.ts';
import { estadoEquivalencia, type Necesidad } from '../necesidades/modelo.ts';
import type { IdTienda } from '../tiendas/modelo.ts';
import type { DatosApp, ProductoApp } from '../tipos.ts';
import { useRecetas } from '../menu/estado.ts';
import { aportesDelMenu, necesidadesConMenu, type Menu } from '../menu/menu.ts';
import type { Receta } from '../menu/recetas.ts';
import {
  actualizarAutomaticas,
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
 * Pone al día, una vez por cada descarga de precios, lo que eligió la app: si hoy hay otro
 * producto válido más barato, lo cambia. No enseña nada.
 */
export function PonerAlDia({ datos }: { datos: DatosApp | null }) {
  const { necesidades } = useNecesidades();
  const { recetas, menu } = useRecetas();
  const hecho = useRef<string | null>(null);
  useEffect(() => {
    if (!datos || !necesidades || !recetas || hecho.current === datos.generado) return;
    hecho.current = datos.generado;
    const gasto = gastosConMenu(necesidades, recetas, menu);
    const cambiadas = actualizarAutomaticas(
      necesidades,
      datos,
      hoyEnEspana(),
      new Date().toISOString(),
      (n) => gasto.get(n.id) ?? gastoSemanal(n),
    );
    guardarVarias(cambiadas).catch(() => {
      // Si no se puede guardar, se reintenta con la próxima descarga.
      hecho.current = null;
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
