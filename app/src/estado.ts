import type { DatosApp, EstadoTienda, Tienda } from './tipos.ts';

/** Tiendas cuyos precios llegan en app.json (las demás van a mano). */
export const TIENDAS_AUTOMATICAS = ['mercadona', 'consum'] as const satisfies readonly Tienda[];

export const NOMBRE_TIENDA: Record<Tienda, string> = {
  mercadona: 'Mercadona',
  consum: 'Consum',
};

/** A partir de este tiempo, los precios de una tienda se consideran antiguos. */
export const HORAS_ANTIGUEDAD = 36;

const diaMes = new Intl.DateTimeFormat('es-ES', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'Europe/Madrid',
});
const diaMesHora = new Intl.DateTimeFormat('es-ES', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Madrid',
});

/** "17/11" en hora de España. */
export function fechaCorta(iso: string): string {
  return diaMes.format(new Date(iso));
}

/** "17/11, 07:04" en hora de España. */
export function fechaHora(iso: string): string {
  return diaMesHora.format(new Date(iso));
}

const numero = new Intl.NumberFormat('es-ES');
export function miles(n: number): string {
  return numero.format(n);
}

export type Aviso = {
  tienda: Tienda;
  tipo: 'sin-datos' | 'fallida' | 'antigua';
  texto: string;
};

/** Avisos sobre los precios: tienda sin datos, descarga fallida o precios antiguos. */
export function avisosPrecios(datos: DatosApp, ahora: Date): Aviso[] {
  const avisos: Aviso[] = [];
  for (const tienda of TIENDAS_AUTOMATICAS) {
    const nombre = NOMBRE_TIENDA[tienda];
    const estado: EstadoTienda | undefined = datos.tiendas[tienda];
    if (!estado?.actualizado) {
      avisos.push({ tienda, tipo: 'sin-datos', texto: `Todavía no hay precios de ${nombre}.` });
      continue;
    }
    const fecha = fechaCorta(estado.actualizado);
    const horas = (ahora.getTime() - Date.parse(estado.actualizado)) / 3_600_000;
    if (estado.estado === 'fallida') {
      avisos.push({
        tienda,
        tipo: 'fallida',
        texto: `La última descarga de ${nombre} ha fallado: precios de ${nombre} del día ${fecha}.`,
      });
    } else if (horas > HORAS_ANTIGUEDAD) {
      avisos.push({
        tienda,
        tipo: 'antigua',
        texto: `Precios de ${nombre} del día ${fecha}: no se han actualizado desde entonces.`,
      });
    }
  }
  return avisos;
}

export type ResumenTienda = {
  tienda: Tienda;
  nombre: string;
  productos: number;
  actualizado: string | null;
  correcto: boolean;
};

/** Número de productos y fecha de los precios de cada tienda. */
export function resumenTiendas(datos: DatosApp, ahora: Date): ResumenTienda[] {
  const avisos = avisosPrecios(datos, ahora);
  return TIENDAS_AUTOMATICAS.map((tienda) => ({
    tienda,
    nombre: NOMBRE_TIENDA[tienda],
    productos: datos.productos.filter((p) => p.tienda === tienda).length,
    actualizado: datos.tiendas[tienda]?.actualizado ?? null,
    correcto: !avisos.some((a) => a.tienda === tienda),
  }));
}

/** Comprueba que lo descargado tiene la forma de app.json. */
export function esDatosApp(valor: unknown): valor is DatosApp {
  if (typeof valor !== 'object' || valor === null) return false;
  const v = valor as Partial<DatosApp>;
  return (
    typeof v.generado === 'string' &&
    typeof v.tiendas === 'object' &&
    v.tiendas !== null &&
    Array.isArray(v.productos)
  );
}
