import { z } from 'zod';
import type { Pedir } from '../http.ts';
import { cerrarProducto, idDe, normalizarTodos, seccionesUsadas, validar } from '../normalizar.ts';
import { ErrorFormato, UNIDADES, type Normalizado, type ResultadoAdaptador } from '../tipos.ts';
import {
  calcularPrecioRef,
  coincidePrecioRef,
  parsearCantidad,
  parsearFormatoDescripcion,
  redondear,
  type Formato,
} from '../unidades.ts';

export const CONSUM_API = 'https://tienda.consum.es/api/rest/V1.0/catalog/product';
/** Árbol de secciones de la tienda (comprobado el 17/11/2026). */
export const CONSUM_SECCIONES = 'https://tienda.consum.es/api/rest/V1.0/shopping/category/menu';
/** Consum no devuelve más de 100 productos por página (comprobado el 15/11/2026). */
export const TAMANO_PAGINA = 100;
/** Límite de seguridad: 300 páginas son 30.000 productos, el triple del catálogo actual. */
const MAX_PAGINAS = 300;

const texto = z
  .string()
  .nullish()
  .transform((v) => v?.trim() || undefined);

const ValorPrecio = z.object({ centAmount: z.number(), centUnitAmount: z.number().nullish() });

const ProductoCrudoSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  ean: z
    .union([z.string(), z.number()])
    .nullish()
    .transform((v) => (v == null || String(v).trim() === '' ? undefined : String(v).trim())),
  productData: z.object({
    name: z.string().min(1),
    description: texto,
    brand: z.object({ name: texto }).nullish(),
    url: texto,
    imageURL: texto,
  }),
  media: z
    .array(z.object({ url: z.string(), order: z.number().nullish(), type: z.string().nullish() }))
    .nullish(),
  priceData: z.object({
    prices: z.array(z.object({ id: z.string(), value: ValorPrecio })),
    unitPriceUnitType: texto,
  }),
  categories: z
    .array(z.object({ id: z.union([z.string(), z.number()]), type: z.number().nullish() }))
    .nullish(),
  offers: z
    .array(
      z.object({
        from: texto,
        to: texto,
        shortDescription: texto,
        longDescription: texto,
      }),
    )
    .nullish(),
});
type Oferta = NonNullable<z.infer<typeof ProductoCrudoSchema>['offers']>[number];

type NodoSeccion = { id: string | number; name: string; subcategories?: NodoSeccion[] | null };
const NodoSeccionSchema: z.ZodType<NodoSeccion> = z.lazy(() =>
  z.object({
    id: z.union([z.string(), z.number()]),
    name: z.string(),
    subcategories: z.array(NodoSeccionSchema).nullish(),
  }),
);
const ArbolSeccionesSchema = z.array(NodoSeccionSchema).min(1);

/** Nombre completo de cada sección del árbol de Consum («Frescos > Frutas > Cítricos»), por su id. */
export function rutasConsum(arbol: unknown): Map<string, string> {
  const r = ArbolSeccionesSchema.safeParse(arbol);
  const rutas = new Map<string, string>();
  const recorrer = (nodo: NodoSeccion, padre: string) => {
    const ruta = padre ? `${padre} > ${nodo.name.trim()}` : nodo.name.trim();
    rutas.set(String(nodo.id), ruta);
    for (const hijo of nodo.subcategories ?? []) recorrer(hijo, ruta);
  };
  for (const nodo of r.success ? r.data : []) recorrer(nodo, '');
  return rutas;
}

/**
 * Sección de un producto: la primera de sus categorías normales (type 0) que está en el árbol.
 * «Ecológico y saludable» repite productos de otras secciones: se usa solo si no hay otra.
 */
export function seccionConsum(
  categorias: { id: string | number; type?: number | null }[] | null | undefined,
  rutas: ReadonlyMap<string, string>,
): string | undefined {
  const normales = (categorias ?? []).filter((c) => !c.type).map((c) => String(c.id));
  const conocidas = normales.filter((id) => rutas.has(id));
  return (
    conocidas.find((id) => !rutas.get(id)?.startsWith('Ecológico')) ??
    conocidas[0] ??
    (rutas.size === 0 ? normales[0] : undefined)
  );
}

const PaginaSchema = z.object({
  totalCount: z.number().int().nonnegative(),
  hasMore: z.boolean(),
  products: z.array(z.unknown()),
});

/** Fecha AAAA-MM-DD en hora de España ("en-CA" escribe las fechas en ese orden). */
const fechaEspana = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: 'Europe/Madrid',
});

/**
 * Oferta vigente: su texto ("Ahora más barato") y su último día.
 * Consum indica el fin como "2026-11-18T22:59:00Z", que en España es el 18/11 a las 23:59.
 */
export function ofertaVigente(
  ofertas: Oferta[] | null | undefined,
  ahora: string,
): { oferta?: string; ofertaHasta?: string } {
  const momento = Date.parse(ahora);
  const vigente = ofertas?.find(
    (o) =>
      (!o.from || Date.parse(o.from) <= momento) &&
      (!o.to || Date.parse(o.to) >= momento) &&
      (o.shortDescription || o.longDescription),
  );
  if (!vigente) return {};
  const oferta = vigente.shortDescription ?? vigente.longDescription;
  const fin = vigente.to ? Date.parse(vigente.to) : NaN;
  return Number.isNaN(fin) ? { oferta } : { oferta, ofertaHasta: fechaEspana.format(fin) };
}

/**
 * Foto del producto. La dirección de `imageURL` no funciona (el servidor de Consum responde
 * 404, comprobado el 16/11/2026); las de la galería `media` («…_001.jpg») sí. Se usa la
 * primera foto de la galería y, si no hay, `imageURL`.
 */
