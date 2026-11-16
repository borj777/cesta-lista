import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import preact from '@preact/preset-vite';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/** La app se publica en https://borj777.github.io/cesta-lista/ */
const BASE = '/cesta-lista/';
const DATOS = new URL('../data/', import.meta.url);
const PUBLICO = new URL('./public/', import.meta.url);

/** En desarrollo, sirve data/app.json desde la carpeta /data del repositorio. */
function datosLocales(): Plugin {
  return {
    name: 'datos-locales',
    configureServer(server) {
      server.middlewares.use(`${BASE}data/`, (req, res, next) => {
        const nombre = (req.url ?? '').replace(/^\//, '').split('?')[0] ?? '';
        const archivo = new URL(nombre, DATOS);
        if (nombre !== 'app.json' || !existsSync(archivo)) return next();
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(readFileSync(archivo));
      });
    },
  };
}

/**
 * Genera sw.js a partir de sw/sw.js con la lista de archivos de la app (para que funcione
 * sin conexión) y una versión que cambia cuando cambia cualquier archivo.
 */
function serviceWorker(): Plugin {
  return {
    name: 'service-worker',
    apply: 'build',
    generateBundle(_opciones, bundle) {
      const publicos = readdirSync(PUBLICO).filter((n) => !n.startsWith('.'));
      const archivos = [...Object.keys(bundle), ...publicos]
        .filter((n) => !n.endsWith('.map') && n !== 'index.html')
        .sort();
      const huella = createHash('sha256');
      for (const nombre of Object.keys(bundle).sort()) {
        const parte = bundle[nombre];
        if (!parte) continue;
        huella.update(nombre);
        huella.update(parte.type === 'chunk' ? parte.code : String(parte.source));
      }
      const plantilla = readFileSync(new URL('./sw/sw.js', import.meta.url), 'utf8');
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: plantilla
          .replace('__VERSION__', huella.digest('hex').slice(0, 12))
          .replace('__ARCHIVOS__', JSON.stringify(['./', ...archivos])),
      });
    },
  };
}

export default defineConfig({
  base: BASE,
  plugins: [preact(), datosLocales(), serviceWorker()],
  define: {
    __VERSION_APP__: JSON.stringify((process.env.GITHUB_SHA ?? 'local').slice(0, 7)),
    __FECHA_BUILD__: JSON.stringify(new Date().toISOString()),
  },
  build: {
    target: 'safari16',
  },
  test: {
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
  },
});
