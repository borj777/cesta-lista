import { z } from 'zod';
import type { Pedir } from '../http.ts';
import { cerrarProducto, normalizarTodos, seccionesUsadas } from '../normalizar.ts';
import { ErrorFormato, UNIDADES, type Normalizado, type ResultadoAdaptador } from '../tipos.ts';
import {
  calcularPrecioRef,
  parsearFormatoDescripcion,
  redondear,
  type Formato,
} from '../unidades.ts';

/**
 * Ofertas semanales de Lidl (comprobado el 18/11/2026). Lidl no tiene catálogo de
 * alimentación en su web: solo publica esta página, con unas 75 ofertas. Cada oferta va en
 * el atributo `data-grid-data` de su tarjeta, como JSON escrito con entidades HTML.
 */
export const LIDL_OFERTAS = 'https://www.lidl.es/c/store/ofertas-semanales/a10089449';
export const LIDL_WEB = 'https://www.lidl.es';
/** Provincia cuyos precios se usan (en `regionsV2`, con un espacio al final: «Valencia »). */
export const PROVINCIA = 'valencia';
/** «Mundos» de Lidl que son de comprar en el súper; el resto (bricolaje, ropa...) no interesa. */
const MUNDOS = ['Comida y cerca de la comida', 'Vino, cerveza y licores'];
/** Categorías antiguas, por si falta la ruta completa. */
const CATEGORIAS = ['Food', 'F+V'];

const texto = z
  .string()
  .nullish()
  .transform((v) => v?.trim() || undefined);

const PrecioSchema = z.object({
  price: z.number(),
  oldPrice: z.number().nullish(),
  packaging: z.object({ text: texto }).nullish(),
  basePrice: z.object({ text: texto }).nullish(),
  startDate: texto,
  endDate: texto,
  discount: z.object({ percentageDiscount: z.number().nullish() }).nullish(),
});
type Precio = z.infer<typeof PrecioSchema>;

export const OfertaSchema = z.object({
  productId: z.union([z.string(), z.number()]).transform(String),
  fullTitle: z.string().min(1),
  /** Nombre sin la marca. */
  title: texto,
  brand: z.object({ name: texto }).nullish(),
  category: texto,
  keyfacts: z
    .object({
      wonCategoryPrimary: texto,
      wonCategoryPrimaryPath: texto,
    })
    .nullish(),
  regions: z.array(z.number()).nullish(),
  regionsV2: z
    .record(
      z.string(),
      z.object({
        regionName: z.string(),
        // Ceuta, Melilla y Canarias no tienen zona de precios (null).
        regionPriceId: z
          .union([z.string(), z.number()])
          .nullish()
          .transform((v) => (v == null ? undefined : String(v))),
      }),
    )
    .nullish(),
  regionsPrices: z.record(
    z.string(),
    z.object({
      currentPrice: PrecioSchema.nullish(),
      currentLidlPlusPrice: z.object({ price: PrecioSchema }).nullish(),
    }),
  ),
  canonicalUrl: texto,
  image: texto,
});
type Oferta = z.infer<typeof OfertaSchema>;

const ENTIDADES: Record<string, string> = {
  quot: '"',
  amp: '&',
  apos: "'",
  lt: '<',
  gt: '>',
  nbsp: ' ',
};

/** Deshace las entidades HTML (&quot;, &amp;, &#39;, &#x27;...). */
export function decodificarEntidades(s: string): string {
  return s.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (todo, e: string) => {
    if (e.startsWith('#x') || e.startsWith('#X'))
      return String.fromCodePoint(parseInt(e.slice(2), 16));
    if (e.startsWith('#')) return String.fromCodePoint(Number(e.slice(1)));
    return ENTIDADES[e.toLowerCase()] ?? todo;
  });
}

/** Las ofertas de la página, sin repetidas. Si no hay ninguna, la página ha cambiado. */
export function extraerOfertas(html: string): unknown[] {
  const vistas = new Map<string, unknown>();
  let ilegibles = 0;
  for (const m of html.matchAll(/data-grid-data="([^"]*)"/g)) {
    try {
      const crudo: unknown = JSON.parse(decodificarEntidades(m[1] ?? ''));
      const id = (crudo as { productId?: unknown } | null)?.productId;
      const clave =
        typeof id === 'string' || typeof id === 'number' ? String(id) : `?${vistas.size}`;
      if (!vistas.has(clave)) vistas.set(clave, crudo);
    } catch {
      ilegibles++;
    }
  }
  if (vistas.size === 0) {
    throw new ErrorFormato(
      `La página de ofertas de Lidl no tiene ofertas legibles${ilegibles ? ` (${ilegibles} ilegibles)` : ''}: puede que haya cambiado`,
    );
  }
  return [...vistas.values()];
}

const sinTildes = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();

