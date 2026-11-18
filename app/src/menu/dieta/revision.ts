/**
 * Revisión de la dieta leída del PDF: qué receta es cada plato, cuántas veces se toma y el menú
 * que sale. Funciones puras.
 *
 * Un plato se reconoce en otros meses por su «alias»: el texto del PDF guardado en la receta
 * (se compara sin tildes, mayúsculas ni signos). Los platos para los que no se compra nada
 * (un café, «agua») se recuerdan en el ajuste `platosSinCompra`.
 */
import { palabras } from '../../buscador.ts';
import type { Necesidad, UnidadNecesidad } from '../../necesidades/modelo.ts';
import { DIAS_SEMANA, menuVacio, type Menu, type PlatoDia } from '../menu.ts';
import { unidadesCompatibles, type Receta } from '../recetas.ts';
import { clavePlato, resumirDieta, type Lectura, type Momento } from './leer.ts';

/** Máximo de veces de una línea suelta (sin tabla): tres al día. */
export const MAX_VECES = 21;

export const AJUSTE_SIN_COMPRA = 'platosSinCompra';

export type PlatoRevision = {
  /** Único en la revisión: «0-3» (grupo y posición). */
  id: string;
  texto: string;
  /** Veces a la semana que salen en la tabla, o las propuestas si se pueden cambiar. */
  veces: number;
  /** Las veces vienen de los días de la tabla y no se cambian. */
  fijo: boolean;
  /** «Lunes, comida»... (solo en los platos de los días). */
  cuando?: string[];
  /** Día y comida de cada vez que sale (solo en los platos de los días). */
  momentos?: Momento[];
};

export type GrupoRevision = {
  titulo: string;
  /** Si se eligen las veces: cuántos días tiene la semana de la dieta (o el máximo del menú). */
  maxVeces: number;
  /** Las veces son opciones de una misma comida: se avisa si no suman los días. */
  dias?: number;
  /** Comida de las opciones («Desayuno») y su fila en la tabla. */
  comida?: { nombre: string; fila: number };
  platos: PlatoRevision[];
};

/** Reparte los días entre las opciones: 7 entre 2 → 4 y 3; 7 entre 3 → 3, 2 y 2. */
export function repartir(total: number, partes: number): number[] {
  if (partes <= 0) return [];
  const base = Math.floor(total / partes);
  return Array.from({ length: partes }, (_, i) => base + (i < total % partes ? 1 : 0));
}

/** Lo que hay que revisar de lo leído: los platos de los días, las opciones y las líneas sueltas. */
export function gruposDeRevision(lectura: Lectura): GrupoRevision[] {
  if (lectura.tipo === 'sin-texto') return [];
  if (lectura.tipo === 'lineas') {
    if (lectura.lineas.length === 0) return [];
    return [
      {
        titulo: 'Líneas del PDF',
        maxVeces: MAX_VECES,
        platos: lectura.lineas.map((texto, i) => ({ id: `0-${i}`, texto, veces: 0, fijo: false })),
      },
    ];
  }
  const resumen = resumirDieta(lectura.dieta);
  const dias = lectura.dieta.dias.length;
  const grupos: GrupoRevision[] = [];
  if (resumen.platos.length > 0) {
    grupos.push({
      titulo: 'Platos de la semana',
      maxVeces: MAX_VECES,
      platos: resumen.platos.map((p, i) => ({
        id: `0-${i}`,
        texto: p.texto,
        veces: p.veces,
        fijo: true,
        cuando: p.cuando,
        momentos: p.momentos,
      })),
    });
  }
  for (const o of resumen.opciones) {
    const g = grupos.length;
    const veces = repartir(dias, o.platos.length);
    grupos.push({
      titulo: `${o.comida}: opciones para cualquier día`,
      maxVeces: dias,
      dias,
      comida: { nombre: o.comida, fila: o.fila },
      platos: o.platos.map((texto, i) => ({
        id: `${g}-${i}`,
        texto,
        veces: veces[i] ?? 0,
        fijo: false,
      })),
    });
  }
  return grupos;
}

export type Decision =
  | {
      tipo: 'receta';
      receta: Receta;
      /** Solo coincide el nombre (aún no hay alias). */ porNombre: boolean;
    }
  | { tipo: 'sin-compra' }
  | { tipo: 'pendiente' };

