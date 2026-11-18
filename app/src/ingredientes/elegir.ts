/**
 * Elige solo el producto de cada ingrediente en cada tienda: el más barato por precio de
 * referencia (€/kg, €/l o €/ud.) entre los de su sección cuyo nombre encaja. Funciones puras.
 *
 * Buscar solo por nombre falla mucho («atún» encuentra comida de gato y «merluza», palitos
 * rebozados); por eso cada ingrediente dice en qué secciones de las tiendas está.
 */
import { normalizar, palabras } from '../buscador.ts';
import { precioVigente } from '../formato.ts';
import type { DatosApp, ProductoApp, Unidad } from '../tipos.ts';
import type { Ingrediente } from './catalogo.ts';

/** Lo que hace falta saber de cada producto para elegir, calculado una vez. */
type Ficha = { palabras: string[]; ruta: string };

const fichas = new WeakMap<ProductoApp, Ficha>();

function fichaDe(p: ProductoApp, secciones: DatosApp['secciones']): Ficha {
  let ficha = fichas.get(p);
  if (!ficha) {
    const ruta = p.seccion
      ? (secciones?.[p.tienda as 'mercadona' | 'consum']?.[p.seccion] ?? '')
      : '';
    ficha = { palabras: palabras(p.nombre), ruta: normalizar(ruta) };
    fichas.set(p, ficha);
  }
  return ficha;
}

/**
 * ¿Es la palabra del producto la buscada? Vale si empieza por ella («pollo» → «pollos») o si
 * es la buscada sin su final de plural («filetes» queda en «filet» y se busca «filete»).
 */
const esLaPalabra = (suya: string, buscada: string) =>
  suya.startsWith(buscada) ||
  (suya.length >= 4 && buscada.startsWith(suya) && buscada.length - suya.length <= 2);

/** ¿Contiene el producto todas las palabras de la frase? */
function contiene(suyas: readonly string[], frase: string): boolean {
  const buscadas = palabras(frase);
  return buscadas.length > 0 && buscadas.every((b) => suyas.some((s) => esLaPalabra(s, b)));
}

/** ¿Es este producto el ingrediente? Mira su sección, su nombre, lo excluido y su unidad. */
export function encaja(
  ingrediente: Ingrediente,
  p: ProductoApp,
  secciones: DatosApp['secciones'],
): boolean {
  if (p.formato.unidad !== ingrediente.unidad) return false;
  if (ingrediente.maxEnvase !== undefined && p.formato.cantidad > ingrediente.maxEnvase)
    return false;
  const ficha = fichaDe(p, secciones);
  if (ficha.ruta === '') return false;
  if (!ingrediente.en.some((s) => ficha.ruta.includes(normalizar(s)))) return false;
  if (!ingrediente.buscar.some((frase) => contiene(ficha.palabras, frase))) return false;
  return !(ingrediente.excluir ?? []).some((frase) => contiene(ficha.palabras, frase));
}

/** Precio por kg, l o ud. de hoy (sin ofertas caducadas). */
const refDeHoy = (p: ProductoApp, hoy: string) => precioVigente(p, hoy).precioRef;

/** Los productos de una tienda que valen para el ingrediente, del más barato por kg al más caro. */
export function candidatos(
  ingrediente: Ingrediente,
  datos: Pick<DatosApp, 'productos' | 'secciones'>,
  tienda: string,
  hoy: string,
): ProductoApp[] {
  return datos.productos
    .filter((p) => p.tienda === tienda && encaja(ingrediente, p, datos.secciones))
    .sort((a, b) => refDeHoy(a, hoy) - refDeHoy(b, hoy) || a.precio - b.precio);
}

/** Semanas de gasto que se tienen en cuenta al elegir el envase. */
export const SEMANAS_ELEGIR = 4;

/**
 * Lo que cuesta cubrir lo que se gasta en 4 semanas con este producto: envases enteros
 * (como mínimo 1) por su precio de hoy.
 */
export function costeParaGasto(p: ProductoApp, semanal: number, hoy: string): number {
  const envases = Math.max(1, Math.ceil((semanal * SEMANAS_ELEGIR) / p.formato.cantidad - 1e-9));
  return envases * precioVigente(p, hoy).precio;
}

/**
 * El producto del ingrediente que elige la app en la tienda. Si se sabe lo que se gasta a la
 * semana (en kg, l o ud.), el que menos cuesta para cubrir 4 semanas: así no propone un salmón
 * entero de 3 kg para 150 g a la semana. Si no, el más barato por kg (o l o ud.). En los dos
 * casos, a igualdad, el de menor precio por kg.
 */
export function elegirProducto(
  ingrediente: Ingrediente,
  datos: Pick<DatosApp, 'productos' | 'secciones'>,
  tienda: string,
  hoy: string,
  semanal?: number,
): ProductoApp | undefined {
  const lista = candidatos(ingrediente, datos, tienda, hoy);
  if (!semanal || semanal <= 0) return lista[0];
  let mejor: { p: ProductoApp; coste: number } | undefined;
  for (const p of lista) {
    const coste = costeParaGasto(p, semanal, hoy);
    if (!mejor || coste < mejor.coste - 1e-9) mejor = { p, coste };
  }
  return mejor?.p;
}

export type UnidadIngrediente = Extract<Unidad, 'kg' | 'l' | 'ud'>;
