/**
 * Recetas: los platos de la dieta («Paella», «Sopa de pollo») con sus ingredientes. Cada
 * ingrediente es una necesidad, así que se aprovechan los productos elegidos en cada tienda.
 * Funciones puras.
 */
import { palabras } from '../buscador.ts';
import { crearNecesidad, type Necesidad, type UnidadNecesidad } from '../necesidades/modelo.ts';

export type Ingrediente = {
  /** Id de la necesidad. */
  necesidad: string;
  /** Cantidad para todas las raciones de la receta. */
  cantidad: number;
  unidad: UnidadNecesidad;
};

export type Receta = {
  id: string;
  nombre: string;
  /** Raciones que salen con estas cantidades. */
  raciones: number;
  ingredientes: Ingrediente[];
  notas?: string;
  /** Cómo aparece el plato en el PDF de la dieta, para reconocerlo otros meses. */
  alias?: string[];
  creada: string;
  actualizada: string;
};

/** Unidades que se pueden usar en un ingrediente nuevo. */
export const UNIDADES_INGREDIENTE = [
  'g',
  'kg',
  'ml',
  'l',
  'ud',
] as const satisfies readonly UnidadNecesidad[];

const FAMILIA: Record<UnidadNecesidad, string> = {
  kg: 'peso',
  g: 'peso',
  l: 'volumen',
  ml: 'volumen',
  ud: 'ud',
  lavado: 'lavado',
  m: 'm',
};
const FACTOR: Record<UnidadNecesidad, number> = {
  kg: 1,
  g: 0.001,
  l: 1,
  ml: 0.001,
  ud: 1,
  lavado: 1,
  m: 1,
};

/** Unidades en las que se puede escribir un ingrediente de una necesidad (g o kg, ml o l...). */
export function unidadesCompatibles(unidad: UnidadNecesidad): UnidadNecesidad[] {
  return (Object.keys(FAMILIA) as UnidadNecesidad[]).filter((u) => FAMILIA[u] === FAMILIA[unidad]);
}

/** Pasa una cantidad a otra unidad de la misma familia (160 g → 0,16 kg). */
export function convertir(cantidad: number, de: UnidadNecesidad, a: UnidadNecesidad): number {
  if (FAMILIA[de] !== FAMILIA[a]) throw new Error(`No se puede pasar de ${de} a ${a}`);
  return Math.round(((cantidad * FACTOR[de]) / FACTOR[a]) * 1e6) / 1e6;
}

/** Cantidad de un ingrediente por ración, en la unidad de su necesidad. */
export function porRacion(
  receta: Receta,
  ing: Ingrediente,
  unidadNecesidad: UnidadNecesidad,
): number {
  return convertir(ing.cantidad, ing.unidad, unidadNecesidad) / receta.raciones;
}

/** Necesidades cuyo nombre encaja con lo escrito, las que más se parecen primero. */
export function sugerirNecesidades(
  texto: string,
  necesidades: Necesidad[],
  limite = 6,
): Necesidad[] {
  const buscadas = palabras(texto);
  if (buscadas.length === 0) return [];
  return necesidades
    .map((n) => {
      const suyas = palabras(n.nombre);
      const aciertos = buscadas.filter((b) => suyas.some((s) => s.startsWith(b))).length;
      return { n, aciertos, todas: aciertos === buscadas.length };
    })
    .filter((x) => x.aciertos > 0)
    .sort(
      (a, b) =>
        Number(b.todas) - Number(a.todas) ||
        b.aciertos - a.aciertos ||
        a.n.nombre.localeCompare(b.n.nombre, 'es'),
    )
    .slice(0, limite)
    .map((x) => x.n);
}

/**
 * Necesidad nueva para un ingrediente: solo se compra para las recetas (no tiene cantidad
 * propia) y es de alimentación.
 */
export function necesidadParaIngrediente(
  nombre: string,
  unidad: UnidadNecesidad,
  ahora: string,
  id: string,
): Necesidad {
  return {
    ...crearNecesidad(
      { nombre, categoria: 'alimentacion', cantidad: 0, unidad, frecuencia: 'semana' },
      ahora,
      id,
    ),
    soloRecetas: true,
  };
}

export type ErroresReceta = Partial<Record<'nombre' | 'raciones' | 'ingredientes', string>>;

export function validarReceta(r: {
  nombre: string;
  raciones: number | null;
  ingredientes: unknown[];
}): ErroresReceta {
  const errores: ErroresReceta = {};
  if (!r.nombre.trim()) errores.nombre = 'Escribe el nombre del plato.';
  else if (r.nombre.trim().length > 80) errores.nombre = 'Usa un nombre más corto (80 letras).';
  if (r.raciones === null || !Number.isInteger(r.raciones) || r.raciones < 1 || r.raciones > 50) {
    errores.raciones = 'Escribe cuántas raciones salen, de 1 a 50.';
  }
  if (r.ingredientes.length === 0) errores.ingredientes = 'Añade al menos un ingrediente.';
  return errores;
}

/** Recetas que usan una necesidad. */
export function recetasCon(recetas: Receta[], necesidad: string): Receta[] {
  return recetas.filter((r) => r.ingredientes.some((i) => i.necesidad === necesidad));
}

const esFecha = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const positivo = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
const esObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Motivo por el que una receta de una copia no es válida, o null si lo es. */
export function problemaReceta(
  r: Record<string, unknown>,
  necesidades: ReadonlyMap<string, UnidadNecesidad>,
): string | null {
  if (typeof r.id !== 'string' || !r.id) return 'le falta el identificador';
  if (typeof r.nombre !== 'string' || !r.nombre.trim()) return 'le falta el nombre';
  if (!positivo(r.raciones) || !Number.isInteger(r.raciones)) return 'las raciones no son válidas';
  if (!Array.isArray(r.ingredientes)) return 'los ingredientes no son válidos';
  for (const i of r.ingredientes) {
    if (!esObjeto(i) || typeof i.necesidad !== 'string' || !positivo(i.cantidad)) {
      return 'algún ingrediente no es válido';
    }
    const unidad = necesidades.get(i.necesidad);
    if (!unidad) return 'algún ingrediente no está en tus necesidades';
    if (typeof i.unidad !== 'string' || !(i.unidad in FAMILIA)) {
      return 'la unidad de algún ingrediente no es válida';
    }
    if (FAMILIA[i.unidad as UnidadNecesidad] !== FAMILIA[unidad]) {
      return 'la unidad de algún ingrediente no encaja con su necesidad';
    }
  }
  if (r.notas !== undefined && typeof r.notas !== 'string') return 'las notas no son texto';
  if (
    r.alias !== undefined &&
    (!Array.isArray(r.alias) ||
      r.alias.length > 50 ||
      !r.alias.every((a) => typeof a === 'string' && a.trim() && a.length <= 300))
  ) {
    return 'los nombres de la dieta no son válidos';
  }
  if (!esFecha(r.creada) || !esFecha(r.actualizada)) return 'las fechas no son válidas';
  return null;
}