/** Qué se ha decidido para un plato: su receta, que no se compra nada o nada todavía. */
export function decisionDe(
  texto: string,
  recetas: readonly Receta[],
  sinCompra: readonly string[],
): Decision {
  const k = clavePlato(texto);
  const conAlias = recetas.find((r) => r.alias?.some((a) => clavePlato(a) === k));
  if (conAlias) return { tipo: 'receta', receta: conAlias, porNombre: false };
  if (sinCompra.some((s) => clavePlato(s) === k)) return { tipo: 'sin-compra' };
  const mismoNombre = recetas.find((r) => clavePlato(r.nombre) === k);
  if (mismoNombre) return { tipo: 'receta', receta: mismoNombre, porNombre: true };
  return { tipo: 'pendiente' };
}

/** Veces de un plato: las elegidas por el usuario o las de la lectura. */
export const vecesDe = (p: PlatoRevision, elegidas: Readonly<Record<string, number>>) =>
  p.fijo ? p.veces : (elegidas[p.id] ?? p.veces);

export type MenuDieta = {
  menu: Menu;
  /** Platos que se toman alguna vez y aún no tienen receta ni «no se compra nada» (sin repetir). */
  pendientes: PlatoRevision[];
};

/**
 * El menú día a día que sale de la dieta. Los platos de la tabla van a su día y su comida; las
 * opciones de una comida se reparten por días seguidos (4 días la primera, 3 la segunda) y las
 * líneas sueltas, por toda la semana. Los platos sin receta salen con su nombre, sin comprar nada.
 */
export function menuDeLaDieta(
  grupos: readonly GrupoRevision[],
  elegidas: Readonly<Record<string, number>>,
  recetas: readonly Receta[],
  sinCompra: readonly string[],
  personas: number,
  libres: readonly (Momento & { texto: string })[] = [],
): MenuDieta {
  const pendientes: PlatoRevision[] = [];
  const menu = colocarEnDias(
    grupos,
    elegidas,
    (p) => {
      const d = decisionDe(p.texto, recetas, sinCompra);
      // Un plato que sale en varias comidas («1 fruta») cuenta una vez: se decide una vez.
      if (
        d.tipo === 'pendiente' &&
        !pendientes.some((x) => clavePlato(x.texto) === clavePlato(p.texto))
      ) {
        pendientes.push(p);
      }
      return d.tipo === 'receta' ? d.receta.id : undefined;
    },
    personas,
    libres,
  );
  return { menu, pendientes };
}

/**
 * Coloca los platos en los días: los de la tabla en su día y su comida; las opciones de una
 * comida, por días seguidos; las líneas sueltas, por toda la semana. `recetaDe` dice la receta
 * de cada plato (sin receta, sale con su nombre y no compra nada).
 */
export function colocarEnDias(
  grupos: readonly GrupoRevision[],
  elegidas: Readonly<Record<string, number>>,
  recetaDe: (p: PlatoRevision) => string | undefined,
  personas: number,
  libres: readonly (Momento & { texto: string })[] = [],
): Menu {
  type Colocado = { dia: number; fila: number; posicion: number; plato: PlatoDia };
  const colocados: Colocado[] = [];
  for (const g of grupos) {
    let siguiente = 0; // primer día libre para las opciones de esta comida
    g.platos.forEach((p, i) => {
      const v = vecesDe(p, elegidas);
      if (v <= 0) return;
      const receta = recetaDe(p);
      const plato = (comida: string): PlatoDia =>
        receta ? { comida, nombre: p.texto, receta } : { comida, nombre: p.texto };
      if (p.fijo && p.momentos) {
        for (const m of p.momentos) {
          colocados.push({
            dia: m.dia,
            fila: m.fila,
            posicion: m.posicion,
            plato: plato(m.comida),
          });
        }
      } else if (g.comida) {
        for (let k = 0; k < v; k++) {
          colocados.push({
            dia: (siguiente + k) % DIAS_SEMANA.length,
            fila: g.comida.fila,
            posicion: i,
            plato: plato(g.comida.nombre),
          });
        }
        siguiente += v;
      } else {
        for (let k = 0; k < v; k++) {
          const dia = Math.floor((k * DIAS_SEMANA.length) / v) % DIAS_SEMANA.length;
          colocados.push({ dia, fila: 0, posicion: i, plato: plato('') });
        }
      }
    });
  }
  for (const l of libres) {
    colocados.push({ ...l, plato: { comida: l.comida, nombre: l.texto } });
  }
  colocados.sort((a, b) => a.dia - b.dia || a.fila - b.fila || a.posicion - b.posicion);
  const menu = menuVacio(personas);
  for (const c of colocados) menu.dias[c.dia]?.push(c.plato);
  return menu;
}