export function fotoConsum(
  media: { url: string; order?: number | null }[] | null | undefined,
  imageURL: string | undefined,
): string | undefined {
  const primera = [...(media ?? [])].sort((a, b) => (a.order ?? 99) - (b.order ?? 99))[0];
  return primera?.url ?? imageURL;
}

/**
 * Convierte un producto de la API de Consum al esquema común.
 * Si hay precio de oferta, es el que se paga y el normal pasa a precioAnterior.
 * El formato sale de la descripción ("... 250 Gr"); si no lo indica (fruta suelta,
 * "Pieza precio aprox."), se usa el precio por kg de la tienda y se marca como sin verificar.
 */
export function normalizarConsum(
  crudo: unknown,
  ahora: string,
  rutas: ReadonlyMap<string, string> = new Map(),
): Normalizado {
  const r = ProductoCrudoSchema.safeParse(crudo);
  if (!r.success) return { ok: false };
  const p = r.data;

  const normal = p.priceData.prices.find((x) => x.id === 'PRICE');
  if (!normal || !(normal.value.centAmount > 0)) return { ok: false };
  const oferta = p.priceData.prices.find(
    (x) =>
      x.id === 'OFFER_PRICE' &&
      x.value.centAmount > 0 &&
      x.value.centAmount < normal.value.centAmount,
  );
  const usado = oferta ?? normal;
  // Ojo: centAmount viene en euros, no en céntimos.
  const precio = redondear(usado.value.centAmount, 2);

  // Precio por unidad de referencia que publica la tienda, pasado a € por kg, l o ud.
  const referencia = p.priceData.unitPriceUnitType
    ? parsearCantidad(p.priceData.unitPriceUnitType)
    : null;
  const refTienda =
    referencia && usado.value.centUnitAmount && usado.value.centUnitAmount > 0
      ? redondear(usado.value.centUnitAmount / referencia.cantidad)
      : null;

  const descripcion = p.productData.description ?? p.productData.name;
  const unidades = referencia ? [referencia.unidad] : UNIDADES;
  let formato: Formato | null = null;
  for (const unidad of unidades) {
    formato ??= parsearFormatoDescripcion(descripcion, unidad);
  }

  let precioRef: number;
  let sinVerificar: boolean;
  if (formato) {
    precioRef = calcularPrecioRef(precio, formato.cantidad);
    sinVerificar = refTienda === null;
  } else if (refTienda && referencia) {
    formato = { cantidad: redondear(precio / refTienda), unidad: referencia.unidad };
    precioRef = refTienda;
    sinVerificar = true;
  } else {
    return { ok: false };
  }

  const producto = cerrarProducto({
    tienda: 'consum',
    id: p.id,
    ean: p.ean,
    nombre: p.productData.name.trim(),
    marca: p.productData.brand?.name,
    formato,
    precio,
    precioRef,
    precioAnterior: oferta ? redondear(normal.value.centAmount, 2) : undefined,
    ...ofertaVigente(p.offers, ahora),
    url: p.productData.url,
    imagen: fotoConsum(p.media, p.productData.imageURL),
    seccion: seccionConsum(p.categories, rutas),
  });
  if (!producto) return { ok: false };

  if (!sinVerificar && refTienda !== null && !coincidePrecioRef(precioRef, refTienda)) {
    return {
      ok: true,
      producto,
      aviso: {
        id: producto.id,
        nombre: producto.nombre,
        unidad: formato.unidad,
        calculado: precioRef,
        tienda: refTienda,
      },
    };
  }
  return sinVerificar ? { ok: true, producto, sinVerificar } : { ok: true, producto };
}

/** Recorre todo el catálogo de Consum página a página. */
export async function descargarConsum(
  pedir: Pedir,
  ahora: string,
  registrar: (mensaje: string) => void = () => {},
): Promise<ResultadoAdaptador> {
  // Las secciones no son imprescindibles: si el árbol falla, los precios se guardan sin ellas.
  let rutas = new Map<string, string>();
  try {
    rutas = rutasConsum((await pedir(CONSUM_SECCIONES)).datos);
    registrar(`Consum: ${rutas.size} secciones`);
  } catch (error) {
    registrar(`Consum: no se ha podido leer el árbol de secciones (${String(error)})`);
  }

  const crudos = new Map<string, unknown>();
  let total: number;

  for (let pagina = 0; ; pagina++) {
    if (pagina >= MAX_PAGINAS) {
      throw new ErrorFormato(`Consum sigue devolviendo páginas tras ${MAX_PAGINAS}: se detiene`);
    }
    const offset = pagina * TAMANO_PAGINA;
    const datos = validar(
      PaginaSchema,
      (await pedir(`${CONSUM_API}?limit=${TAMANO_PAGINA}&offset=${offset}`)).datos,
      `la página ${pagina + 1} de Consum`,
    );
    total = datos.totalCount;
    for (const crudo of datos.products) {
      const id = idDe(crudo);
      if (id && !crudos.has(id)) crudos.set(id, crudo);
    }

    const ultima = !datos.hasMore || datos.products.length === 0 || offset + TAMANO_PAGINA >= total;
    if ((pagina + 1) % 20 === 0 || ultima) {
      registrar(`Consum: página ${pagina + 1}, ${crudos.size} de ${total} productos`);
    }
    if (ultima) break;
  }

  const resultado = normalizarTodos(crudos.values(), (c) => normalizarConsum(c, ahora, rutas));
  return {
    ...resultado,
    esperados: total,
    secciones: seccionesUsadas(resultado.productos, Object.fromEntries(rutas)),
  };
}
