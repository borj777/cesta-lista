/**
 * Almacenamiento en el iPhone (IndexedDB). Los datos personales nunca salen del dispositivo,
 * salvo en la copia de seguridad que exporta el usuario.
 */
import type { Necesidad } from './necesidades/modelo.ts';
import { AJUSTES_DEL_MENU, quitarMenu } from './sinMenu.ts';
import { crearLidl, type TiendaPropia } from './tiendas/modelo.ts';
import type { ProductoPropio } from './tiendas/productos.ts';

const NOMBRE_BD = 'cesta-lista';
/**
 * Versión 1: necesidades, lidl (precios de Lidl) y ajustes.
 * Versión 2: tiendas propias y sus productos (los de Lidl pasan a la tienda propia «Lidl»).
 * Versión 3: recetas.
 * Versión 4: sin recetas (se quitó el Menú): lo que gastaba el menú pasa a las necesidades.
 */
const VERSION_BD = 4;

/** Almacenes de la base de datos. */
export const ALMACENES = ['necesidades', 'tiendas', 'productos', 'ajustes'] as const;
export type NombreAlmacen = (typeof ALMACENES)[number];

/** Clave del ajuste con las tiendas apagadas. */
export const AJUSTE_APAGADAS = 'tiendasApagadas';

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

/**
 * Versión 4: suma a las necesidades lo que gastaba el menú, borra las recetas y los ajustes
 * del Menú. Todo dentro de la actualización: si falla, la base de datos sigue como estaba.
 */
function quitarRecetas(bd: IDBDatabase, tx: IDBTransaction) {
  const necesidades = tx.objectStore('necesidades');
  const ajustes = tx.objectStore('ajustes');
  const recetas = tx.objectStore('recetas').getAll();
  const menu = ajustes.get('menu');
  const lista = necesidades.getAll() as IDBRequest<Necesidad[]>;
  // Las peticiones de una transacción terminan en orden: cuando acaba la última, están todas.
  lista.onsuccess = () => {
    for (const n of quitarMenu(lista.result, recetas.result as unknown[], menu.result)) {
      necesidades.put(n);
    }
    for (const clave of AJUSTES_DEL_MENU) ajustes.delete(clave);
    bd.deleteObjectStore('recetas');
  };
}