/** Recetas cuyo nombre se parece al del plato, las más parecidas primero. */
export function recetasParecidas(texto: string, recetas: readonly Receta[], limite = 5): Receta[] {
  const buscadas = new Set(palabras(texto));
  if (buscadas.size === 0) return [];
  return recetas
    .map((r) => {
      const suyas = palabras(r.nombre);
      const comunes = suyas.filter((s) => buscadas.has(s)).length;
      return { r, comunes, parecido: comunes / Math.max(suyas.length, buscadas.size) };
    })
    .filter((x) => x.comunes > 0)
    .sort((a, b) => b.parecido - a.parecido || a.r.nombre.localeCompare(b.r.nombre, 'es'))
    .slice(0, limite)
    .map((x) => x.r);
}

export type IngredienteSugerido = {
  /** «Arroz», «Frutos secos». */
  nombre: string;
  /** La necesidad que ya existe con ese nombre. */
  necesidad?: Necesidad;
  /** Cantidad que indica el plato («(70g)», «1 fruta»), para una ración. */
  cantidad?: number;
  unidad?: UnidadNecesidad;
};

/** «Arroz (70g)», «1 puñado de frutos secos (20-30g)»: la cantidad indicada (la mayor). */
const CANTIDAD =
  /\(?\s*(\d+(?:[.,]\d+)?)(?:\s*-\s*(\d+(?:[.,]\d+)?))?\s*(kg|gramos|grs?|g|ml|cl|litros?|l)\b\.?\s*\)?/i;
/** «Puñado de», «palitos de», «media»: medidas y trozos, que no son el ingrediente. */
const MEDIDAS =
  /^(?:puñados?|rebanadas?|vasos?|tazas?|cucharadas?|cucharaditas?|lonchas?|latas?|piezas?|raciones?|porciones?|unidades?|tarrinas?|botes?|onzas?|filetes?|chorritos?|chorros?|pizcas?|palitos?|taquitos?|trocitos?|tacos?|dados?|tiras?|rodajas?|gajos?|láminas?|medi[oa]s?)\b(?:\s+(?:de|del)\b)?\s*/i;
const ARTICULOS = /^(?:el|la|los|las|un|una|unos|unas)\s+/i;
/** «Ensalada de lechuga» → «lechuga». */
const PLATO_DE =
  /^(?:(?:cremas?|sopas?|pur[eé]s?|revueltos?|tostadas?|tostas?|paellas?|guisos?|caldos?|salteados?|hervidos?|wok|brochetas?)\s+(?:de|del)\s+|ensaladas?\s+(?:de\s+)?)/i;
/** Un trozo que solo dice el tipo de plato («Ensalada con...»): no es un ingrediente. */
const SOLO_PLATO = /^(?:ensaladas?|cremas?|sopas?|pur[eé]s?|revueltos?|guisos?|hervidos?)$/i;
const COCINADO =
  /\s+(?:(?:al|a la)\s+(?:horno|plancha|vapor|brasa|parrilla|microondas|papillote)|estofad[oa]s?|cocid[oa]s?|asad[oa]s?|hervid[oa]s?|saltead[oa]s?|frit[oa]s?|guisad[oa]s?|rehogad[oa]s?|caser[oa]s?|dur[oa]s?|desmigad[oa]s?|trocead[oa]s?|pequeñ[oa]s?|grandes?|median[oa]s?|francesas?)(?![\wáéíóúñ])/gi;
/** Comas (no las de «0,25»), «con», «y», «o»... */
const SEPARADORES = /\s*[;+/]\s*|\s*,(?!\d)\s*|\s+(?:con|y|e|o|u)\s+/i;

/**
 * Antes de separar: quita los comentarios entre paréntesis que no son una cantidad («(si quieres,
 * añadir...)»), «y/o» pasa a ser una coma, lo relleno se separa del relleno y la tortilla lleva
 * huevos.
 */
function preparar(texto: string): string {
  return texto
    .replace(/\(([^)]*)\)/g, (todo, dentro: string) => (CANTIDAD.test(dentro) ? todo : ' '))
    .replace(/\s+y\s*\/\s*o\s+/gi, ', ')
    .replace(/\s+rellen[oa]s?\s+(?:de|con)\s+/gi, ', ')
    .replace(/\btortillas?\s+(?:francesas?\b|de\s+)?/gi, 'huevos, ');
}

const numero = (t: string) => Number(t.replace(',', '.'));

function unidadDe(t: string): { unidad: UnidadNecesidad; factor: number } {
  const u = t.toLowerCase();
  if (u === 'kg') return { unidad: 'kg', factor: 1 };
  if (u === 'ml') return { unidad: 'ml', factor: 1 };
  if (u === 'cl') return { unidad: 'ml', factor: 10 };
  if (u === 'l' || u.startsWith('litro')) return { unidad: 'l', factor: 1 };
  return { unidad: 'g', factor: 1 };
}

