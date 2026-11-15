import { z } from 'zod';
import type { Pedir } from '../http.ts';
import { cerrarProducto, idDe, normalizarTodos, validar } from '../normalizar.ts';
import type { Normalizado, ResultadoAdaptador } from '../tipos.ts';
import { calcularPrecioRef, coincidePrecioRef, redondear, type Formato } from '../unidades.ts';

export const MERCADONA_API = 'https://tienda.mercadona.es/api';
/** Almacén de Valencia, validado en la fase 0 con el código postal 46001. */
export const ALMACEN = 'vlc1';
export const CODIGO_POSTAL = '46001';

/** Mercadona ya no asigna el almacén esperado al código postal de Valencia. */
export class ErrorZona extends Error {
  override name = 'ErrorZona';
}

const importe = z.union([z.string(), z.number()]).transform((v) => Number(String(v).trim()));
const importeOpcional = z
  .union([z.string(), z.number()])
  .nullish()
  .transform((v) => (v == null || String(v).trim() === '' ? undefined : Number(String(v).trim())));

const ProductoCrudoSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  display_name: z.string().min(1),
  share_url: z.string().nullish(),
  thumbnail: z.string().nullish(),
  price_instructions: z.object({
    unit_price: importe,
    bulk_price: importe,
    reference_format: z.string(),
    unit_size: z.number().nullish(),
    size_format: z.string(),
    total_units: z.number().nullish(),
    pack_size: z.number().nullish(),
    previous_unit_price: importeOpcional,
  }),
});
type InstruccionesPrecio = z.infer<typeof ProductoCrudoSchema>['price_instructions'];

const ArbolSchema = z.object({
  results: z
    .array(
      z.object({
        id: z.number(),
        name: z.string(),
        categories: z.array(z.object({ id: z.number(), name: z.string() })),
      }),
    )
    .min(1),
});

const DetalleSchema = z.object({
  id: z.number(),
  categories: z.array(z.object({ products: z.array(z.unknown()) })),
});

/**
 * Formato del producto según Mercadona. Lo comprobado con las respuestas reales:
 * - Si se vende por kg o litros, unit_size es el total del envase (un pack de 6 briks de 1 L = 6).
 * - Si se cuenta en unidades (huevos, rollos, cápsulas, pastillas), bulk_price es el precio
 *   por pieza. Las piezas pueden estar en total_units (12 rollos) o en unit_size (12 huevos).
 *   En los packs de paquetes, total_units cuenta paquetes y unit_size piezas (pañales: 3
 *   paquetes de 40 = unit_size 120), así que se toma el mayor de los dos.
 * - Los detergentes ("lv", lavados) tienen bulk_price por litro o kg, no por lavado.
 */
export function formatoMercadona(pi: InstruccionesPrecio): Formato | null {
  const tamano = pi.size_format.toLowerCase();
  const positivo = (n: number | null | undefined) => (n && n > 0 ? n : null);
  const unitSize = positivo(pi.unit_size);
  const candidatas = [
    positivo(pi.total_units),
    tamano === 'ud' ? unitSize : null,
    pi.total_units && pi.pack_size ? positivo(pi.total_units * pi.pack_size) : null,
  ].filter((n): n is number => n !== null);
  const piezas = candidatas.length > 0 ? Math.max(...candidatas) : null;

  if (pi.reference_format.toLowerCase() === 'ud' && piezas)
    return { cantidad: piezas, unidad: 'ud' };
  if (tamano === 'kg' || tamano === 'l')
    return unitSize ? { cantidad: unitSize, unidad: tamano } : null;
  if (tamano === 'ud') return piezas ? { cantidad: piezas, unidad: 'ud' } : null;
  return null;
}

/** Convierte un producto de la API de Mercadona al esquema común. */
export function normalizarMercadona(crudo: unknown): Normalizado {
  const r = ProductoCrudoSchema.safeParse(crudo);
  if (!r.success) return { ok: false };
  const p = r.data;
  const pi = p.price_instructions;

  const formato = formatoMercadona(pi);
  if (!formato || !(pi.unit_price > 0)) return { ok: false };

  const precio = redondear(pi.unit_price, 2);
  const precioRef = calcularPrecioRef(precio, formato.cantidad);
  const anterior = pi.previous_unit_price;

  const producto = cerrarProducto({
    tienda: 'mercadona',
    id: p.id,
    nombre: p.display_name.trim(),
    formato,
    precio,
    precioRef,
    precioAnterior: anterior && anterior > precio ? redondear(anterior, 2) : undefined,
    url: p.share_url ?? undefined,
    imagen: p.thumbnail ?? undefined,
  });
  if (!producto) return { ok: false };

  const aviso =
    pi.bulk_price > 0 && !coincidePrecioRef(precioRef, pi.bulk_price)
      ? {
          id: producto.id,
          nombre: producto.nombre,
          unidad: formato.unidad,
          calculado: precioRef,
          tienda: pi.bulk_price,
        }
      : undefined;
  return aviso ? { ok: true, producto, aviso } : { ok: true, producto };
}

/**
 * Recorre todo el catálogo de Mercadona con los precios de Valencia.
 * Mercadona no publica fechas de fin de oferta, así que no usa la fecha de la ejecución.
 */
export async function descargarMercadona(
  pedir: Pedir,
  _ahora: string,
  registrar: (mensaje: string) => void = () => {},
): Promise<ResultadoAdaptador> {
  // 1. Comprobar que el código postal de Valencia sigue siendo el almacén vlc1.
  const zona = await pedir(`${MERCADONA_API}/postal-codes/actions/change-pc/`, {
    metodo: 'PUT',
    cuerpo: { new_postal_code: CODIGO_POSTAL },
  });
  const almacen = zona.cabeceras.get('x-customer-wh');
  if (almacen !== ALMACEN) {
    throw new ErrorZona(
      `El código postal ${CODIGO_POSTAL} corresponde ahora al almacén «${almacen ?? 'ninguno'}», no a «${ALMACEN}»`,
    );
  }

  // 2. Árbol de categorías.
  const arbol = validar(
    ArbolSchema,
    (await pedir(`${MERCADONA_API}/categories/?lang=es&wh=${ALMACEN}`)).datos,
    'el árbol de categorías de Mercadona',
  );
  const ids = arbol.results.flatMap((c) => c.categories.map((s) => s.id));
  registrar(`Mercadona: ${ids.length} categorías`);

  // 3. Productos de cada categoría (un producto puede estar en varias: se guarda una vez).
  const crudos = new Map<string, unknown>();
  for (const [i, id] of ids.entries()) {
    const detalle = validar(
      DetalleSchema,
      (await pedir(`${MERCADONA_API}/categories/${id}/?lang=es&wh=${ALMACEN}`)).datos,
      `la categoría ${id} de Mercadona`,
    );
    for (const sub of detalle.categories) {
      for (const crudo of sub.products) {
        const pid = idDe(crudo);
        const publicado = (crudo as { published?: unknown }).published !== false;
        if (pid && publicado && !crudos.has(pid)) crudos.set(pid, crudo);
      }
    }
    if ((i + 1) % 25 === 0 || i === ids.length - 1) {
      registrar(`Mercadona: ${i + 1}/${ids.length} categorías, ${crudos.size} productos`);
    }
  }

  return normalizarTodos(crudos.values(), normalizarMercadona);
}