export function abrir(): Promise<IDBDatabase> {
  conexion ??= new Promise((resolver, rechazar) => {
    const peticion = indexedDB.open(NOMBRE_BD, VERSION_BD);
    peticion.onupgradeneeded = () => {
      const bd = peticion.result;
      const tx = peticion.transaction;
      if (!bd.objectStoreNames.contains('necesidades')) {
        bd.createObjectStore('necesidades', { keyPath: 'id' });
      }
      if (!bd.objectStoreNames.contains('ajustes')) bd.createObjectStore('ajustes');
      if (bd.objectStoreNames.contains('recetas') && tx) quitarRecetas(bd, tx);
      if (!bd.objectStoreNames.contains('tiendas')) {
        // Lidl viene creada siempre, con el id 'lidl' que ya usan las equivalencias.
        bd.createObjectStore('tiendas', { keyPath: 'id' }).put(crearLidl(new Date().toISOString()));
      }
      if (!bd.objectStoreNames.contains('productos')) {
        const productos = bd.createObjectStore('productos', { keyPath: 'id' });
        // Los precios de Lidl de la versión 1 pasan a la tienda «Lidl».
        if (bd.objectStoreNames.contains('lidl') && tx) {
          const viejos = tx.objectStore('lidl').getAll();
          viejos.onsuccess = () => {
            for (const p of viejos.result as Omit<ProductoPropio, 'tienda'>[]) {
              productos.put({ ...p, tienda: 'lidl' });
            }
            bd.deleteObjectStore('lidl');
          };
        }
      }
    };
    peticion.onsuccess = () => {
      const bd = peticion.result;
      // Si una versión nueva de la app necesita actualizar la base de datos, se le deja paso.
      bd.onversionchange = () => {
        bd.close();
        conexion = null;
      };
      resolver(bd);
    };
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

export async function listarTiendas(): Promise<TiendaPropia[]> {
  const bd = await abrir();
  return promesa<TiendaPropia[]>(
    bd.transaction('tiendas').objectStore('tiendas').getAll() as IDBRequest<TiendaPropia[]>,
  );
}

export async function guardarTiendaPropia(t: TiendaPropia): Promise<void> {
  const bd = await abrir();
  const tx = bd.transaction('tiendas', 'readwrite');
  tx.objectStore('tiendas').put(t);
  await terminada(tx);
  void pedirAlmacenamientoPersistente();
}

/**
 * Borra una tienda propia con sus productos, la quita de las necesidades que la usaban y de
 * las tiendas apagadas. Todo en una sola operación.
 */
export async function borrarTiendaPropia(id: string): Promise<void> {
  const bd = await abrir();
  const tx = bd.transaction(['tiendas', 'productos', 'necesidades', 'ajustes'], 'readwrite');
  const fin = terminada(tx);
  tx.objectStore('tiendas').delete(id);
  const productos = tx.objectStore('productos');
  const todos = productos.getAll() as IDBRequest<ProductoPropio[]>;
  todos.onsuccess = () => {
    for (const p of todos.result) if (p.tienda === id) productos.delete(p.id);
  };
  const necesidades = tx.objectStore('necesidades');
  const lista = necesidades.getAll() as IDBRequest<Necesidad[]>;
  lista.onsuccess = () => {
    for (const n of lista.result) {
      const enEquivalencias = !!n.equivalencias && id in n.equivalencias;
      const enOfertas = !!n.ofertas && id in n.ofertas;
      if (!enEquivalencias && !enOfertas) continue;
      const nueva: Necesidad = { ...n };
      const resto = Object.fromEntries(
        Object.entries(n.equivalencias ?? {}).filter(([tienda]) => tienda !== id),
      );
      if (Object.keys(resto).length > 0) nueva.equivalencias = resto;
      else delete nueva.equivalencias;
      const ofertas = Object.fromEntries(
        Object.entries(n.ofertas ?? {}).filter(([tienda]) => tienda !== id),
      );
      if (Object.keys(ofertas).length > 0) nueva.ofertas = ofertas;
      else delete nueva.ofertas;
      necesidades.put(nueva);
    }
  };
  const ajustes = tx.objectStore('ajustes');
  const apagadas = ajustes.get(AJUSTE_APAGADAS) as IDBRequest<unknown>;
  apagadas.onsuccess = () => {
    if (Array.isArray(apagadas.result)) {
      ajustes.put(
        apagadas.result.filter((t) => t !== id),
        AJUSTE_APAGADAS,
      );
    }
  };
  await fin;
}

export async function listarProductos(): Promise<ProductoPropio[]> {
  const bd = await abrir();
  return promesa<ProductoPropio[]>(
    bd.transaction('productos').objectStore('productos').getAll() as IDBRequest<ProductoPropio[]>,
  );
}

export async function guardarProducto(p: ProductoPropio): Promise<void> {
  const bd = await abrir();
  const tx = bd.transaction('productos', 'readwrite');
  tx.objectStore('productos').put(p);
  await terminada(tx);
  void pedirAlmacenamientoPersistente();
}

export async function borrarProducto(id: string): Promise<void> {
  const bd = await abrir();
  const tx = bd.transaction('productos', 'readwrite');
  tx.objectStore('productos').delete(id);
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
  tiendas: TiendaPropia[];
  productos: ProductoPropio[];
  ajustes: Record<string, unknown>;
};

export async function leerTodo(): Promise<ContenidoBD> {
  const bd = await abrir();
  const tx = bd.transaction([...ALMACENES]);
  const ajustes = tx.objectStore('ajustes');
  const [necesidades, tiendas, productos, claves, valores] = await Promise.all([
    promesa(tx.objectStore('necesidades').getAll() as IDBRequest<Necesidad[]>),
    promesa(tx.objectStore('tiendas').getAll() as IDBRequest<TiendaPropia[]>),
    promesa(tx.objectStore('productos').getAll() as IDBRequest<ProductoPropio[]>),
    promesa(ajustes.getAllKeys()),
    promesa(ajustes.getAll()),
  ]);
  return {
    necesidades,
    tiendas,
    productos,
    ajustes: Object.fromEntries(claves.map((c, i) => [String(c), valores[i]])),
  };
}

/**
 * Sustituye todos los datos por los de una copia, en una sola operación: si algo falla,
 * no se pierde nada de lo que había.
 */
export async function reemplazarTodo(contenido: ContenidoBD): Promise<void> {
  const bd = await abrir();
  const tx = bd.transaction([...ALMACENES], 'readwrite');
  const fin = terminada(tx);
  try {
    const necesidades = tx.objectStore('necesidades');
    const tiendas = tx.objectStore('tiendas');
    const productos = tx.objectStore('productos');
    const ajustes = tx.objectStore('ajustes');
    for (const almacen of [necesidades, tiendas, productos, ajustes]) almacen.clear();
    for (const n of contenido.necesidades) necesidades.put(n);
    for (const t of contenido.tiendas) tiendas.put(t);
    for (const p of contenido.productos) productos.put(p);
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
