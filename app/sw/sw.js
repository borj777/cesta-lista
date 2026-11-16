/*
 * Service worker de Cesta Lista: hace que la app funcione sin conexión.
 * vite.config.ts lo copia a dist/sw.js y rellena VERSION y ARCHIVOS.
 *
 * - La app (HTML, JS, CSS, iconos) se guarda al instalarse y se sirve desde la caché.
 * - data/app.json se pide primero a la red (precios del día) y, si no hay conexión,
 *   se usa la última copia guardada.
 */
const VERSION = '__VERSION__';
const ARCHIVOS = __ARCHIVOS__;
const CACHE_APP = `app-${VERSION}`;
const CACHE_DATOS = 'datos';

self.addEventListener('install', (evento) => {
  evento.waitUntil(caches.open(CACHE_APP).then((cache) => cache.addAll(ARCHIVOS)));
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nombres) =>
        Promise.all(
          nombres
            .filter((n) => n.startsWith('app-') && n !== CACHE_APP)
            .map((n) => caches.delete(n)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// La app pide activar la versión nueva cuando el usuario pulsa «Actualizar».
self.addEventListener('message', (evento) => {
  if (evento.data === 'activar') self.skipWaiting();
});

/** Con poca cobertura, si la red tarda más que esto y hay precios guardados, se usan esos. */
const ESPERA_RED_MS = 6000;

/**
 * Precios: primero la red y, si falla o tarda, la copia guardada.
 * La copia se guarda a la vez que se entrega la respuesta (evento.waitUntil), nunca antes:
 * en Safari, esperar a guardar una copia de un archivo grande antes de responder puede
 * bloquear la respuesta para siempre.
 */
async function primeroRed(evento) {
  const url = evento.request.url;
  const cache = await caches.open(CACHE_DATOS);

  const red = fetch(url, { cache: 'no-cache' }).then((respuesta) => {
    if (respuesta.ok) {
      const copia = respuesta.clone();
      evento.waitUntil(cache.put(url, copia).catch(() => {}));
    }
    return respuesta;
  });

  const guardada = await cache.match(url);
  if (!guardada) return red;

  const espera = new Promise((resolver) => setTimeout(() => resolver(null), ESPERA_RED_MS));
  try {
    const respuesta = await Promise.race([red, espera]);
    if (respuesta && respuesta.ok) return respuesta;
  } catch {
    // Sin conexión: se usa la copia guardada.
  }
  // La descarga sigue en segundo plano y actualizará la copia para la próxima vez.
  evento.waitUntil(red.catch(() => {}));
  return guardada;
}

async function primeroCache(peticion) {
  const guardada = await caches.match(peticion, { ignoreSearch: true });
  return guardada ?? fetch(peticion);
}

self.addEventListener('fetch', (evento) => {
  const { request } = evento;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.endsWith('/data/app.json')) {
    evento.respondWith(primeroRed(evento));
  } else if (request.mode === 'navigate') {
    // Cualquier página de la app abre index.html, también sin conexión.
    evento.respondWith(caches.match('./').then((r) => r ?? fetch(request)));
  } else {
    evento.respondWith(primeroCache(request));
  }
});
