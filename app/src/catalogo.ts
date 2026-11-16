/** Todos los productos que se pueden elegir: los de app.json y los de Lidl apuntados a mano. */
import { useMemo } from 'preact/hooks';
import { indicePorId } from './buscador.ts';
import { useLidl } from './lidl/estado.ts';
import { aProductoApp } from './lidl/modelo.ts';
import type { TiendaEquivalencia } from './necesidades/modelo.ts';
import type { DatosApp, ProductoApp } from './tipos.ts';

export type BuscarProducto = (tienda: TiendaEquivalencia, id: string) => ProductoApp | undefined;

/**
 * Productos de Lidl en el formato de app.json y una función para encontrar cualquier producto
 * por tienda e id. Son null mientras se cargan los precios.
 */
export function useCatalogo(datos: DatosApp | null): {
  productosLidl: ProductoApp[] | null;
  buscarProducto: BuscarProducto | null;
} {
  const { productos: lidl } = useLidl();
  const productosLidl = useMemo(() => (lidl ? lidl.map(aProductoApp) : null), [lidl]);
  const indice = useMemo(
    () => (datos && productosLidl ? indicePorId([...datos.productos, ...productosLidl]) : null),
    [datos, productosLidl],
  );
  const buscarProducto = useMemo<BuscarProducto | null>(
    () => (indice ? (tienda, id) => indice.get(`${tienda}:${id}`) : null),
    [indice],
  );
  return { productosLidl, buscarProducto };
}
