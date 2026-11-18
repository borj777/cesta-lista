/**
 * Avisos «Han bajado de precio»: productos elegidos en Mercadona y Consum (a mano o por la app)
 * cuyo último cambio (`cambio` de app.json, de los últimos 30 días) es una bajada del precioRef
 * de al menos el mínimo de Ajustes. Se mira el precioRef, no el del envase: la carne en bandeja
 * cambia de precio por envase sin que cambie su €/kg. Funciones puras.
 */
import type { BuscarProducto } from '../catalogo.ts';
import { precioVigente } from '../formato.ts';
import type { Necesidad } from '../necesidades/modelo.ts';
import { TIENDAS_AUTOMATICAS, type TiendaAutomatica } from '../tiendas/modelo.ts';
import type { ProductoApp } from '../tipos.ts';

/** Mínimos que se pueden elegir en Ajustes (en %); 0 = no avisar. */
export const MINIMOS_BAJADA = [0, 5, 10, 20] as const;
export const MINIMO_BAJADA_INICIAL = 5;

/** Días que se recuerda un aviso visto: lo que dura `cambio` en app.json, y uno más. */
const DIAS_VISTAS = 31;

export type Bajada = {
  /** «tienda:id:día»: identifica esta bajada (si vuelve a bajar otro día, es otro aviso). */
  clave: string;
  necesidad: Necesidad;
  tienda: TiendaAutomatica;
  producto: ProductoApp;
  dia: string;
  antesRef: number;
  ahoraRef: number;
  /** Lo que ha bajado, en % redondeado. */
  porcentaje: number;
};

export const claveBajada = (tienda: string, id: string, dia: string) => `${tienda}:${id}:${dia}`;

/**
 * Bajadas de los productos elegidos en las necesidades, de la mayor a la menor. Cada producto
 * sale una vez (con la primera necesidad que lo usa); no salen las de tiendas apagadas, las ya
 * vistas ni las que ya no valen hoy (p. ej. una oferta de Consum que ha terminado).
 */
export function bajadasDePrecio(
  necesidades: readonly Necesidad[],
  buscar: BuscarProducto,
  opciones: {
    hoy: string;
    /** Mínimo en %; con 0 no hay avisos. */
    minimo: number;
    /** Tiendas encendidas. */
    activas: readonly string[];
    vistas: readonly string[];
  },
): Bajada[] {
  const { hoy, minimo, activas, vistas } = opciones;
  if (minimo <= 0) return [];
  const vistasSet = new Set(vistas);
  const porClave = new Map<string, Bajada>();
  for (const necesidad of necesidades) {
    for (const tienda of TIENDAS_AUTOMATICAS) {
      const eq = necesidad.equivalencias?.[tienda];
      if (!eq || !('id' in eq) || !activas.includes(tienda)) continue;
      const producto = buscar(tienda, eq.id);
      const cambio = producto?.cambio;
      if (!producto || !cambio || cambio.antesRef <= 0) continue;
      const clave = claveBajada(tienda, producto.id, cambio.dia);
      if (vistasSet.has(clave) || porClave.has(clave)) continue;
      const ahoraRef = precioVigente(producto, hoy).precioRef;
      const bajada = (cambio.antesRef - ahoraRef) / cambio.antesRef;
      // Un poco de margen para que el 5 % justo cuente aunque el redondeo lo deje en 4,9999 %.
      if (bajada * 100 < minimo - 1e-9) continue;
      porClave.set(clave, {
        clave,
        necesidad,
        tienda,
        producto,
        dia: cambio.dia,
        antesRef: cambio.antesRef,
        ahoraRef,
        porcentaje: Math.round(bajada * 100),
      });
    }
  }
  return [...porClave.values()].sort(
    (a, b) =>
      a.ahoraRef / a.antesRef - b.ahoraRef / b.antesRef ||
      a.necesidad.nombre.localeCompare(b.necesidad.nombre, 'es'),
  );
}

const restarDias = (dia: string, n: number) =>
  new Date(Date.parse(`${dia}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

/**
 * Avisos vistos tras añadir `nuevas`: sin repetidos y sin los de hace más de un mes (para
 * entonces su `cambio` ya no está en app.json y no harían falta).
 */
export function anotarVistas(vistas: readonly string[], nuevas: readonly string[], hoy: string) {
  const limite = restarDias(hoy, DIAS_VISTAS);
  return [...new Set([...vistas, ...nuevas])].filter((c) => (c.split(':').at(-1) ?? '') >= limite);
}

/** Lee los avisos vistos guardados; descarta lo que no tiene la forma «tienda:id:AAAA-MM-DD». */
export function leerVistas(guardadas: unknown): string[] {
  return Array.isArray(guardadas)
    ? guardadas.filter(
        (c): c is string => typeof c === 'string' && /^[a-z]+:[^:]+:\d{4}-\d{2}-\d{2}$/.test(c),
      )
    : [];
}
