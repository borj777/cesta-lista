import { useEffect, useState } from 'preact/hooks';
import { actualizarApp, alHaberVersionNueva } from '../registro-sw.ts';
import { Icono } from './Icono.tsx';

/** Aviso cuando no hay conexión: la app sigue funcionando con los precios guardados. */
export function SinConexion() {
  const [enLinea, setEnLinea] = useState(navigator.onLine);
  useEffect(() => {
    const cambiar = () => setEnLinea(navigator.onLine);
    window.addEventListener('online', cambiar);
    window.addEventListener('offline', cambiar);
    return () => {
      window.removeEventListener('online', cambiar);
      window.removeEventListener('offline', cambiar);
    };
  }, []);
  if (enLinea) return null;
  return (
    <p class="aviso aviso--info" role="status">
      <Icono nombre="sinConexion" tamano={20} />
      <span>Sin conexión. Estás usando los precios guardados en el iPhone.</span>
    </p>
  );
}

/** Aviso de versión nueva de la app, con un botón para cargarla. */
export function VersionNueva() {
  const [hay, setHay] = useState(false);
  useEffect(() => alHaberVersionNueva(setHay), []);
  if (!hay) return null;
  return (
    <div class="aviso aviso--info" role="status">
      <Icono nombre="recargar" tamano={20} />
      <span>Hay una versión nueva de Cesta Lista.</span>
      <button type="button" class="boton boton--pequeno" onClick={actualizarApp}>
        Actualizar
      </button>
    </div>
  );
}

function esIphoneSinInstalar(): boolean {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  return ios && navigator.standalone !== true;
}

/** En Safari, explica cómo instalar la app en la pantalla de inicio. */
export function ComoInstalar() {
  if (!esIphoneSinInstalar()) return null;
  return (
    <section class="tarjeta tarjeta--destacada">
      <h2>Instala Cesta Lista</h2>
      <ol class="pasos">
        <li>
          Pulsa <Icono nombre="compartir" tamano={18} /> <b>Compartir</b>. Si no lo ves en la barra
          de Safari, está dentro del botón <b>≡</b> o <b>···</b> que hay junto a la dirección.
        </li>
        <li>
          Pulsa <b>Añadir a pantalla de inicio</b>. Si no aparece, desliza hacia arriba o toca{' '}
          <b>Ver más</b>.
        </li>
        <li>
          Pulsa <b>Añadir</b> y abre Cesta Lista desde su icono.
        </li>
      </ol>
      <p class="secundario">Así se abre como una app y funciona sin conexión.</p>
    </section>
  );
}
