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

async function primeroRed(peticion) {
  const cache = await caches.open(CACHE_DATOS);
  try {
    const respuesta = await fetch(peticion, { cache: 'no-cache' });
    if (respuesta.ok) await cache.put(peticion, respuesta.clone());
    return respuesta;
  } catch {
    const guardada = await cache.match(peticion);
    if (guardada) return guardada;
    throw new Error('Sin conexión y sin precios guardados');
  }
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
    evento.respondWith(primeroRed(request));
  } else if (request.mode === 'navigate') {
    // Cualquier página de la app abre index.html, también sin conexión.
    evento.respondWith(caches.match('./').then((r) => r ?? fetch(request)));
  } else {
    evento.respondWith(primeroCache(request));
  }
});
