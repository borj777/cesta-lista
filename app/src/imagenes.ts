/**
 * Fotos de los productos. data/imagenes.json se descarga solo la primera vez que se
 * necesita (al elegir productos) y las fotos, solo cuando aparecen en pantalla.
 */
import { useEffect, useState } from 'preact/hooks';
type Imagenes = Partial<Record<string, Record<string, string>>>;

let carga: Promise<Imagenes> | null = null;
let cargadas: Imagenes | null = null;

function cargarImagenes(): Promise<Imagenes> {
  carga ??= fetch(`${import.meta.env.BASE_URL}data/imagenes.json`)
    .then((r) => (r.ok ? r.json() : { imagenes: {} }))
    .then((d: { imagenes?: Imagenes }) => {
      cargadas = d.imagenes ?? {};
      return cargadas;
    })
    .catch(() => {
      // Sin conexión y sin copia: se intentará de nuevo la próxima vez.
      carga = null;
      return {};
    });
  return carga;
}

/** Miniatura más pequeña cuando la tienda lo permite (Mercadona redimensiona sus fotos). */
function miniatura(url: string): string {
  return url.includes('imgix.net') ? url.replace('h=300&w=300', 'h=160&w=160') : url;
}

/** Dirección de la foto de un producto, o null si no hay (todavía). */
export function useImagen(tienda: string, id: string): string | null {
  const [imagenes, setImagenes] = useState<Imagenes | null>(cargadas);
  useEffect(() => {
    if (!imagenes) void cargarImagenes().then(setImagenes);
  }, [imagenes]);
  const url = imagenes?.[tienda]?.[id];
  return url ? miniatura(url) : null;
}
