import { useEffect, useState } from 'preact/hooks';
import { URL_DATOS } from '../datos.ts';
import { fechaHora } from '../estado.ts';

type Estado = {
  sinConexion: string;
  copia: string;
  sistema: string;
};

function versionSistema(): string {
  const ios = /OS (\d+)_(\d+)/.exec(navigator.userAgent);
  if (ios) return `iOS ${ios[1]}.${ios[2]}`;
  return navigator.userAgent.slice(0, 60);
}

async function comprobar(): Promise<Estado> {
  const sinConexion = !('serviceWorker' in navigator)
    ? 'No disponible en este navegador'
    : navigator.serviceWorker.controller
      ? 'Activo'
      : 'Todavía no activo (vuelve a abrir la app)';
  let copia = 'No hay copia guardada';
  try {
    const cache = await caches.open('datos');
    const guardada = await cache.match(new URL(URL_DATOS, location.href).href);
    if (guardada) {
      const datos = (await guardada.json()) as { generado?: string };
      copia = datos.generado ? `Sí, del ${fechaHora(datos.generado)}` : 'Sí';
    }
  } catch (error) {
    copia = `No se puede leer (${error instanceof Error ? error.message : String(error)})`;
  }
  return { sinConexion, copia, sistema: versionSistema() };
}

/**
 * Datos técnicos para averiguar problemas en el iPhone sin herramientas de programador.
 * Se pueden copiar y enviar tal cual.
 */
export function Diagnostico({ guardados, error }: { guardados: boolean; error: string | null }) {
  const [estado, setEstado] = useState<Estado | null>(null);
  useEffect(() => {
    void comprobar().then(setEstado);
  }, [guardados, error]);

  return (
    <section class="tarjeta">
      <h2>Diagnóstico</h2>
      <dl class="diagnostico">
        <dt>Precios en pantalla</dt>
        <dd>{error ? 'Ninguno' : guardados ? 'Copia guardada' : 'Descargados ahora'}</dd>
        <dt>Último error</dt>
        <dd>{error ?? 'Ninguno'}</dd>
        <dt>Modo sin conexión</dt>
        <dd>{estado?.sinConexion ?? '…'}</dd>
        <dt>Precios guardados en el iPhone</dt>
        <dd>{estado?.copia ?? '…'}</dd>
        <dt>Sistema</dt>
        <dd>{estado?.sistema ?? '…'}</dd>
        <dt>Versión de la app</dt>
        <dd>{__VERSION_APP__}</dd>
      </dl>
    </section>
  );
}
