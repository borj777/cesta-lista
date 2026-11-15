/**
 * Muestra el estado de cada tienda según data/meta.json y termina con error si alguna
 * ha fallado. Lo usa el workflow diario para avisar (cruz roja y correo de GitHub).
 * Uso: npm run estado
 */
import { readFile } from 'node:fs/promises';
import { MetaSchema } from './meta.ts';

const fecha = new Intl.DateTimeFormat('es-ES', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Europe/Madrid',
});

const texto = await readFile(new URL('../../data/meta.json', import.meta.url), 'utf8').catch(
  () => null,
);
const meta = MetaSchema.safeParse(texto ? JSON.parse(texto) : null);
if (!meta.success) {
  console.error('No hay un data/meta.json válido.');
  process.exit(1);
}

let fallidas = 0;
for (const [tienda, e] of Object.entries(meta.data.tiendas)) {
  const datos = e.actualizado ? fecha.format(new Date(e.actualizado)) : 'nunca';
  if (e.estado === 'ok') {
    console.log(
      `✅ ${tienda}: ${e.productos} productos (${e.duracionSegundos} s, ${e.peticiones} peticiones). ` +
        `Avisos de precioRef: ${e.avisosPrecioRef}. Sin verificar: ${e.sinVerificar}.`,
    );
  } else {
    fallidas++;
    console.log(`❌ ${tienda}: FALLIDA. ${e.motivo ?? ''}`);
    console.log(`   Se conservan los ${e.productos} productos del ${datos}.`);
  }
}
process.exit(fallidas > 0 ? 1 : 0);
