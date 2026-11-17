import { useEffect, useState } from 'preact/hooks';
import { URL_DATOS } from '../datos.ts';
import { fechaHora } from '../estado.ts';
import { useCompra } from '../lista/estado.ts';
import { pantallaDisponible } from '../lista/pantalla.ts';
import { useNecesidades } from '../necesidades/estado.ts';
import { useTiendas } from '../tiendas/estado.ts';

type Estado = {
  sinConexion: string;
  copia: string;
  sistema: string;
  protegidos: string;
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
  let protegidos = 'No se puede saber';
  try {
    if (navigator.storage?.persisted) {
      protegidos = (await navigator.storage.persisted())
        ? 'Sí'
        : 'No (Safari podría borrarlos si falta espacio: haz copias)';
    }
  } catch {
    // Se queda en «No se puede saber».
  }
  return { sinConexion, copia, sistema: versionSistema(), protegidos };
}

/**
 * Datos técnicos para averiguar problemas en el iPhone sin herramientas de programador.
 * Se pueden copiar y enviar tal cual.
 */
export function Diagnostico({ guardados, error }: { guardados: boolean; error: string | null }) {
  const [estado, setEstado] = useState<Estado | null>(null);
  const { necesidades } = useNecesidades();
  const { propias, productos, lista } = useTiendas();
  const { compra } = useCompra();
  const plural = (n: number, una: string, varias: string) => `${n} ${n === 1 ? una : varias}`;
  const apagadas = (lista ?? []).filter((t) => !t.activa).map((t) => t.nombre);
  const enCarro = compra?.lineas.filter((l) => l.enCarro).length ?? 0;
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
        <dt>Tus datos</dt>
        <dd>
          {necesidades && propias && productos
            ? `${plural(necesidades.length, 'necesidad', 'necesidades')}, ${plural(propias.length, 'tienda tuya', 'tiendas tuyas')} y ${plural(productos.length, 'precio apuntado', 'precios apuntados')}`
            : '…'}
        </dd>
        <dt>Datos protegidos frente a borrado</dt>
        <dd>{estado?.protegidos ?? '…'}</dd>
        <dt>Tiendas apagadas</dt>
        <dd>{apagadas.length > 0 ? apagadas.join(', ') : 'Ninguna'}</dd>
        <dt>Compra empezada</dt>
        <dd>
          {compra
            ? `Sí, del ${fechaHora(compra.empezada)} (${enCarro} de ${compra.lineas.length} en el carro)`
            : 'No'}
        </dd>
        <dt>Pantalla siempre encendida</dt>
        <dd>{pantallaDisponible() ? 'Disponible' : 'No disponible en este iPhone'}</dd>
        <dt>Sistema (según Safari)</dt>
        <dd>{estado?.sistema ?? '…'}</dd>
        <dt>Versión de la app</dt>
        <dd>{__VERSION_APP__}</dd>
      </dl>
    </section>
  );
}
