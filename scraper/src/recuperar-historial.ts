/**
 * Rehace data/historial/ con los precios guardados en el historial de git (un commit por día
 * desde el 15/11/2026). Solo hace falta una vez, o si el historial se estropea: después lo
 * pone al día cada descarga. Uso: npm run recuperar-historial
 */
import { execFileSync } from 'node:child_process';
import { escribirHistorial } from './archivos.ts';
import { anotarDia, diaEspana, TIENDAS_HISTORIAL, type Historial } from './historial.ts';
import type { Producto } from './tipos.ts';

const RAIZ = new URL('../../', import.meta.url);
const git = (...args: string[]) =>
  execFileSync('git', args, { cwd: RAIZ, encoding: 'utf8', maxBuffer: 1024 * 1024 * 1024 });

/** Lee un archivo de precios de cualquier día: solo hacen falta el id, el precio y el precioRef. */
function preciosDe(texto: string): Producto[] {
  const datos: unknown = JSON.parse(texto);
  if (!Array.isArray(datos)) throw new Error('El archivo no es una lista de productos');
  return datos.filter(
    (p): p is Producto =>
      typeof p === 'object' &&
      p !== null &&
      typeof (p as Producto).id === 'string' &&
      typeof (p as Producto).precio === 'number' &&
      typeof (p as Producto).precioRef === 'number',
  );
}

for (const tienda of TIENDAS_HISTORIAL) {
  const archivo = `data/${tienda}.json`;
  const commits = git('log', '--reverse', '--format=%H %cI', '--', archivo)
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((linea) => linea.split(' ') as [string, string]);
  let historial: Historial = new Map();
  for (const [hash, fecha] of commits) {
    const productos = preciosDe(git('show', `${hash}:${archivo}`));
    historial = anotarDia(historial, productos, diaEspana(fecha));
    console.log(`${tienda}: ${diaEspana(fecha)} ${hash.slice(0, 7)} (${productos.length})`);
  }
  await escribirHistorial(tienda, historial);
  const puntos = [...historial.values()].reduce((n, p) => n + p.length, 0);
  console.log(`${tienda}: ${historial.size} productos y ${puntos} precios en data/historial/`);
}
