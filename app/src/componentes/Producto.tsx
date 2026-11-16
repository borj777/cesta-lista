import { Icono } from './Icono.tsx';
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
 * El formato se muestra siempre (regla de la fase 2). Los de Lidl, apuntados a mano, no
 * tienen foto: llevan una etiqueta azul; `nota` añade una línea, por ejemplo cuándo se comprobó su precio.
 */
export function InfoProducto({
  producto,
  comparable = true,
  nota,
}: {
  producto: ProductoApp;
  comparable?: boolean;
  nota?: { texto: string; atencion?: boolean };
}) {
  const vigente = precioVigente(producto, hoyEnEspana());
  return (
    <>
      {producto.tienda === 'lidl' ? (
        <span class="foto foto--lidl" aria-hidden="true">
          <Icono nombre="etiqueta" tamano={26} />
        </span>
      ) : (
        <FotoProducto producto={producto} />
      )}
      <span class="producto__texto">
        <span class="producto__nombre">{producto.nombre}</span>
        <span class="secundario">
          {[producto.marca, textoFormato(producto.formato), textoPrecio(vigente.precio)]
            .filter(Boolean)
            .join(' · ')}
        </span>
        {vigente.oferta && <span class="etiqueta-oferta">{vigente.oferta}</span>}
        {nota && (
          <span
            class={nota.atencion ? 'producto__nota producto__nota--atencion' : 'producto__nota'}
          >
            {nota.texto}
          </span>
        )}
      </span>
      <span class={comparable ? 'producto__ref' : 'producto__ref producto__ref--otra'}>
        {textoPrecioRef(vigente.precioRef, producto.formato.unidad)}
      </span>
    </>
  );
}
