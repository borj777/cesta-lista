/**
 * Registra el service worker (funcionamiento sin conexión). Las versiones nuevas se activan
 * solas y se usan la próxima vez que se abre la app; mientras tanto se avisa de que hay una
 * lista, por si se quiere cargar ya.
 */
type Oyente = (hayVersionNueva: boolean) => void;
const oyentes = new Set<Oyente>();
let hayVersionNueva = false;

export function alHaberVersionNueva(oyente: Oyente): () => void {
  oyentes.add(oyente);
  oyente(hayVersionNueva);
  return () => oyentes.delete(oyente);
}

function avisar() {
  hayVersionNueva = true;
  for (const oyente of oyentes) oyente(true);
}

/** Carga la versión nueva, que ya está activa. */
export function actualizarApp(): void {
  location.reload();
}

const URL_SW = `${import.meta.env.BASE_URL}sw.js`;

export async function registrarServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  // Si la página ya estaba controlada, una versión nueva que se active es una actualización.
  const yaControlada = navigator.serviceWorker.controller !== null;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (yaControlada) avisar();
  });

  let registro: ServiceWorkerRegistration;
  try {
    registro = await navigator.serviceWorker.register(URL_SW);
  } catch (error) {
    console.warn('No se ha podido activar el modo sin conexión', error);
    return;
  }

  // Busca versiones nuevas al volver a la app. Si el registro ya no existe (el sistema lo ha
  // borrado), se vuelve a registrar.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    registro.update().catch(() => {
      void navigator.serviceWorker.register(URL_SW).catch(() => {});
    });
  });
}
