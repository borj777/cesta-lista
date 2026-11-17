/*
 * Service worker de Cesta Lista: hace que la app funcione sin conexión.
 * vite.config.ts lo copia a dist/sw.js y rellena VERSION y ARCHIVOS.
 *
 * - La app (HTML, JS, CSS, iconos) se guarda al instalarse y se sirve desde la caché.
 * - data/app.json e imagenes.json se piden primero a la red y, si no hay conexión,
 *   se usa la última copia guardada.
 * - Las fotos de las tiendas se guardan al verlas (las 400 más recientes).
 * - El lector de PDF (pdf.js, unos 540 KB) se guarda la primera vez que se usa y se conserva
 *   entre versiones: así no se descarga con cada versión nueva de la app.
 */
const VERSION = '__VERSION__';
const ARCHIVOS = __ARCHIVOS__;
const LECTOR = __LECTOR__;
const CACHE_LECTOR = 'lector';
const CACHE_APP = `app-${VERSION}`;
const CACHE_DATOS = 'datos';

self.addEventListener('install', (evento) => {
  // La versión nueva se activa sin esperar: la app abierta sigue funcionando con lo que ya
  // ha cargado y la próxima vez que se abra usará la versión nueva.
  self.skipWaiting();
  evento.waitUntil(
    Promise.all([
      // cache: 'reload' obliga a descargar del servidor. Sin él, el navegador puede dar su
      // copia de la página principal de hace unos minutos, que apunta a archivos de la
      // versión anterior que ya no existen, y la app se queda en blanco (visto en iPhone).
      caches
        .open(CACHE_APP)
        .then((cache) => cache.addAll(ARCHIVOS.map((u) => new Request(u, { cache: 'reload' })))),
      // La primera vez que se abre la app instalada, los precios se descargan antes de que
      // este service worker esté activo y no pasan por él: se guardan aquí para que haya
      // copia sin conexión desde el primer día. Si falla, no impide la instalación.
      caches
        .open(CACHE_DATOS)
        .then((cache) => cache.add(new Request('./data/app.json', { cache: 'no-cache' })))
        .catch(() => {}),
    ]),
  );
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
      // Del lector se borran las versiones que ya no usa la app (si se actualiza pdf.js).
      .then(() => caches.open(CACHE_LECTOR))
      .then((cache) =>
        cache
          .keys()
          .then((claves) =>
            Promise.all(
              claves
                .filter((c) => !LECTOR.some((archivo) => c.url.endsWith(`/${archivo}`)))
                .map((c) => cache.delete(c)),
            ),
          ),
      )
      .then(() => self.clients.claim()),
  );
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

/** Lector de PDF: de la caché si está y, si no, de la red guardando una copia. */
async function lector(evento) {
  const cache = await caches.open(CACHE_LECTOR);
  const guardada = await cache.match(evento.request, { ignoreSearch: true });
  if (guardada) return guardada;
  const respuesta = await fetch(evento.request);
  if (respuesta.ok) {
    const copia = respuesta.clone();
    evento.waitUntil(cache.put(evento.request, copia).catch(() => {}));
  }
  return respuesta;
}

async function primeroCache(peticion) {
  const guardada = await caches.match(peticion, { ignoreSearch: true });
  return guardada ?? fetch(peticion);
}

/** Fotos de las tiendas: se guardan al verlas para tenerlas sin conexión (hasta 400). */
const CACHE_FOTOS = 'fotos';
const MAX_FOTOS = 400;
const SERVIDORES_FOTOS = ['prod-mercadona.imgix.net', 'cdn-consum.aktiosdigitalservices.com'];

async function recortarFotos() {
  const cache = await caches.open(CACHE_FOTOS);
  const claves = await cache.keys();
  // Las primeras son las más antiguas: se borran las que sobran.
  await Promise.all(
    claves.slice(0, Math.max(0, claves.length - MAX_FOTOS)).map((c) => cache.delete(c)),
  );
}

async function foto(evento) {
  const cache = await caches.open(CACHE_FOTOS);
  const guardada = await cache.match(evento.request);
  if (guardada) return guardada;
  const respuesta = await fetch(evento.request);
  // Las fotos de otros servidores llegan «opacas» (status 0): también se pueden guardar.
  if (respuesta.ok || respuesta.type === 'opaque') {
    const copia = respuesta.clone();
    evento.waitUntil(
      cache
        .put(evento.request, copia)
        .then(recortarFotos)
        .catch(() => {}),
    );
  }
  return respuesta;
}

self.addEventListener('fetch', (evento) => {
  const { request } = evento;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (SERVIDORES_FOTOS.includes(url.hostname)) {
    evento.respondWith(foto(evento));
    return;
  }
  if (url.origin !== self.location.origin) return;

  if (url.pathname.endsWith('/data/app.json') || url.pathname.endsWith('/data/imagenes.json')) {
    evento.respondWith(primeroRed(evento));
  } else if (LECTOR.some((archivo) => url.pathname.endsWith(`/${archivo}`))) {
    evento.respondWith(lector(evento));
  } else if (request.mode === 'navigate') {
    // Cualquier página de la app abre index.html, también sin conexión.
    evento.respondWith(caches.match('./').then((r) => r ?? fetch(request)));
  } else {
    evento.respondWith(primeroCache(request));
  }
});
