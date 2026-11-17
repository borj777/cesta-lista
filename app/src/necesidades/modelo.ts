/** Necesidades: lo que hace falta comprar, con su cantidad y cada cuánto. */
import type { IdTienda } from '../tiendas/modelo.ts';

export const CATEGORIAS = ['alimentacion', 'limpieza', 'higiene', 'mascota'] as const;
export type Categoria = (typeof CATEGORIAS)[number];

export const NOMBRE_CATEGORIA: Record<Categoria, string> = {
  alimentacion: 'Alimentación',
  limpieza: 'Limpieza',
  higiene: 'Higiene',
  mascota: 'Mascota',
};

/** Unidades en las que se apunta una necesidad. g y ml se convierten a kg y l al comparar. */
export const UNIDADES_NECESIDAD = ['kg', 'g', 'l', 'ml', 'ud', 'lavado', 'm'] as const;
export type UnidadNecesidad = (typeof UNIDADES_NECESIDAD)[number];

export const NOMBRE_UNIDAD: Record<UnidadNecesidad, { una: string; varias: string }> = {
  kg: { una: 'kg', varias: 'kg' },
  g: { una: 'g', varias: 'g' },
  l: { una: 'litro', varias: 'litros' },
  ml: { una: 'ml', varias: 'ml' },
  ud: { una: 'unidad', varias: 'unidades' },
  lavado: { una: 'lavado', varias: 'lavados' },
  m: { una: 'metro', varias: 'metros' },
};

/** Botones de unidad de los formularios. */
export const OPCIONES_UNIDAD = UNIDADES_NECESIDAD.map((u) => ({
  valor: u,
  texto: {
    kg: 'kg',
    g: 'g',
    l: 'litros',
    ml: 'ml',
    ud: 'unidades',
    lavado: 'lavados',
    m: 'metros',
  }[u],
}));

export const FRECUENCIAS = ['semana', 'quincena', 'mes'] as const;
export type Frecuencia = (typeof FRECUENCIAS)[number];

export const NOMBRE_FRECUENCIA: Record<Frecuencia, string> = {
  semana: 'a la semana',
  quincena: 'cada dos semanas',
  mes: 'al mes',
};

/** Semanas que cubre cada frecuencia (un mes son 52/12 semanas). */
export const SEMANAS: Record<Frecuencia, number> = {
  semana: 1,
  quincena: 2,
  mes: 52 / 12,
};

export type Necesidad = {
  id: string;
  nombre: string;
  categoria: Categoria;
  cantidad: number;
  unidad: UnidadNecesidad;
  frecuencia: Frecuencia;
  notas?: string;
  /** Producto elegido en cada tienda (por id, nunca por nombre) o «no lo compro aquí». */
  equivalencias?: Equivalencias;
  /**
   * Solo se compra para las recetas del menú: no tiene cantidad propia (`cantidad` es 0).
   * Se crea al añadir un ingrediente nuevo a una receta.
   */
  soloRecetas?: true;
  /**
   * Día (AAAA-MM-DD) hasta el que dura lo que se compró la última vez, según lo que se gasta
   * (un paquete de 1 kg de arroz para 320 g a la semana dura unas 3 semanas).
   */
  duraHasta?: string;
  /** Día (AAAA-MM-DD, de España) en que se compró por última vez con la app. */
  ultimaCompra?: string;
  creada: string;
  actualizada: string;
};

/**
 * Lo elegido en cada tienda, por el id de la tienda ('mercadona', 'consum' o el de una tienda
 * propia, como 'lidl').
 */
export type Equivalencia = { id: string } | { noCompro: true };
export type Equivalencias = Partial<Record<IdTienda, Equivalencia>>;

/** Datos que rellena el usuario en el formulario. */
export type BorradorNecesidad = Pick<
  Necesidad,
  'nombre' | 'categoria' | 'cantidad' | 'unidad' | 'frecuencia' | 'notas'
>;

const formatoNumero = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 3 });

/** "1,5" o "1.5" → 1.5. Devuelve null si no es un número positivo. */
export function leerCantidad(texto: string): number | null {
  const limpio = texto.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(limpio)) return null;
  const n = Number(limpio);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** 1.5 → "1,5". */
export function escribirCantidad(n: number): string {
  return formatoNumero.format(n);
}

/** "1,5 kg", "1 unidad", "2 unidades", "50 lavados". */
export function textoCantidad(cantidad: number, unidad: UnidadNecesidad): string {
  const nombre = cantidad === 1 ? NOMBRE_UNIDAD[unidad].una : NOMBRE_UNIDAD[unidad].varias;
  return `${escribirCantidad(cantidad)} ${nombre}`;
}

