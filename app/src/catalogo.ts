/** Todos los productos que se pueden elegir: los de app.json y los apuntados a mano. */
import { useMemo } from 'preact/hooks';
import { indicePorId } from './buscador.ts';
import { useTiendas } from './tiendas/estado.ts';
import type { IdTienda } from './tiendas/modelo.ts';
import { aProductoApp } from './tiendas/productos.ts';
import type { DatosApp, ProductoApp } from './tipos.ts';

export type BuscarProducto = (tienda: IdTienda, id: string) => ProductoApp | undefined;

/**
 * Productos de las tiendas propias en el formato de app.json y una función para encontrar
 * cualquier producto por tienda e id. Son null mientras se cargan los precios.
 */
export function useCatalogo(datos: DatosApp | null): {
  productosPropios: ProductoApp[] | null;
  buscarProducto: BuscarProducto | null;
} {
  const { productos } = useTiendas();
  const productosPropios = useMemo(
    () => (productos ? productos.map(aProductoApp) : null),
    [productos],
  );
  const indice = useMemo(
    () =>
      datos && productosPropios ? indicePorId([...datos.productos, ...productosPropios]) : null,
    [datos, productosPropios],
  );
  const buscarProducto = useMemo<BuscarProducto | null>(
    () => (indice ? (tienda, id) => indice.get(`${tienda}:${id}`) : null),
    [indice],
  );
  return { productosPropios, buscarProducto };
}