/** Zona de precios de Valencia, o null si la oferta no está en Valencia. */
export function zonaValencia(o: Oferta): string | null {
  const regiones = Object.entries(o.regionsV2 ?? {});
  if (regiones.length === 0) {
    const zonas = Object.keys(o.regionsPrices);
    return zonas.length === 1 ? (zonas[0] ?? null) : null;
  }
  const valencia = regiones.find(([, r]) => sinTildes(r.regionName) === PROVINCIA);
  const zona = valencia?.[1].regionPriceId;
  if (!valencia || !zona) return null;
  if (o.regions && !o.regions.includes(Number(valencia[0]))) return null;
  return zona in o.regionsPrices ? zona : null;
}

/** Trozos de la ruta de Lidl sin los dos primeros niveles genéricos. */
function rutaSeccion(o: Oferta): { id?: string; nombre?: string; mundo?: string } {
  const nombres = o.keyfacts?.wonCategoryPrimary?.split('/').map((s) => s.trim()) ?? [];
  const ids = o.keyfacts?.wonCategoryPrimaryPath?.split('/') ?? [];
  const mundo = nombres[1];
  const utiles = nombres.slice(1).filter((n) => n && n !== MUNDOS[0]);
  return {
    id: ids.at(-1) || undefined,
    nombre: utiles.length > 0 ? utiles.join(' > ') : undefined,
    mundo,
  };
}

/** ¿Es una oferta de comida, bebida, droguería o limpieza? */
function esDelSuper(o: Oferta): boolean {
  const { mundo } = rutaSeccion(o);
  if (mundo) return MUNDOS.includes(mundo);
  return CATEGORIAS.includes(o.category ?? '');
}

/** Ofertas por cantidad («Llévate 2 por...»): su precio no es el de un artículo. */
function esPorCantidad(p: Precio | null | undefined): boolean {
  return /\buds?\b.*\//i.test(p?.basePrice?.text ?? '');
}

/**
 * ¿Hay que tener en cuenta esta oferta? Solo las del súper, a la venta en Valencia y con
 * precio por artículo. Las que no se pueden leer sí cuentan (para detectar cambios de formato).
 */
export function interesa(crudo: unknown): boolean {
  const r = OfertaSchema.safeParse(crudo);
  if (!r.success) return true;
  const o = r.data;
  if (!esDelSuper(o)) return false;
  const zona = zonaValencia(o);
  if (zona === null) return false;
  const precios = o.regionsPrices[zona];
  return (
    !esPorCantidad(precios?.currentPrice) && !esPorCantidad(precios?.currentLidlPlusPrice?.price)
  );
}

/** Lo que se vende a granel por piezas y no por kilo (el pepino «unidad», la lechuga...). */
const POR_PIEZAS = /\b(unidad|pieza|iceberg|lechuga|coliflor|piña)\b/i;

/** Lavados que indica el nombre de un detergente: «(ActiveClean 45WL+45WLgrat.)» → 90. */
function lavadosDelNombre(nombre: string): number {
  return [...nombre.matchAll(/(\d+)\s*WL/g)].reduce((suma, m) => suma + Number(m[1]), 0);
}

/**
 * Formato a partir del texto del envase de Lidl: «250 g», «4x125 g», «Aprox.500 g», «75 cl»,
 * «5 / l» (desde el 23/11/2026: 5 litros), «Paquete» (1 ud.), «A granel» o «Kg» (precio por
 * kg, salvo lo que se vende por piezas). Lo que no indica la cantidad se marca como sin
 * verificar. Los detergentes que indican los lavados en el nombre («45WL») van por lavado.
 */
export function formatoLidl(
  envase: string | undefined,
  nombre: string,
): { formato: Formato; sinVerificar: boolean } | null {
  const lavados = lavadosDelNombre(nombre);
  if (lavados > 0) return { formato: { cantidad: lavados, unidad: 'lavado' }, sinVerificar: false };
  const t = (envase ?? '')
    .replace(/aprox\.?\s*/gi, '')
    .replace(/(\d)\s*\/\s*(?=\p{L})/u, '$1 ')
    .trim();
  if (/granel/i.test(t) || /^kg$/i.test(t)) {
    return {
      formato: { cantidad: 1, unidad: POR_PIEZAS.test(nombre) ? 'ud' : 'kg' },
      sinVerificar: true,
    };
  }
  if (t === '' || /^paquete$/i.test(t)) {
    return { formato: { cantidad: 1, unidad: 'ud' }, sinVerificar: true };
  }
  for (const unidad of UNIDADES) {
    const formato = parsearFormatoDescripcion(t, unidad);
    if (formato) return { formato, sinVerificar: false };
  }
  return null;
}

/** Fecha AAAA-MM-DD en hora de España ("en-CA" escribe las fechas en ese orden). */
const fechaEspana = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: 'Europe/Madrid',
});
const diaEspana = (iso: string | undefined): string | undefined => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? undefined : fechaEspana.format(t);
};

/** «MILBONA» → «Milbona»; las marcas con minúsculas o números («W5») se dejan igual. */
function marcaBonita(marca: string): string | undefined {
  const limpia = marca.replace(/^[-–\s]+|[-–\s]+$/g, '');
  if (!limpia) return undefined;
  if (limpia !== limpia.toUpperCase() || /\d/.test(limpia)) return limpia;
  return limpia
    .toLowerCase()
    .replace(/(^|\s)(\p{L})/gu, (_, e: string, l: string) => e + l.toUpperCase());
}

