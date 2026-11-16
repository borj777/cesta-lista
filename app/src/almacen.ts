/**
 * Almacenamiento en el iPhone (IndexedDB). Los datos personales nunca salen del dispositivo,
 * salvo en la copia de seguridad que exporta el usuario.
 */
import type { Necesidad } from './necesidades/modelo.ts';

const NOMBRE_BD = 'cesta-lista';
const VERSION_BD = 1;

/** Almacenes de la base de datos. lidl se usará en el paso 4. */
export const ALMACENES = ['necesidades', 'lidl', 'ajustes'] as const;
export type NombreAlmacen = (typeof ALMACENES)[number];

let conexion: Promise<IDBDatabase> | null = null;

function promesa<T>(peticion: IDBRequest<T>): Promise<T> {
  return new Promise((resolver, rechazar) => {
    peticion.onsuccess = () => resolver(peticion.result);
    peticion.onerror = () => rechazar(peticion.error);
  });
}

function terminada(tx: IDBTransaction): Promise<void> {
  return new Promise((resolver, rechazar) => {
    tx.oncomplete = () => resolver();
    tx.onerror = () => rechazar(tx.error);
    tx.onabort = () => rechazar(tx.error ?? new Error('Operación cancelada'));
  });
}

export function abrir(): Promise<IDBDatabase> {
  conexion ??= new Promise((resolver, rechazar) => {
    const peticion = indexedDB.open(NOMBRE_BD, VERSION_BD);
    peticion.onupgradeneeded = () => {
      const bd = peticion.result;
      if (!bd.objectStoreNames.contains('necesidades')) {
        bd.createObjectStore('necesidades', { keyPath: 'id' });
      }
      if (!bd.objectStoreNames.contains('lidl')) bd.createObjectStore('lidl', { keyPath: 'id' });
      if (!bd.objectStoreNames.contains('ajustes')) bd.createObjectStore('ajustes');
    };
    peticion.onsuccess = () => resolver(peticion.result);
    peticion.onerror = () => {
      conexion = null;
      rechazar(peticion.error);
    };
  });
  return conexion;
}

/** Cierra la conexión (para los tests). */
export async function cerrar(): Promise<void> {
  if (conexion) (await conexion).close();
  conexion = null;
}

export async function listarNecesidades(): Promise<Necesidad[]> {
  const bd = await abrir();
  return promesa<Necesidad[]>(
    bd.transaction('necesidades').objectStore('necesidades').getAll() as IDBRequest<Necesidad[]>,
  );
}

export async function guardarNecesidad(n: Necesidad): Promise<void> {
  const bd = await abrir();
  const tx = bd.transaction('necesidades', 'readwrite');
  tx.objectStore('necesidades').put(n);
  await terminada(tx);
  void pedirAlmacenamientoPersistente();
}

export async function borrarNecesidad(id: string): Promise<void> {
  const bd = await abrir();
  const tx = bd.transaction('necesidades', 'readwrite');
  tx.objectStore('necesidades').delete(id);
  await terminada(tx);
}

export async function leerAjuste<T>(clave: string): Promise<T | undefined> {
  const bd = await abrir();
  return promesa<T | undefined>(
    bd.transaction('ajustes').objectStore('ajustes').get(clave) as IDBRequest<T | undefined>,
  );
}

export async function guardarAjuste(clave: string, valor: unknown): Promise<void> {
  const bd = await abrir();
  const tx = bd.transaction('ajustes', 'readwrite');
  tx.objectStore('ajustes').put(valor, clave);
  await terminada(tx);
}

/** Todo lo guardado, para la copia de seguridad. */
export type ContenidoBD = {
  necesidades: Necesidad[];
  lidl: unknown[];
  ajustes: Record<string, unknown>;
};

export async function leerTodo(): Promise<ContenidoBD> {
  const bd = await abrir();
  const tx = bd.transaction(['necesidades', 'lidl', 'ajustes']);
  const ajustes = tx.objectStore('ajustes');
  const [necesidades, lidl, claves, valores] = await Promise.all([
    promesa(tx.objectStore('necesidades').getAll() as IDBRequest<Necesidad[]>),
    promesa(tx.objectStore('lidl').getAll()),
    promesa(ajustes.getAllKeys()),
    promesa(ajustes.getAll()),
  ]);
  return {
    necesidades,
    lidl,
    ajustes: Object.fromEntries(claves.map((c, i) => [String(c), valores[i]])),
  };
}

/**
 * Sustituye todos los datos por los de una copia, en una sola operación: si algo falla,
 * no se pierde nada de lo que había.
 */
export async function reemplazarTodo(contenido: ContenidoBD): Promise<void> {
  const bd = await abrir();
  const tx = bd.transaction(['necesidades', 'lidl', 'ajustes'], 'readwrite');
  const fin = terminada(tx);
  try {
    const necesidades = tx.objectStore('necesidades');
    const lidl = tx.objectStore('lidl');
    const ajustes = tx.objectStore('ajustes');
    necesidades.clear();
    lidl.clear();
    ajustes.clear();
    for (const n of contenido.necesidades) necesidades.put(n);
    for (const p of contenido.lidl) lidl.put(p);
    for (const [clave, valor] of Object.entries(contenido.ajustes)) ajustes.put(valor, clave);
  } catch (error) {
    // Un dato no válido lanza un error al momento: hay que cancelar la operación entera,
    // o lo ya hecho (incluido el borrado) se guardaría igualmente.
    tx.abort();
    await fin.catch(() => {});
    throw error;
  }
  await fin;
}

/** Pide al sistema que no borre los datos aunque falte espacio. */
async function pedirAlmacenamientoPersistente(): Promise<void> {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch {
    // No todos los navegadores lo permiten; no pasa nada.
  }
}
