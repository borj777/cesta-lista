import { z } from 'zod';
import { MAX_EJEMPLOS } from './normalizar.ts';
import type { Veredicto } from './proteccion.ts';
import {
  ProductoSchema,
  TIENDAS,
  UNIDADES,
  type AvisoPrecioRef,
  type Producto,
  type ResultadoAdaptador,
} from './tipos.ts';

export { MAX_EJEMPLOS };

const AvisoSchema = z.object({
  id: z.string(),
  nombre: z.string(),
  unidad: z.enum(UNIDADES),
  calculado: z.number(),
  tienda: z.number(),
});

export const EstadoTiendaSchema = z.object({
  /** "ok" si la última ejecución fue bien; "fallida" si se conservaron los datos anteriores. */
  estado: z.enum(['ok', 'fallida']),
  /** Fecha de la última descarga buena: la de los precios que hay en data/. */
  actualizado: z.string().nullable(),
  /** Fecha de la última ejecución, haya ido bien o mal. */
  comprobado: z.string(),
  /** Productos guardados en data/. */
  productos: z.number().int().nonnegative(),
  /** Por qué ha fallado (solo si estado = "fallida"). */
  motivo: z.string().optional(),
  duracionSegundos: z.number().nonnegative(),
  peticiones: z.number().int().nonnegative(),
  /** Productos con el precioRef de la tienda que no se ha podido comprobar (fruta por piezas). */
  sinVerificar: z.number().int().nonnegative(),
  /** Productos recibidos que no se han podido leer. */
  descartados: z.number().int().nonnegative(),
  /** Productos cuyo precioRef calculado no coincide con el de la tienda. */
  avisosPrecioRef: z.number().int().nonnegative(),
  ejemplosAvisos: z.array(AvisoSchema),
  /** "id nombre" de algunos productos descartados, para revisar por qué no se pudieron leer. */
  ejemplosDescartados: z.array(z.string()).optional(),
});
export type EstadoTienda = z.infer<typeof EstadoTiendaSchema>;

export const MetaSchema = z.object({
  generado: z.string(),
  tiendas: z.partialRecord(z.enum(TIENDAS), EstadoTiendaSchema),
});
export type Meta = z.infer<typeof MetaSchema>;

/** Estado de una tienda tras una ejecución. */
export function estadoTienda(args: {
  previo: EstadoTienda | undefined;
  ahora: string;
  duracionSegundos: number;
  peticiones: number;
  resultado: ResultadoAdaptador | null;
  veredicto: Veredicto;
}): EstadoTienda {
  const { previo, ahora, resultado, veredicto } = args;
  const avisos: AvisoPrecioRef[] = resultado?.avisos ?? [];
  const comun = {
    comprobado: ahora,
    duracionSegundos: Math.round(args.duracionSegundos),
    peticiones: args.peticiones,
    sinVerificar: resultado?.sinVerificar ?? 0,
    descartados: resultado?.descartados ?? 0,
    avisosPrecioRef: avisos.length,
    ejemplosAvisos: avisos.slice(0, MAX_EJEMPLOS),
    ejemplosDescartados: (resultado?.ejemplosDescartados ?? []).slice(0, MAX_EJEMPLOS),
  };

  if (veredicto.valido && resultado) {
    return { estado: 'ok', actualizado: ahora, productos: resultado.productos.length, ...comun };
  }
  return {
    estado: 'fallida',
    actualizado: previo?.actualizado ?? null,
    productos: previo?.productos ?? 0,
    motivo: veredicto.valido ? 'Error desconocido' : veredicto.motivo,
    ...comun,
  };
}

/** Lee los productos guardados; null si no hay archivo o no es válido. */
export function leerProductos(datos: unknown): Producto[] | null {
  const r = z.array(ProductoSchema).safeParse(datos);
  return r.success ? r.data : null;
}

/** JSON con un producto por línea: compacto y con diferencias legibles en cada commit. */
export function serializarProductos(productos: Producto[]): string {
  return `[\n${productos.map((p) => JSON.stringify(p)).join(',\n')}\n]\n`;
}
