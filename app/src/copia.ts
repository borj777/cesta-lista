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

/** Sube cuando cambie el formato de la copia, para poder convertir las antiguas. */
export const VERSION_COPIA = 1;

export type Copia = {
  app: 'cesta-lista';
  version: number;
  exportada: string;
  necesidades: Necesidad[];
  lidl: unknown[];
  ajustes: Record<string, unknown>;
};

export function crearCopia(contenido: ContenidoBD, ahora: string): Copia {
  return {
    app: 'cesta-lista',
    version: VERSION_COPIA,
    exportada: ahora,
    necesidades: contenido.necesidades,
    lidl: contenido.lidl,
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
function problemaNecesidad(n: Record<string, unknown>): string | null {
  if (typeof n.id !== 'string' || !n.id) return 'le falta el identificador';
  if (typeof n.nombre !== 'string' || !n.nombre.trim()) return 'le falta el nombre';
  if (!CATEGORIAS.includes(n.categoria as never)) return 'la categoría no es válida';
  if (typeof n.cantidad !== 'number' || !Number.isFinite(n.cantidad) || n.cantidad <= 0) {
    return 'la cantidad no es válida';
  }
  if (!UNIDADES_NECESIDAD.includes(n.unidad as never)) return 'la unidad no es válida';
  if (!FRECUENCIAS.includes(n.frecuencia as never)) return 'la frecuencia no es válida';
  if (n.notas !== undefined && typeof n.notas !== 'string') return 'las notas no son texto';
  if (!esFecha(n.creada) || !esFecha(n.actualizada)) return 'las fechas no son válidas';
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

  const ids = new Set<string>();
  for (const [i, n] of datos.necesidades.entries()) {
    const nombre = esObjeto(n) && typeof n.nombre === 'string' ? ` («${n.nombre}»)` : '';
    const problema = esObjeto(n) ? problemaNecesidad(n) : 'no tiene el formato esperado';
    if (problema) {
      return { ok: false, error: `La necesidad n.º ${i + 1}${nombre} no es válida: ${problema}.` };
    }
    const id = (n as Necesidad).id;
    if (ids.has(id)) {
      return { ok: false, error: `La necesidad n.º ${i + 1}${nombre} está repetida.` };
    }
    ids.add(id);
  }

  const lidl = datos.lidl === undefined ? [] : datos.lidl;
  const ajustes = datos.ajustes === undefined ? {} : datos.ajustes;
  if (!Array.isArray(lidl) || !esObjeto(ajustes)) {
    return { ok: false, error: 'La copia tiene partes dañadas y no se puede importar.' };
  }

  return {
    ok: true,
    copia: {
      app: 'cesta-lista',
      version: datos.version,
      exportada: esFecha(datos.exportada) ? datos.exportada : new Date(0).toISOString(),
      necesidades: datos.necesidades as Necesidad[],
      lidl,
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
