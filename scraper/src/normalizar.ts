import { z } from 'zod';
import {
  ErrorFormato,
  ProductoSchema,
  type AvisoPrecioRef,
  type Normalizado,
  type Producto,
  type ResultadoAdaptador,
} from './tipos.ts';

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

/** Quita las propiedades undefined y valida el producto final con zod. */
export function cerrarProducto(producto: Producto): Producto | null {
  const limpio = Object.fromEntries(Object.entries(producto).filter(([, v]) => v !== undefined));
  const r = ProductoSchema.safeParse(limpio);
  return r.success ? r.data : null;
}

/** Normaliza todos los productos crudos y reúne avisos y recuentos. */
export function normalizarTodos(
  crudos: Iterable<unknown>,
  normalizar: (crudo: unknown) => Normalizado,
): ResultadoAdaptador {
  const productos: Producto[] = [];
  const avisos: AvisoPrecioRef[] = [];
  let sinVerificar = 0;
  let descartados = 0;
  let recibidos = 0;

  for (const crudo of crudos) {
    recibidos++;
    const r = normalizar(crudo);
    if (!r.ok) {
      descartados++;
      continue;
    }
    productos.push(r.producto);
    if (r.aviso) avisos.push(r.aviso);
    if (r.sinVerificar) sinVerificar++;
  }

  productos.sort((a, b) => a.id.localeCompare(b.id, 'es', { numeric: true }));
  return { productos, avisos, sinVerificar, descartados, recibidos };
}
