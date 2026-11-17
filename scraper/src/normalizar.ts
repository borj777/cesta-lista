import { z } from 'zod';
import {
  ErrorFormato,
  ProductoSchema,
  type AvisoPrecioRef,
  type Normalizado,
  type Producto,
  type ResultadoAdaptador,
} from './tipos.ts';

/** Ejemplos de avisos de precioRef que se guardan en meta.json (el total va aparte). */
export const MAX_EJEMPLOS = 20;
/** Descartados que se guardan en meta.json: casi todos, para poder revisarlos uno a uno. */
export const MAX_DESCARTADOS = 300;

/** Valida una respuesta de la tienda; si no tiene la forma esperada, lanza ErrorFormato. */
export function validar<T>(esquema: z.ZodType<T>, datos: unknown, que: string): T {
  const r = esquema.safeParse(datos);
  if (!r.success) {
    throw new ErrorFormato(
      `Formato inesperado en ${que}: ${z.prettifyError(r.error).slice(0, 300)}`,
    );
  }
  return r.data;
}

/** Id de un producto crudo, o null si no lo tiene. */
export function idDe(crudo: unknown): string | null {
  if (typeof crudo !== 'object' || crudo === null || !('id' in crudo)) return null;
  const id = (crudo as { id: unknown }).id;
  return typeof id === 'string' || typeof id === 'number' ? String(id) : null;
}

/** "id nombre" de un producto crudo, para identificar los descartados en meta.json. */
export function descripcionCruda(crudo: unknown): string {
  const c = (typeof crudo === 'object' && crudo !== null ? crudo : {}) as {
    display_name?: unknown;
    productData?: { description?: unknown; name?: unknown };
  };
  const nombre = c.display_name ?? c.productData?.description ?? c.productData?.name ?? '?';
  return `${idDe(crudo) ?? '?'} ${String(nombre)}`;
}

/** Quita las propiedades undefined y valida el producto final con zod. */
export function cerrarProducto(producto: Producto): Producto | null {
  const limpio = Object.fromEntries(Object.entries(producto).filter(([, v]) => v !== undefined));
  const r = ProductoSchema.safeParse(limpio);
  return r.success ? r.data : null;
}

/**
 * Normaliza todos los productos crudos y reúne avisos y recuentos.
 * `describir` da el "id nombre" de un descartado (por defecto, a partir del producto crudo).
 */
export function normalizarTodos<T>(
  crudos: Iterable<T>,
  normalizar: (crudo: T) => Normalizado,
  describir: (crudo: T) => string = descripcionCruda,
): ResultadoAdaptador {
  const productos: Producto[] = [];
  const avisos: AvisoPrecioRef[] = [];
  let sinVerificar = 0;
  let descartados = 0;
  let recibidos = 0;
  const ejemplosDescartados: string[] = [];

  for (const crudo of crudos) {
    recibidos++;
    const r = normalizar(crudo);
    if (!r.ok) {
      descartados++;
      if (ejemplosDescartados.length < MAX_DESCARTADOS) {
        ejemplosDescartados.push(describir(crudo));
      }
      continue;
    }
    productos.push(r.producto);
    if (r.aviso) avisos.push(r.aviso);
    if (r.sinVerificar) sinVerificar++;
  }

  productos.sort((a, b) => a.id.localeCompare(b.id, 'es', { numeric: true }));
  return { productos, avisos, sinVerificar, descartados, recibidos, ejemplosDescartados };
}

/** Añade al producto normalizado la sección de la tienda donde está, si se conoce. */
export function conSeccion(r: Normalizado, seccion: string | undefined): Normalizado {
  return r.ok && seccion ? { ...r, producto: { ...r.producto, seccion } } : r;
}

/** Solo los nombres de las secciones que tienen algún producto, ordenados por id. */
export function seccionesUsadas(
  productos: Producto[],
  nombres: Readonly<Record<string, string>>,
): Record<string, string> {
  const usadas = new Set(productos.map((p) => p.seccion).filter((s) => s !== undefined));
  return Object.fromEntries(
    [...usadas]
      .filter((id) => nombres[id])
      .sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))
      .map((id) => [id, nombres[id] as string]),
  );
}
