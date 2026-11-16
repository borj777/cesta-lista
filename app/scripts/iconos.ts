/**
 * Genera los iconos PNG de la app a partir de iconos/icono.svg.
 * Uso: npm run iconos (solo hace falta al cambiar el diseño del icono).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const svg = readFileSync(new URL('../iconos/icono.svg', import.meta.url), 'utf8');
const TAMANOS: Record<string, number> = {
  'apple-touch-icon.png': 180,
  'icono-192.png': 192,
  'icono-512.png': 512,
};

for (const [nombre, tamano] of Object.entries(TAMANOS)) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: tamano } }).render().asPng();
  writeFileSync(new URL(`../public/${nombre}`, import.meta.url), png);
  console.log(`public/${nombre}: ${tamano} × ${tamano}, ${(png.length / 1024).toFixed(1)} KB`);
}
