import {
  hoyEnEspana,
  precioVigente,
  textoFormato,
  textoPrecio,
  textoPrecioRef,
} from '../formato.ts';
import { useImagen } from '../imagenes.ts';
import type { ProductoApp } from '../tipos.ts';

/** Foto del producto: se descarga solo cuando aparece en pantalla. */
export function FotoProducto({ producto }: { producto: ProductoApp }) {
  const url = useImagen(producto.tienda, producto.id);
  return (
    <span class="foto" aria-hidden="true">
      {url && (
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          referrerpolicy="no-referrer"
          width={56}
          height={56}
          onError={(e) => {
            e.currentTarget.style.visibility = 'hidden';
          }}
        />
      )}
    </span>
  );
}

/**
 * Datos de un producto: foto, nombre, marca, formato, precio y precio por unidad.
 * El formato se muestra siempre (regla de la fase 2).
 */
export function InfoProducto({
  producto,
  comparable = true,
}: {
  producto: ProductoApp;
  comparable?: boolean;
}) {
  const vigente = precioVigente(producto, hoyEnEspana());
  return (
    <>
      <FotoProducto producto={producto} />
      <span class="producto__texto">
        <span class="producto__nombre">{producto.nombre}</span>
        <span class="secundario">
          {[producto.marca, textoFormato(producto.formato), textoPrecio(vigente.precio)]
            .filter(Boolean)
            .join(' · ')}
        </span>
        {vigente.oferta && <span class="etiqueta-oferta">{vigente.oferta}</span>}
      </span>
      <span class={comparable ? 'producto__ref' : 'producto__ref producto__ref--otra'}>
        {textoPrecioRef(vigente.precioRef, producto.formato.unidad)}
      </span>
    </>
  );
}