/** "1,5 kg a la semana". */
export function textoNecesidad(
  n: Pick<Necesidad, 'cantidad' | 'unidad' | 'frecuencia' | 'soloRecetas'>,
): string {
  if (n.soloRecetas) return 'Solo para tus recetas';
  return `${textoCantidad(n.cantidad, n.unidad)} ${NOMBRE_FRECUENCIA[n.frecuencia]}`;
}

/** Necesidades agrupadas por categoría, en el orden de CATEGORIAS y por nombre. */
export function agruparPorCategoria(
  necesidades: Necesidad[],
): { categoria: Categoria; necesidades: Necesidad[] }[] {
  return CATEGORIAS.map((categoria) => ({
    categoria,
    necesidades: necesidades
      .filter((n) => n.categoria === categoria)
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })),
  })).filter((g) => g.necesidades.length > 0);
}

export type ErroresBorrador = Partial<Record<'nombre' | 'cantidad', string>>;

/** Comprueba lo que ha escrito el usuario. Devuelve los errores por campo. */
export function validarBorrador(b: { nombre: string; cantidad: number | null }): ErroresBorrador {
  const errores: ErroresBorrador = {};
  if (!b.nombre.trim()) errores.nombre = 'Escribe qué necesitas comprar.';
  else if (b.nombre.trim().length > 80) errores.nombre = 'Usa un nombre más corto (80 letras).';
  if (b.cantidad === null)
    errores.cantidad = 'Escribe una cantidad mayor que cero, por ejemplo 1,5.';
  return errores;
}

/** Crea una necesidad nueva a partir del formulario. */
export function crearNecesidad(b: BorradorNecesidad, ahora: string, id: string): Necesidad {
  return limpiar({ ...b, id, creada: ahora, actualizada: ahora });
}

/**
 * Aplica los cambios del formulario a una necesidad existente. Si era solo para recetas y
 * ahora tiene cantidad propia, deja de serlo.
 */
export function editarNecesidad(n: Necesidad, b: BorradorNecesidad, ahora: string): Necesidad {
  const editada = limpiar({ ...n, ...b, actualizada: ahora });
  if (b.cantidad > 0) delete editada.soloRecetas;
  return editada;
}

/** Quita espacios sobrantes y las notas vacías. */
function limpiar(n: Necesidad): Necesidad {
  const limpia: Necesidad = { ...n, nombre: n.nombre.trim() };
  const notas = n.notas?.trim();
  if (notas) limpia.notas = notas;
  else delete limpia.notas;
  return limpia;
}

/** Elige un producto de una tienda para una necesidad (se guarda por id). */
export function elegirProducto(
  n: Necesidad,
  tienda: IdTienda,
  id: string,
  ahora: string,
): Necesidad {
  return { ...n, equivalencias: { ...n.equivalencias, [tienda]: { id } }, actualizada: ahora };
}

/** Marca que esta necesidad no se compra en una tienda. */
export function noComprarEn(n: Necesidad, tienda: IdTienda, ahora: string): Necesidad {
  return {
    ...n,
    equivalencias: { ...n.equivalencias, [tienda]: { noCompro: true } },
    actualizada: ahora,
  };
}

/** Quita la elección de una tienda (vuelve a «sin elegir»). */
export function quitarEquivalencia(n: Necesidad, tienda: IdTienda, ahora: string): Necesidad {
  const equivalencias = Object.fromEntries(
    Object.entries(n.equivalencias ?? {}).filter(([t]) => t !== tienda),
  ) as Equivalencias;
  const resultado: Necesidad = { ...n, equivalencias, actualizada: ahora };
  if (Object.keys(equivalencias).length === 0) delete resultado.equivalencias;
  return resultado;
}

export type EstadoEquivalencia<P> =
  | { tipo: 'sin-elegir' }
  | { tipo: 'no-compro' }
  | { tipo: 'elegido'; producto: P }
  /** El producto elegido ya no está en el catálogo de la tienda: hay que elegir otro. */
  | { tipo: 'desaparecido'; id: string };

/** Estado de la equivalencia de una tienda, buscando el producto elegido por su id. */
export function estadoEquivalencia<P>(
  n: Necesidad,
  tienda: IdTienda,
  buscarProducto: (tienda: IdTienda, id: string) => P | undefined,
): EstadoEquivalencia<P> {
  const e = n.equivalencias?.[tienda];
  if (!e) return { tipo: 'sin-elegir' };
  if ('noCompro' in e) return { tipo: 'no-compro' };
  const producto = buscarProducto(tienda, e.id);
  return producto ? { tipo: 'elegido', producto } : { tipo: 'desaparecido', id: e.id };
}
