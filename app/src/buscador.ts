/**
 * Buscador de productos sobre app.json: encuentra los que contienen todas las palabras
 * buscadas (sin tildes, singular o plural) y los ordena por precio por unidad.
 */
import type { ProductoApp, Tienda, Unidad } from './tipos.ts';

/** Palabras que no ayudan a buscar. */
const VACIAS = new Set([
  'a',
  'al',
  'con',
  'de',
  'del',
  'e',
  'el',
  'en',
  'la',
  'las',
  'lo',
  'los',
  'o',
  'para',
  'por',
  'sin',
  'su',
  'u',
  'un',
  'una',
  'y',
]);

/** "Plátanos" → "platanos". */
export function normalizar(texto: string): string {
  return texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ñ/g, 'n');
}

/** Raíz sencilla para que "huevos" encuentre "huevo" y "limones", "limón". */
function raiz(palabra: string): string {
  if (palabra.length > 4 && palabra.endsWith('es')) return palabra.slice(0, -2);
  if (palabra.length > 3 && palabra.endsWith('s')) return palabra.slice(0, -1);
  return palabra;
}

/** Palabras útiles de un texto, ya normalizadas. */
export function palabras(texto: string): string[] {
  return normalizar(texto)
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length > 0 && !VACIAS.has(p))
    .map(raiz);
}

const indices = new WeakMap<ProductoApp[], Map<ProductoApp, string[]>>();

function palabrasDe(productos: ProductoApp[], p: ProductoApp): string[] {
  let indice = indices.get(productos);
  if (!indice) {
    indice = new Map();
    indices.set(productos, indice);
  }
  let resultado = indice.get(p);
  if (!resultado) {
    resultado = palabras(`${p.nombre} ${p.marca ?? ''}`);
    indice.set(p, resultado);
  }
  return resultado;
}

export type ResultadoBusqueda = {
  /** Mismo código de barras que el producto elegido en otra tienda. */
  mismoCodigo: ProductoApp[];
  /** Misma unidad que la necesidad, del más barato al más caro por unidad. */
  comparables: ProductoApp[];
  /** Otra unidad: no se pueden comparar por precio por unidad. */
  otros: ProductoApp[];
  /** Cuántos productos de la tienda encajan con la búsqueda en total. */
  total: number;
};

export function buscar(
  productos: ProductoApp[],
  opciones: {
    consulta: string;
    tienda: Tienda;
    unidad: Unidad;
    eans?: ReadonlySet<string>;
    limite?: number;
    /** Con la búsqueda vacía, devuelve todos los productos de la tienda (para Lidl, que son pocos). */
    todosSiVacia?: boolean;
  },
): ResultadoBusqueda {
  const { consulta, tienda, unidad, eans, limite = 40, todosSiVacia = false } = opciones;
  const buscadas = palabras(consulta);
  const vacio = { mismoCodigo: [], comparables: [], otros: [], total: 0 };
  if (buscadas.length === 0 && !todosSiVacia) return vacio;

  const encajan = productos.filter((p) => {
    if (p.tienda !== tienda) return false;
    const suyas = palabrasDe(productos, p);
    return buscadas.every((b) => suyas.some((s) => s.startsWith(b)));
  });

  const mismoCodigo = eans?.size
    ? productos.filter((p) => p.tienda === tienda && p.ean && eans.has(p.ean))
    : [];
  const yaMostrados = new Set(mismoCodigo);
  const resto = encajan.filter((p) => !yaMostrados.has(p));

  const comparables = resto
    .filter((p) => p.formato.unidad === unidad)
    .sort((a, b) => a.precioRef - b.precioRef || a.precio - b.precio);
  const otros = resto
    .filter((p) => p.formato.unidad !== unidad)
    .sort((a, b) => a.precio - b.precio);

  return {
    mismoCodigo,
    comparables: comparables.slice(0, limite),
    otros: otros.slice(0, Math.ceil(limite / 4)),
    total: encajan.length + mismoCodigo.filter((p) => !encajan.includes(p)).length,
  };
}

/** Busca un producto por tienda e id. */
export function indicePorId(productos: ProductoApp[]): Map<string, ProductoApp> {
  return new Map(productos.map((p) => [`${p.tienda}:${p.id}`, p]));
}
