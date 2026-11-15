/**
 * Regenera data/app.json con los datos ya guardados, sin descargar nada.
 * Uso: npm run app
 */
import { actualizarApp, leerMeta } from './archivos.ts';

const meta = await leerMeta();
if (!meta) {
  console.error('No hay un data/meta.json válido: lanza antes "npm run scrape".');
  process.exit(1);
}
const bytes = await actualizarApp(meta);
console.log(`data/app.json generado: ${(bytes / 1024 / 1024).toFixed(2)} MB`);
