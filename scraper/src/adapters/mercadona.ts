import { z } from 'zod';
import type { Pedir } from '../http.ts';
import { cerrarProducto, idDe, normalizarTodos, validar } from '../normalizar.ts';
import type { Normalizado, ResultadoAdaptador, Unidad } from '../tipos.ts';
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
    drained_weight: z.number().nullish(),
    selling_method: z.number().nullish(),
    previous_unit_price: importeOpcional,
  }),
});
export type InstruccionesPrecio = z.infer<typeof ProductoCrudoSchema>['price_instructions'];

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

/** Cómo se interpreta un producto de Mercadona. */
export type Interpretacion = {
  /** Formato en la unidad de nuestro precioRef. */
  formato: Formato;
  /** Precio por artículo. En los productos a granel, el precio por kg. */
  precio: number;
  /**
   * Cantidades a las que puede referirse el bulk_price de la tienda, para comprobarlo.
   * La primera es la esperada; las demás cubren las incoherencias conocidas de Mercadona.
   */
  cantidadesTienda: number[];
  /** Unidad de la cantidad esperada de la tienda. */
  unidadTienda: Unidad;
  /** El precioRef es el de la propia tienda (granel): no se puede comprobar. */
  deLaTienda?: boolean;
};

const positivo = (n: number | null | undefined): number | null => (n && n > 0 ? n : null);

/**
 * Interpreta el formato de un producto de Mercadona. Lo comprobado con respuestas reales:
 * - Kg, litros o metros: unit_size es el total del envase (6 briks de 1 L = 6). Si falta, como
 *   en los congelados, vale el peso neto escurrido (drained_weight), igual que hace la tienda.
 * - A granel (selling_method 1: gambón, morralla) se vende al peso: unit_price no es un precio
 *   real (1.282,05 €) y el que vale es bulk_price, por kg.
 * - Detergentes ("lv"): el precioRef va por lavado; bulk_price va por litro, kg o lavado.
 * - Contados en unidades (huevos, rollos, pañales): las piezas están en total_units o en
 *   unit_size; en los packs de paquetes (3 paquetes de 40 pañales) se toma el mayor.
 * - Si se conoce el peso, el precioRef va siempre por kg (o l), aunque la tienda dé el precio
 *   por pieza (fuet, longaniza, chorizo: reference_format "ud" con unit_size en kg).
 */
export function interpretarMercadona(pi: InstruccionesPrecio): Interpretacion | null {
  const tamano = pi.size_format.toLowerCase();
  const referencia = pi.reference_format.toLowerCase();

  if (pi.selling_method === 1) {
    if (!(pi.bulk_price > 0)) return null;
    const unidad = tamano === 'l' ? 'l' : 'kg';
    return {
      formato: { cantidad: 1, unidad },
      precio: redondear(pi.bulk_price, 2),
      cantidadesTienda: [1],
      unidadTienda: unidad,
      deLaTienda: true,
    };
  }
  if (!(pi.unit_price > 0)) return null;
  const precio = redondear(pi.unit_price, 2);

  const unidades = positivo(pi.total_units);
  const unitSize = positivo(pi.unit_size);
  const medida =
    tamano === 'kg' || tamano === 'l'
      ? (unitSize ?? positivo(pi.drained_weight))
      : tamano === 'm'
        ? unitSize
        : null;
  const candidatasPiezas = [
    unidades,
    tamano === 'ud' ? unitSize : null,
    unidades && pi.pack_size ? positivo(unidades * pi.pack_size) : null,
  ].filter((n): n is number => n !== null);
  const piezas = candidatasPiezas.length > 0 ? Math.max(...candidatasPiezas) : null;

  // Otras cantidades a las que Mercadona refiere a veces su bulk_price.
  const alternativas = [unitSize, positivo(pi.drained_weight), unidades, piezas, 1];
  const conAlternativas = (esperada: number) =>
    [esperada, ...alternativas].filter(
      (n, i, lista): n is number => n !== null && lista.indexOf(n) === i,
    );

  if (referencia === 'lv' && medida && (tamano === 'kg' || tamano === 'l')) {
    return {
      formato: unidades
        ? { cantidad: unidades, unidad: 'lavado' }
        : { cantidad: medida, unidad: tamano },
      precio,
      cantidadesTienda: conAlternativas(medida),
      unidadTienda: tamano,
    };
  }
  if (tamano === 'ud') {
    return piezas
      ? {
          formato: { cantidad: piezas, unidad: 'ud' },
          precio,
          cantidadesTienda: conAlternativas(piezas),
          unidadTienda: 'ud',
        }
      : null;
  }
  if (medida && (tamano === 'kg' || tamano === 'l' || tamano === 'm')) {
    // Si la tienda da el precio por pieza, la cantidad esperada son las piezas (o 1).
    const porPieza = referencia === 'ud' || referencia === 'dc';
    const esperada = porPieza ? (unidades ?? 1) : medida;
    return {
      formato: { cantidad: medida, unidad: tamano },
      precio,
      cantidadesTienda: conAlternativas(esperada),
      unidadTienda: porPieza ? 'ud' : tamano,
    };
  }
  if (referencia === 'ud' && piezas) {
    return {
      formato: { cantidad: piezas, unidad: 'ud' },
      precio,
      cantidadesTienda: conAlternativas(piezas),
      unidadTienda: 'ud',
    };
  }
  return null;
}

/** Convierte un producto de la API de Mercadona al esquema común. */
export function normalizarMercadona(crudo: unknown): Normalizado {
  const r = ProductoCrudoSchema.safeParse(crudo);
  if (!r.success) return { ok: false };
  const p = r.data;
  const pi = p.price_instructions;

  const interpretacion = interpretarMercadona(pi);
  if (!interpretacion) return { ok: false };
  const { formato, precio, cantidadesTienda, unidadTienda } = interpretacion;
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
  if (interpretacion.deLaTienda) return { ok: true, producto, sinVerificar: true };
  if (!(pi.bulk_price > 0)) return { ok: true, producto, sinVerificar: true };

  // Comprobación siempre en la misma unidad que la tienda, para no mezclar € por pieza y € por kg.
  const cuadra = cantidadesTienda.find((c) => coincidePrecioRef(precio / c, pi.bulk_price));
  if (cuadra === undefined) {
    const esperada = cantidadesTienda[0] ?? formato.cantidad;
    return {
      ok: true,
      producto,
      aviso: {
        id: producto.id,
        nombre: producto.nombre,
        unidad: unidadTienda,
        calculado: calcularPrecioRef(precio, esperada),
        tienda: pi.bulk_price,
      },
    };
  }
  // La tienda cuadra, pero con otra cantidad (p. ej. por pieza y nosotros por kg): nuestro
  // precioRef es correcto, pero no se puede contrastar directamente con el suyo.
  return Math.abs(cuadra - formato.cantidad) < 1e-9
    ? { ok: true, producto }
    : { ok: true, producto, sinVerificar: true };
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
