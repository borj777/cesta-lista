/**
 * Tipos de data/app.json. Son los mismos que genera el scraper (scraper/src/app.ts);
 * si cambian allí, hay que cambiarlos aquí.
 */
export type Tienda = 'mercadona' | 'consum' | 'lidl';
export type Unidad = 'kg' | 'l' | 'ud' | 'lavado' | 'm';

export type ProductoApp = {
  tienda: Tienda;
  id: string;
  ean?: string;
  nombre: string;
  marca?: string;
  formato: { cantidad: number; unidad: Unidad };
  precio: number;
  precioRef: number;
  precioAnterior?: number;
  oferta?: string;
  ofertaHasta?: string;
};

export type EstadoTienda = { estado: 'ok' | 'fallida'; actualizado: string | null };

export type DatosApp = {
  generado: string;
  tiendas: Partial<Record<Tienda, EstadoTienda>>;
  productos: ProductoApp[];
};