/** La necesidad que tiene el mismo nombre, o la que tiene todas sus palabras en el texto. */
function necesidadDe(nombre: string, necesidades: readonly Necesidad[]): Necesidad | undefined {
  const k = clavePlato(nombre);
  const exacta = necesidades.find((n) => clavePlato(n.nombre) === k);
  if (exacta) return exacta;
  const suyas = new Set(palabras(nombre));
  let mejor: { n: Necesidad; largo: number } | undefined;
  for (const n of necesidades) {
    const de = palabras(n.nombre);
    if (de.length === 0 || !de.every((p) => suyas.has(p))) continue;
    if (!mejor || de.length > mejor.largo) mejor = { n, largo: de.length };
  }
  return mejor?.n;
}

/** Un trozo del texto de un plato: «Arroz» con 70 g, «Verduras», «Fruta» con 1 ud. */
export type TrozoPlato = {
  nombre: string;
  cantidad?: number;
  unidad?: UnidadNecesidad;
  /** Va detrás de una «o»: es una alternativa al anterior («cereales o avena»). */
  o?: true;
};

/**
 * Trocea el texto de un plato en lo que parece llevar, con la cantidad si la indica:
 * «Arroz (70g) con verduras y gambas» → arroz (70 g), verduras, gambas. Funciones puras.
 */
export function trozosDelPlato(texto: string): TrozoPlato[] {
  const trozos: TrozoPlato[] = [];
  const vistos = new Set<string>();
  // Con el separador entre paréntesis, split lo devuelve también: así se sabe qué va tras una «o».
  const partes = preparar(texto).split(new RegExp(`(${SEPARADORES.source})`, 'i'));
  for (let p = 0; p < partes.length; p += 2) {
    const trozo = partes[p] ?? '';
    const tras = p > 0 && /^\s+[ou]\s+$/i.test(partes[p - 1] ?? '');
    let resto = trozo.replace(/[.:;]+$/, '').trim();
    let cantidad: number | undefined;
    let unidad: UnidadNecesidad | undefined;

    const medida = CANTIDAD.exec(resto);
    if (medida) {
      const [todo, a = '', b, u = 'g'] = medida;
      const { unidad: un, factor } = unidadDe(u);
      cantidad = Math.max(numero(a), b ? numero(b) : 0) * factor;
      unidad = un;
      resto = resto.replace(todo, ' ').trim();
    }
    const cuenta = /^(\d+(?:[.,]\d+)?)\s+(.+)$/.exec(resto);
    if (cuenta) {
      resto = cuenta[2] ?? '';
      const sinMedida = resto.replace(MEDIDAS, '');
      if (sinMedida !== resto) resto = sinMedida;
      else if (cantidad === undefined) {
        cantidad = numero(cuenta[1] ?? '');
        unidad = 'ud';
      }
    }
    resto = resto
      .replace(ARTICULOS, '')
      .replace(COCINADO, '')
      .replace(PLATO_DE, '')
      .replace(MEDIDAS, '')
      .replace(/[()]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const k = clavePlato(resto);
    if (k.length < 2 || vistos.has(k) || SOLO_PLATO.test(resto)) continue;
    vistos.add(k);
    const t: TrozoPlato = { nombre: resto.charAt(0).toUpperCase() + resto.slice(1) };
    if (cantidad !== undefined && cantidad > 0 && unidad) {
      t.cantidad = cantidad;
      t.unidad = unidad;
    }
    if (tras) t.o = true;
    trozos.push(t);
  }
  return trozos;
}

/**
 * Ingredientes que parece llevar un plato, con la cantidad si la indica: «Arroz (70g) con
 * verduras y gambas» → arroz (70 g), verduras, gambas. Es solo una ayuda: el usuario los revisa.
 */
export function sugerirIngredientes(
  texto: string,
  necesidades: readonly Necesidad[],
): IngredienteSugerido[] {
  return trozosDelPlato(texto).map(({ nombre, cantidad, unidad }) => {
    const necesidad = necesidadDe(nombre, necesidades);
    const sugerido: IngredienteSugerido = { nombre };
    if (necesidad) sugerido.necesidad = necesidad;
    // Solo se propone la cantidad si encaja con la unidad de la necesidad (g con kg...).
    if (
      cantidad !== undefined &&
      unidad &&
      (!necesidad || unidadesCompatibles(necesidad.unidad).includes(unidad))
    ) {
      sugerido.cantidad = cantidad;
      sugerido.unidad = unidad;
    }
    return sugerido;
  });
}
