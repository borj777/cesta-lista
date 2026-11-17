/**
 * Copia de seguridad: todos los datos del iPhone en un archivo JSON que el usuario guarda
 * donde quiera (Archivos, iCloud, correo...) y puede volver a importar.
 */
import type { ContenidoBD } from './almacen.ts';
import {
  CATEGORIAS,
  FRECUENCIAS,
  UNIDADES_NECESIDAD,
  type Necesidad,
} from './necesidades/modelo.ts';
import { crearLidl, esAutomatica, problemaTienda, type TiendaPropia } from './tiendas/modelo.ts';
import { problemaReceta, type Receta } from './menu/recetas.ts';
import { problemaProducto, type ProductoPropio } from './tiendas/productos.ts';

/**
 * Sube cuando cambie el formato de la copia, para poder convertir las antiguas.
 * Versión 1: necesidades, lidl (precios de Lidl) y ajustes.
 * Versión 2: necesidades, tiendas (las propias), productos (de las tiendas propias) y ajustes.
 * Versión 3: además, recetas.
 */
export const VERSION_COPIA = 3;

export type Copia = {
  app: 'cesta-lista';
  version: number;
  exportada: string;
  necesidades: Necesidad[];
  tiendas: TiendaPropia[];
  recetas: Receta[];
  productos: ProductoPropio[];
  ajustes: Record<string, unknown>;
};

export function crearCopia(contenido: ContenidoBD, ahora: string): Copia {
  return {
    app: 'cesta-lista',
    version: VERSION_COPIA,
    exportada: ahora,
    necesidades: contenido.necesidades,
    tiendas: contenido.tiendas,
    productos: contenido.productos,
    recetas: contenido.recetas,
    ajustes: contenido.ajustes,
  };
}

export function textoCopia(copia: Copia): string {
  return `${JSON.stringify(copia, null, 2)}\n`;
}

/** "cesta-lista-copia-2026-11-16.json" (fecha de España). */
export function nombreArchivo(ahora: Date): string {
  const fecha = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Europe/Madrid',
  }).format(ahora);
  return `cesta-lista-copia-${fecha}.json`;
}

export type ResultadoLectura = { ok: true; copia: Copia } | { ok: false; error: string };

const esObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const esFecha = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));

/** Motivo por el que una necesidad de la copia no es válida, o null si lo es. */
function problemaNecesidad(
  n: Record<string, unknown>,
  tiendas: ReadonlySet<string>,
): string | null {
  if (typeof n.id !== 'string' || !n.id) return 'le falta el identificador';
  if (typeof n.nombre !== 'string' || !n.nombre.trim()) return 'le falta el nombre';
  if (!CATEGORIAS.includes(n.categoria as never)) return 'la categoría no es válida';
  if (n.soloRecetas !== undefined && n.soloRecetas !== true)
    return 'la marca de recetas no es válida';
  const minima = n.soloRecetas ? 0 : Number.MIN_VALUE;
  if (typeof n.cantidad !== 'number' || !Number.isFinite(n.cantidad) || n.cantidad < minima) {
    return 'la cantidad no es válida';
  }
  if (!UNIDADES_NECESIDAD.includes(n.unidad as never)) return 'la unidad no es válida';
  if (!FRECUENCIAS.includes(n.frecuencia as never)) return 'la frecuencia no es válida';
  if (n.notas !== undefined && typeof n.notas !== 'string') return 'las notas no son texto';
  if (!esFecha(n.creada) || !esFecha(n.actualizada)) return 'las fechas no son válidas';
  if (n.ultimaCompra !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(String(n.ultimaCompra))) {
    return 'la fecha de la última compra no es válida';
  }
  if (n.duraHasta !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(String(n.duraHasta))) {
    return 'la fecha hasta la que dura no es válida';
  }
  if (n.equivalencias !== undefined) {
    if (!esObjeto(n.equivalencias)) return 'los productos elegidos no son válidos';
    for (const [tienda, e] of Object.entries(n.equivalencias)) {
      if (!esAutomatica(tienda) && !tiendas.has(tienda)) {
        return `la tienda «${tienda}» no existe`;
      }
      const valida =
        esObjeto(e) &&
        ((typeof e.id === 'string' && e.id.length > 0 && Object.keys(e).length === 1) ||
          (e.noCompro === true && Object.keys(e).length === 1));
      if (!valida) return `el producto elegido en ${tienda} no es válido`;
    }
  }
  return null;
}

