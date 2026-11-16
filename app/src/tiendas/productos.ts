/**
 * Productos apuntados a mano en las tiendas propias (Lidl, la frutería...). Esas tiendas no
 * publican sus precios en internet, así que el usuario apunta los de lo que compra allí, con
 * la fecha en que los vio.
 */
import { hoyEnEspana } from '../formato.ts';
import type { UnidadNecesidad } from '../necesidades/modelo.ts';
import type { ProductoApp, Unidad } from '../tipos.ts';

/** Un precio con más días que estos se avisa como antiguo. */
export const DIAS_PRECIO_ANTIGUO = 30;

export type ProductoPropio = {
  id: string;
  /** Id de la tienda propia a la que pertenece. */
  tienda: string;
  nombre: string;
  marca?: string;
  /** Formato del envase, siempre en kg, l, ud, lavado o m (los g y ml se pasan a kg y l). */
  formato: { cantidad: number; unidad: Unidad };
  /** € por envase. */
  precio: number;
  /** Cuándo se apuntó o se comprobó el precio por última vez. */
  actualizado: string;
  creado: string;
};

/** Lo que rellena el usuario: la cantidad del envase va en la unidad que elija (g, ml...). */
export type BorradorProducto = {
  nombre: string;
  marca?: string;
  cantidad: number;
  unidad: UnidadNecesidad;
  precio: number;
};

/** Cantidad y unidad del envase tal como la escribe el usuario → formato del producto. */
export function aFormato(cantidad: number, unidad: UnidadNecesidad): ProductoPropio['formato'] {
  if (unidad === 'g') return { cantidad: redondear(cantidad / 1000), unidad: 'kg' };
  if (unidad === 'ml') return { cantidad: redondear(cantidad / 1000), unidad: 'l' };
  return { cantidad, unidad };
}

/** Formato del producto → cantidad y unidad para el formulario (0,5 kg → 500 g). */
export function deFormato(formato: ProductoPropio['formato']): {
  cantidad: number;
  unidad: UnidadNecesidad;
} {
  const { cantidad, unidad } = formato;
  if (unidad === 'kg' && cantidad < 1) return { cantidad: redondear(cantidad * 1000), unidad: 'g' };
  if (unidad === 'l' && cantidad < 1) return { cantidad: redondear(cantidad * 1000), unidad: 'ml' };
  return { cantidad, unidad };
}

function redondear(n: number, decimales = 4): number {
  const f = 10 ** decimales;
  return Math.round(n * f) / f;
}

/** "1,29", "1.29" o "1,29 €" → 1.29. Devuelve null si no es un precio válido. */
export function leerPrecio(texto: string): number | null {
  const limpio = texto.replace(/€/g, '').replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$|^\.\d{1,2}$/.test(limpio)) return null;
  const n = Number(limpio);
  return Number.isFinite(n) && n > 0 && n < 1000 ? n : null;
}

export type ErroresProducto = Partial<Record<'nombre' | 'cantidad' | 'precio', string>>;

export function validarBorradorProducto(b: {
  nombre: string;
  cantidad: number | null;
  precio: number | null;
}): ErroresProducto {
  const errores: ErroresProducto = {};
  if (!b.nombre.trim()) errores.nombre = 'Escribe el nombre del producto.';
  else if (b.nombre.trim().length > 80) errores.nombre = 'Usa un nombre más corto (80 letras).';
  if (b.cantidad === null) {
    errores.cantidad = 'Escribe cuánto trae el envase, por ejemplo 500 (g) o 1 (litro).';
  }
  if (b.precio === null)
    errores.precio = 'Escribe el precio del envase con 2 decimales como mucho, por ejemplo 1,29.';
  return errores;
}

function limpiar(p: ProductoPropio): ProductoPropio {
  const limpio: ProductoPropio = { ...p, nombre: p.nombre.trim() };
  const marca = p.marca?.trim();
  if (marca) limpio.marca = marca;
  else delete limpio.marca;
  return limpio;
}

