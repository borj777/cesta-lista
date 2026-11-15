import { z } from 'zod';

/** Esquema normalizado de producto, común a todas las tiendas (ver CLAUDE.md). */
export const TIENDAS = ['mercadona', 'consum', 'lidl'] as const;
export type Tienda = (typeof TIENDAS)[number];

export const UNIDADES = ['kg', 'l', 'ud'] as const;
export type Unidad = (typeof UNIDADES)[number];

export const ProductoSchema = z.object({
  tienda: z.enum(TIENDAS),
  id: z.string().min(1),
  ean: z.string().min(1).optional(),
  nombre: z.string().min(1),
  marca: z.string().min(1).optional(),
  formato: z.object({
    cantidad: z.number().positive(),
    unidad: z.enum(UNIDADES),
  }),
  precio: z.number().positive(),
  precioRef: z.number().positive(),
  precioAnterior: z.number().positive().optional(),
  oferta: z.string().min(1).optional(),
  url: z.string().min(1).optional(),
  imagen: z.string().min(1).optional(),
  actualizado: z.iso.datetime(),
});

export type Producto = z.infer<typeof ProductoSchema>;

/** El precioRef calculado no coincide con el que publica la tienda. */
export type AvisoPrecioRef = {
  id: string;
  nombre: string;
  unidad: Unidad;
  calculado: number;
  tienda: number;
};

/** Lo que devuelve cada adaptador tras recorrer el catálogo de su tienda. */
export type ResultadoAdaptador = {
  productos: Producto[];
  avisos: AvisoPrecioRef[];
  /** Productos cuyo precioRef se ha tomado de la tienda sin poder comprobarlo (p. ej. fruta suelta). */
  sinVerificar: number;
  /** Productos recibidos que no se han podido convertir al esquema común. */
  descartados: number;
  /** Total de productos distintos recibidos de la tienda. */
  recibidos: number;
  /** Productos que la tienda dice tener, si lo indica (Consum: totalCount). */
  esperados?: number;
};

/** La respuesta de la tienda no tiene la forma esperada: posible cambio de formato. */
export class ErrorFormato extends Error {
  override name = 'ErrorFormato';
}

/** Resultado de normalizar un producto suelto. */
export type Normalizado =
  { ok: true; producto: Producto; aviso?: AvisoPrecioRef; sinVerificar?: boolean } | { ok: false };
