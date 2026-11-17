/**
 * Descarga los precios de Mercadona y Consum y los guarda en /data.
 * Uso: npm run scrape            (todas las tiendas)
 *      npm run scrape -- consum  (solo una)
 */
import { descargarConsum } from './adapters/consum.ts';
import { descargarMercadona } from './adapters/mercadona.ts';
import { leerSecciones, serializarSecciones, unirSecciones } from './app.ts';
import { actualizarApp, escribir, leerJson, leerMeta } from './archivos.ts';
import { crearCliente, type Pedir } from './http.ts';
import {
  estadoTienda,
  leerProductos,
  serializarProductos,
  type EstadoTienda,
  type Meta,
} from './meta.ts';
import { evaluar, type Veredicto } from './proteccion.ts';
import type { ResultadoAdaptador } from './tipos.ts';

type Descargar = (
  pedir: Pedir,
  ahora: string,
  registrar: (m: string) => void,
) => Promise<ResultadoAdaptador>;

const ADAPTADORES = {
  mercadona: descargarMercadona,
  consum: descargarConsum,
} satisfies Record<string, Descargar>;
type TiendaScraper = keyof typeof ADAPTADORES;

const registrar = (mensaje: string) => console.log(`[${new Date().toISOString()}] ${mensaje}`);

async function procesar(
  tienda: TiendaScraper,
  previo: EstadoTienda | undefined,
  ahora: string,
): Promise<EstadoTienda> {
  registrar(`${tienda}: empieza la descarga`);
  const inicio = performance.now();
  const cliente = crearCliente();
  const anteriores = leerProductos(await leerJson(`${tienda}.json`));

  let resultado: ResultadoAdaptador | null = null;
  let veredicto: Veredicto;
  try {
    resultado = await ADAPTADORES[tienda](cliente.pedir, ahora, registrar);
    veredicto = evaluar(resultado, anteriores);
  } catch (error) {
    veredicto = { valido: false, motivo: error instanceof Error ? error.message : String(error) };
  }

  if (veredicto.valido && resultado) {
    await escribir(`${tienda}.json`, serializarProductos(resultado.productos));
    const secciones = leerSecciones(await leerJson('secciones.json'));
    await escribir(
      'secciones.json',
      serializarSecciones(unirSecciones(secciones, tienda, resultado.secciones)),
    );
    registrar(`${tienda}: OK, ${resultado.productos.length} productos guardados`);
  } else if (!veredicto.valido) {
    registrar(`${tienda}: FALLIDA, se conservan los datos anteriores. Motivo: ${veredicto.motivo}`);
  }

  return estadoTienda({
    previo,
    ahora,
    duracionSegundos: (performance.now() - inicio) / 1000,
    peticiones: cliente.peticiones,
    resultado,
    veredicto,
  });
}

async function main(): Promise<void> {
  const argumentos = process.argv.slice(2);
  const desconocidas = argumentos.filter((t) => !(t in ADAPTADORES));
  if (desconocidas.length > 0) {
    console.error(`Tienda desconocida: ${desconocidas.join(', ')}. Usa: mercadona, consum`);
    process.exit(2);
  }
  const tiendas = (
    argumentos.length > 0 ? argumentos : Object.keys(ADAPTADORES)
  ) as TiendaScraper[];

  const ahora = new Date().toISOString();
  const metaPrevia = await leerMeta();
  const meta: Meta = { generado: ahora, tiendas: { ...metaPrevia?.tiendas } };

  for (const tienda of tiendas) {
    meta.tiendas[tienda] = await procesar(tienda, meta.tiendas[tienda], ahora);
  }
  await escribir('meta.json', `${JSON.stringify(meta, null, 2)}\n`);
  registrar('meta.json actualizado');

  const bytes = await actualizarApp(meta);
  registrar(`app.json actualizado (${(bytes / 1024 / 1024).toFixed(2)} MB)`);
}

await main();