export function crearProducto(
  tienda: string,
  b: BorradorProducto,
  ahora: string,
  id: string,
): ProductoPropio {
  return limpiar({
    id,
    tienda,
    nombre: b.nombre,
    marca: b.marca,
    formato: aFormato(b.cantidad, b.unidad),
    precio: b.precio,
    actualizado: ahora,
    creado: ahora,
  });
}

/**
 * Aplica los cambios del formulario. La fecha del precio solo cambia si cambia el precio o el
 * formato: corregir una falta en el nombre no hace que un precio antiguo parezca nuevo.
 */
export function editarProducto(
  p: ProductoPropio,
  b: BorradorProducto,
  ahora: string,
): ProductoPropio {
  const formato = aFormato(b.cantidad, b.unidad);
  const cambiaPrecio =
    b.precio !== p.precio ||
    formato.cantidad !== p.formato.cantidad ||
    formato.unidad !== p.formato.unidad;
  return limpiar({
    ...p,
    nombre: b.nombre,
    marca: b.marca,
    formato,
    precio: b.precio,
    actualizado: cambiaPrecio ? ahora : p.actualizado,
  });
}

/** «Sigue al mismo precio»: el precio se ha comprobado hoy. */
export function confirmarPrecio(p: ProductoPropio, ahora: string): ProductoPropio {
  return { ...p, actualizado: ahora };
}

/** Días desde que se comprobó el precio, contados por fechas de España. */
export function diasDesde(actualizado: string, ahora: Date): number {
  const dia = (d: Date) => Date.parse(hoyEnEspana(d));
  return Math.max(0, Math.round((dia(ahora) - dia(new Date(actualizado))) / 86_400_000));
}

export function precioAntiguo(p: ProductoPropio, ahora: Date): boolean {
  return diasDesde(p.actualizado, ahora) > DIAS_PRECIO_ANTIGUO;
}

/** "hoy", "ayer", "hace 5 días". */
export function textoAntiguedad(actualizado: string, ahora: Date): string {
  const dias = diasDesde(actualizado, ahora);
  if (dias === 0) return 'hoy';
  if (dias === 1) return 'ayer';
  return `hace ${dias} días`;
}

/** Nota de un producto: cuándo se comprobó su precio, en naranja si es antiguo. */
export function notaPrecio(p: ProductoPropio, ahora: Date): { texto: string; atencion: boolean } {
  const antiguo = precioAntiguo(p, ahora);
  return {
    texto: `Precio comprobado ${textoAntiguedad(p.actualizado, ahora)}${antiguo ? ': compruébalo' : ''}`,
    atencion: antiguo,
  };
}

/** El producto en el mismo formato que los de Mercadona y Consum, para buscar y comparar. */
export function aProductoApp(p: ProductoPropio): ProductoApp {
  const producto: ProductoApp = {
    tienda: p.tienda,
    id: p.id,
    nombre: p.nombre,
    formato: p.formato,
    precio: p.precio,
    precioRef: redondear(p.precio / p.formato.cantidad),
  };
  if (p.marca) producto.marca = p.marca;
  return producto;
}

const UNIDADES_PRODUCTO: readonly string[] = ['kg', 'l', 'ud', 'lavado', 'm'];
const esFecha = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const positivo = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

/** Motivo por el que un producto apuntado a mano de una copia no es válido, o null si lo es. */
export function problemaProducto(p: Record<string, unknown>): string | null {
  if (typeof p.id !== 'string' || !p.id) return 'le falta el identificador';
  if (typeof p.tienda !== 'string' || !p.tienda) return 'le falta la tienda';
  if (typeof p.nombre !== 'string' || !p.nombre.trim()) return 'le falta el nombre';
  if (p.marca !== undefined && typeof p.marca !== 'string') return 'la marca no es texto';
  const f = p.formato as Record<string, unknown> | null;
  if (typeof f !== 'object' || f === null || !positivo(f.cantidad)) {
    return 'el formato no es válido';
  }
  if (!UNIDADES_PRODUCTO.includes(f.unidad as string)) return 'la unidad no es válida';
  if (!positivo(p.precio)) return 'el precio no es válido';
  if (!esFecha(p.actualizado) || !esFecha(p.creado)) return 'las fechas no son válidas';
  return null;
}
