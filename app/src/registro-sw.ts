/**
 * Registra el service worker (funcionamiento sin conexión) y avisa cuando hay una versión
 * nueva de la app esperando, para que el usuario decida cuándo recargar.
 */
type Oyente = (hayVersionNueva: boolean) => void;
const oyentes = new Set<Oyente>();
let esperando: ServiceWorker | null = null;

export function alHaberVersionNueva(oyente: Oyente): () => void {
  oyentes.add(oyente);
  oyente(esperando !== null);
  return () => oyentes.delete(oyente);
}

function avisar(trabajador: ServiceWorker) {
  esperando = trabajador;
  for (const oyente of oyentes) oyente(true);
}

/** Activa la versión nueva y recarga la app. */
export function actualizarApp(): void {
  if (!esperando) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), {
    once: true,
  });
  esperando.postMessage('activar');
}

export async function registrarServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  const registro = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
  if (registro.waiting && navigator.serviceWorker.controller) avisar(registro.waiting);
  registro.addEventListener('updatefound', () => {
    const nuevo = registro.installing;
    nuevo?.addEventListener('statechange', () => {
      if (nuevo.state === 'installed' && navigator.serviceWorker.controller) avisar(nuevo);
    });
  });
  // Busca versiones nuevas al volver a la app.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void registro.update();
  });
}