/**
 * Nombre (sin la marca, como en Consum) y marca. Lidl da los dos aparte; las ofertas sin
 * marca la tienen como «-» y su título completo empieza por «- ».
 */
export function nombreYMarca(
  completo: string,
  titulo: string | undefined,
  marca: string | undefined,
): { nombre: string; marca?: string } {
  const nombre = (titulo ?? completo).replace(/^[-–\s]+/, '').trim();
  const bonita = marca ? marcaBonita(marca) : undefined;
  return bonita ? { nombre, marca: bonita } : { nombre };
}

/**
 * Convierte una oferta de Lidl al esquema común, con los precios de Valencia.
 * El precio es el que paga cualquiera; si con Lidl Plus es menor, va en precioLidlPlus. En las
 * ofertas que solo rebajan con Lidl Plus, el precio normal es el tachado.
 */
export function normalizarLidl(crudo: unknown, ahora: string): Normalizado {
  const r = OfertaSchema.safeParse(crudo);
  if (!r.success) return { ok: false };
  const o = r.data;
  const zona = zonaValencia(o);
  const precios = zona === null ? undefined : o.regionsPrices[zona];
  if (!precios) return { ok: false };
  const normal = precios.currentPrice ?? undefined;
  const plus = precios.currentLidlPlusPrice?.price;

  const precio = normal?.price ?? plus?.oldPrice ?? undefined;
  if (!precio || !(precio > 0)) return { ok: false };
  const precioLidlPlus = plus && plus.price > 0 && plus.price < precio ? plus.price : undefined;
  const anterior = normal?.oldPrice && normal.oldPrice > precio ? normal.oldPrice : undefined;
  const descuento =
    anterior && (normal?.discount?.percentageDiscount ?? Math.round((1 - precio / anterior) * 100));

  const { nombre, marca } = nombreYMarca(o.fullTitle, o.title, o.brand?.name);
  const base = normal ?? plus;
  const leido = formatoLidl(base?.packaging?.text, nombre);
  if (!leido) return { ok: false };

  const hoy = fechaEspana.format(Date.parse(ahora));
  const desde = diaEspana(base?.startDate);
  const seccion = rutaSeccion(o);
  const producto = cerrarProducto({
    tienda: 'lidl',
    id: o.productId,
    nombre,
    marca,
    formato: leido.formato,
    precio: redondear(precio, 2),
    precioRef: calcularPrecioRef(precio, leido.formato.cantidad),
    precioAnterior: anterior ? redondear(anterior, 2) : undefined,
    precioLidlPlus: precioLidlPlus ? redondear(precioLidlPlus, 2) : undefined,
    oferta: descuento ? `-${descuento} %` : undefined,
    ofertaDesde: desde && desde > hoy ? desde : undefined,
    ofertaHasta: diaEspana(base?.endDate),
    url: o.canonicalUrl ? new URL(o.canonicalUrl, LIDL_WEB).href : undefined,
    imagen: o.image,
    seccion: seccion.id,
  });
  if (!producto) return { ok: false };
  return leido.sinVerificar ? { ok: true, producto, sinVerificar: true } : { ok: true, producto };
}

/** Nombre completo de cada sección de Lidl usada por las ofertas, por su id. */
export function seccionesLidl(crudos: unknown[]): Record<string, string> {
  const nombres: Record<string, string> = {};
  for (const crudo of crudos) {
    const r = OfertaSchema.safeParse(crudo);
    if (!r.success) continue;
    const { id, nombre } = rutaSeccion(r.data);
    if (id && nombre) nombres[id] ??= nombre;
  }
  return nombres;
}

const describir = (crudo: unknown): string => {
  const c = (typeof crudo === 'object' && crudo !== null ? crudo : {}) as {
    productId?: unknown;
    fullTitle?: unknown;
  };
  return `${String(c.productId ?? '?')} ${String(c.fullTitle ?? '?')}`;
};

/** Descarga la página de ofertas semanales (una sola petición) y la normaliza. */
export async function descargarLidl(
  pedir: Pedir,
  ahora: string,
  registrar: (mensaje: string) => void = () => {},
): Promise<ResultadoAdaptador> {
  const { datos } = await pedir(LIDL_OFERTAS, { como: 'texto' });
  if (typeof datos !== 'string') throw new ErrorFormato('Lidl no ha devuelto una página');
  const todas = extraerOfertas(datos);
  const delSuper = todas.filter(interesa);
  registrar(`Lidl: ${todas.length} ofertas en la página, ${delSuper.length} del súper en Valencia`);
  const resultado = normalizarTodos(delSuper, (c) => normalizarLidl(c, ahora), describir);
  return {
    ...resultado,
    secciones: seccionesUsadas(resultado.productos, seccionesLidl(delSuper)),
  };
}