/** Lee y comprueba un archivo de copia. Nunca acepta datos a medias. */
export function leerCopia(texto: string): ResultadoLectura {
  let datos: unknown;
  try {
    datos = JSON.parse(texto);
  } catch {
    return { ok: false, error: 'El archivo no es una copia de Cesta Lista: no se puede leer.' };
  }
  if (!esObjeto(datos) || datos.app !== 'cesta-lista') {
    return { ok: false, error: 'Este archivo no es una copia de seguridad de Cesta Lista.' };
  }
  if (typeof datos.version !== 'number' || datos.version < 1) {
    return { ok: false, error: 'La copia no indica su versión: puede estar dañada.' };
  }
  if (datos.version > VERSION_COPIA) {
    return {
      ok: false,
      error:
        'Esta copia es de una versión más nueva de Cesta Lista. Actualiza la app y vuelve a intentarlo.',
    };
  }
  if (!Array.isArray(datos.necesidades)) {
    return {
      ok: false,
      error: 'La copia no contiene la lista de necesidades: puede estar dañada.',
    };
  }
  const ajustes = datos.ajustes === undefined ? {} : datos.ajustes;
  if (!esObjeto(ajustes)) {
    return { ok: false, error: 'La copia tiene partes dañadas y no se puede importar.' };
  }

  // Las copias de la versión 1 solo tenían los precios de Lidl: pasan a la tienda «Lidl».
  let tiendas: unknown;
  let productos: unknown;
  if (datos.version === 1) {
    const lidl = datos.lidl === undefined ? [] : datos.lidl;
    if (!Array.isArray(lidl)) {
      return { ok: false, error: 'La copia tiene partes dañadas y no se puede importar.' };
    }
    const exportada = esFecha(datos.exportada) ? datos.exportada : new Date(0).toISOString();
    tiendas = [crearLidl(exportada)];
    productos = lidl.map((p: unknown) => (esObjeto(p) ? { ...p, tienda: 'lidl' } : p));
  } else {
    tiendas = datos.tiendas;
    productos = datos.productos;
  }
  if (!Array.isArray(tiendas) || !Array.isArray(productos)) {
    return { ok: false, error: 'La copia tiene partes dañadas y no se puede importar.' };
  }

  const nombreDe = (x: unknown) =>
    esObjeto(x) && typeof x.nombre === 'string' && x.nombre.trim() ? ` («${x.nombre}»)` : '';

  const idsTiendas = new Set<string>();
  for (const [i, t] of tiendas.entries()) {
    const problema = esObjeto(t) ? problemaTienda(t) : 'no tiene el formato esperado';
    if (problema) {
      return {
        ok: false,
        error: `La tienda n.º ${i + 1}${nombreDe(t)} no es válida: ${problema}.`,
      };
    }
    const id = (t as TiendaPropia).id;
    if (idsTiendas.has(id)) {
      return { ok: false, error: `La tienda n.º ${i + 1}${nombreDe(t)} está repetida.` };
    }
    idsTiendas.add(id);
  }
  const nombreTienda = new Map((tiendas as TiendaPropia[]).map((t) => [t.id, t.nombre]));

  const ids = new Set<string>();
  for (const [i, n] of datos.necesidades.entries()) {
    const problema = esObjeto(n)
      ? problemaNecesidad(n, idsTiendas)
      : 'no tiene el formato esperado';
    if (problema) {
      return {
        ok: false,
        error: `La necesidad n.º ${i + 1}${nombreDe(n)} no es válida: ${problema}.`,
      };
    }
    const id = (n as Necesidad).id;
    if (ids.has(id)) {
      return { ok: false, error: `La necesidad n.º ${i + 1}${nombreDe(n)} está repetida.` };
    }
    ids.add(id);
  }

  const idsProductos = new Set<string>();
  for (const [i, p] of productos.entries()) {
    const tienda = esObjeto(p) && typeof p.tienda === 'string' ? p.tienda : '';
    const deTienda = nombreTienda.get(tienda) ?? 'tus tiendas';
    let problema = esObjeto(p) ? problemaProducto(p) : 'no tiene el formato esperado';
    if (!problema && !idsTiendas.has(tienda)) problema = `la tienda «${tienda}» no existe`;
    if (problema) {
      return {
        ok: false,
        error: `El producto de ${deTienda} n.º ${i + 1}${nombreDe(p)} no es válido: ${problema}.`,
      };
    }
    const id = (p as ProductoPropio).id;
    if (idsProductos.has(id)) {
      return {
        ok: false,
        error: `El producto de ${deTienda} n.º ${i + 1}${nombreDe(p)} está repetido.`,
      };
    }
    idsProductos.add(id);
  }

  // Las copias anteriores a la versión 3 no tienen recetas.
  const recetas = datos.recetas === undefined ? [] : datos.recetas;
  if (!Array.isArray(recetas)) {
    return { ok: false, error: 'La copia tiene partes dañadas y no se puede importar.' };
  }
  const unidades = new Map((datos.necesidades as Necesidad[]).map((n) => [n.id, n.unidad]));
  const idsRecetas = new Set<string>();
  for (const [i, r] of recetas.entries()) {
    const problema = esObjeto(r) ? problemaReceta(r, unidades) : 'no tiene el formato esperado';
    if (problema) {
      return {
        ok: false,
        error: `La receta n.º ${i + 1}${nombreDe(r)} no es válida: ${problema}.`,
      };
    }
    const id = (r as Receta).id;
    if (idsRecetas.has(id)) {
      return { ok: false, error: `La receta n.º ${i + 1}${nombreDe(r)} está repetida.` };
    }
    idsRecetas.add(id);
  }

  return {
    ok: true,
    copia: {
      app: 'cesta-lista',
      version: datos.version,
      exportada: esFecha(datos.exportada) ? datos.exportada : new Date(0).toISOString(),
      necesidades: datos.necesidades as Necesidad[],
      tiendas: tiendas as TiendaPropia[],
      productos: productos as ProductoPropio[],
      recetas: recetas as Receta[],
      ajustes,
    },
  };
}

/**
 * Ofrece el archivo al usuario. En el iPhone abre la hoja de Compartir («Guardar en
 * Archivos», AirDrop, correo...); si no se puede, lo descarga.
 */
export async function ofrecerArchivo(
  texto: string,
  nombre: string,
): Promise<'compartida' | 'descargada' | 'cancelada'> {
  const archivo = new File([texto], nombre, { type: 'application/json' });
  if (navigator.canShare?.({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo], title: 'Copia de Cesta Lista' });
      return 'compartida';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelada';
      // Si compartir falla por otro motivo, se intenta descargar.
    }
  }
  const url = URL.createObjectURL(archivo);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'descargada';
}
