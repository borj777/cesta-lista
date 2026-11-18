/**
 * Tipos de data/app.json. Son los mismos que genera el scraper (scraper/src/app.ts);
 * si cambian allí, hay que cambiarlos aquí.
 */
/** Tiendas de app.json (las de precios automáticos). */
export type Tienda = 'mercadona' | 'consum';
export type Unidad = 'kg' | 'l' | 'ud' | 'lavado' | 'm';

export type ProductoApp = {
  /** 'mercadona', 'consum' o el id de una tienda propia (los apuntados a mano). */
  tienda: string;
  id: string;
  ean?: string;
  nombre: string;
  marca?: string;
  formato: { cantidad: number; unidad: Unidad };
  precio: number;
  precioRef: number;
  precioAnterior?: number;
  /** Solo las ofertas de Lidl: precio con la app Lidl Plus, si es menor. */
  precioLidlPlus?: number;
  oferta?: string;
  /** Solo las ofertas de Lidl: primer día (AAAA-MM-DD), si aún no ha empezado. */
  ofertaDesde?: string;
  ofertaHasta?: string;
  /** Id de la sección de la tienda (su nombre, en `DatosApp.secciones`). */
  seccion?: string;
};

export type EstadoTienda = { estado: 'ok' | 'fallida'; actualizado: string | null };

export type DatosApp = {
  generado: string;
  /** Estado de cada descarga: Mercadona, Consum y, desde el 18/11/2026, las ofertas de Lidl. */
  tiendas: Partial<Record<Tienda | 'lidl', EstadoTienda>>;
  /** Nombre completo de cada sección («Carne > Aves y pollo > Pollo»), por tienda y por id. Falta en los precios guardados antes del 18/11/2026. */
  secciones?: Partial<Record<string, Record<string, string>>>;
  productos: ProductoApp[];
};
