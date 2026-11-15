/**
 * Descarga los precios de Mercadona y Consum y los guarda en /data.
 * Uso: npm run scrape            (todas las tiendas)
 *      npm run scrape -- consum  (solo una)
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { descargarConsum } from './adapters/consum.ts';
import { descargarMercadona } from './adapters/mercadona.ts';
import { crearCliente, type Pedir } from './http.ts';
import {
  estadoTienda,
  leerProductos,
  MetaSchema,
  serializarProductos,
  type EstadoTienda,
  type Meta,
} from './meta.ts';
import { conservarFechas, evaluar, type Veredicto } from './proteccion.ts';
import type { ResultadoAdaptador } from './tipos.ts';

const DATOS = new URL('../../data/', import.meta.url);

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

async function leerJson(nombre: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(new URL(nombre, DATOS), 'utf8'));
  } catch {
    return null;
  }
}

/** Escribe primero en un archivo temporal y luego lo renombra: nunca deja un archivo a medias. */
async function escribir(nombre: string, contenido: string): Promise<void> {
  const destino = new URL(nombre, DATOS);
  const temporal = new URL(`${nombre}.tmp`, DATOS);
  await writeFile(temporal, contenido, 'utf8');
  await rename(temporal, destino);
}

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
    const productos = conservarFechas(resultado.productos, anteriores);
    await escribir(`${tienda}.json`, serializarProductos(productos));
    registrar(`${tienda}: OK, ${productos.length} productos guardados`);
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

  await mkdir(DATOS, { recursive: true });
  const ahora = new Date().toISOString();
  const metaPrevia = MetaSchema.safeParse(await leerJson('meta.json'));
  const meta: Meta = {
    generado: ahora,
    tiendas: metaPrevia.success ? { ...metaPrevia.data.tiendas } : {},
  };

  for (const tienda of tiendas) {
    meta.tiendas[tienda] = await procesar(tienda, meta.tiendas[tienda], ahora);
  }
  await escribir('meta.json', `${JSON.stringify(meta, null, 2)}\n`);
  registrar('meta.json actualizado');
}

await main();
