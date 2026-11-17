/**
 * La compra: qué toca comprar esta vez y la lista fija que se usa en la tienda, con lo que
 * queda en la estantería y lo que ya va en el carro. Funciones puras.
 */
import { SEMANAS, type Necesidad } from '../necesidades/modelo.ts';
import type { Plan } from '../optimizador.ts';
import type { IdTienda, InfoTienda } from '../tiendas/modelo.ts';
import type { ProductoApp } from '../tipos.ts';

const DIA = 86_400_000;
const DIAS_SEMANA = 7;

/** Días entre dos fechas AAAA-MM-DD (de España). */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(hasta) - Date.parse(desde)) / DIA);
}

/** AAAA-MM-DD + días. */
export function sumarDias(fecha: string, dias: number): string {
  return new Date(Date.parse(fecha) + dias * DIA).toISOString().slice(0, 10);
}

/** ¿Dura más que una compra? (p. ej. «al mes» cuando se compra cada semana). */
export function duraMasQueElPeriodo(n: Necesidad, semanasPeriodo: number): boolean {
  return SEMANAS[n.frecuencia] > semanasPeriodo + 1e-9;
}

/** Día en que se acaba lo comprado la última vez (o null si nunca se ha comprado). */
export function seAcaba(n: Necesidad): string | null {
  if (!n.ultimaCompra) return null;
  return sumarDias(n.ultimaCompra, Math.round(SEMANAS[n.frecuencia] * DIAS_SEMANA));
}

/**
 * ¿Hay que comprarla esta vez? Lo que se gasta antes de la siguiente compra, siempre. Lo que
 * dura más (el detergente del mes en una compra semanal) solo si nunca se ha comprado con la
 * app o si se acaba antes de la siguiente compra.
 */
export function tocaComprar(n: Necesidad, hoy: string, semanasPeriodo: number): boolean {
  if (!duraMasQueElPeriodo(n, semanasPeriodo)) return true;
  const fin = seAcaba(n);
  if (!fin) return true;
  const siguienteCompra = sumarDias(hoy, Math.round(semanasPeriodo * DIAS_SEMANA));
  return fin <= siguienteCompra;
}

/** Necesidades de esta compra y las que se dejan fuera porque puede que aún quede. */
export function repartirNecesidades(
  necesidades: Necesidad[],
  hoy: string,
  semanasPeriodo: number,
  adelantadas: readonly string[],
): { tocan: Necesidad[]; quedan: Necesidad[] } {
  const tocan: Necesidad[] = [];
  const quedan: Necesidad[] = [];
  for (const n of necesidades) {
    if (tocaComprar(n, hoy, semanasPeriodo) || adelantadas.includes(n.id)) tocan.push(n);
    else quedan.push(n);
  }
  return { tocan, quedan };
}

/** Una cosa de la lista de la compra, tal como estaba al empezar. */
export type LineaCompra = {
  necesidad: string;
  nombre: string;
  tienda: IdTienda;
  producto: Pick<ProductoApp, 'id' | 'nombre' | 'marca' | 'formato'>;
  envases: number;
  /** Precio de un envase al empezar la compra. */
  precio: number;
  coste: number;
  porEnvase: boolean;
  enCarro: boolean;
};

export type CompraEnCurso = {
  empezada: string;
  /** Tiendas de la compra, en orden, con el nombre y el color que tenían al empezar. */
  tiendas: Pick<InfoTienda, 'id' | 'nombre' | 'color'>[];
  lineas: LineaCompra[];
};

/** Fija la lista de la compra a partir de la combinación elegida. */
export function empezarCompra(
  plan: Plan,
  tiendas: readonly InfoTienda[],
  ahora: string,
): CompraEnCurso | null {
  const mejor = plan.mejor;
  if (!mejor) return null;
  const lineas: LineaCompra[] = [];
  for (const id of mejor.tiendas) {
    for (const c of mejor.compras.filter((x) => x.opcion.tienda === id)) {
      const { producto, envases, precio, coste, porEnvase } = c.opcion;
      const copia: LineaCompra['producto'] = {
        id: producto.id,
        nombre: producto.nombre,
        formato: producto.formato,
      };
      if (producto.marca) copia.marca = producto.marca;
      lineas.push({
        necesidad: c.analisis.necesidad.id,
        nombre: c.analisis.necesidad.nombre,
        tienda: id,
        producto: copia,
        envases,
        precio,
        coste,
        porEnvase,
        enCarro: false,
      });
    }
  }
  return {
    empezada: ahora,
    tiendas: mejor.tiendas.map((id) => {
      const t = tiendas.find((x) => x.id === id);
      return { id, nombre: t?.nombre ?? id, color: t?.color ?? '#5d6d7e' };
    }),
    lineas,
  };
}

/** Pasa una cosa de la estantería al carro, o del carro a la estantería. */
export function alternar(compra: CompraEnCurso, necesidad: string): CompraEnCurso {
  return {
    ...compra,
    lineas: compra.lineas.map((l) =>
      l.necesidad === necesidad ? { ...l, enCarro: !l.enCarro } : l,
    ),
  };
}

const centimos = (n: number) => Math.round(n * 100) / 100;

export type ResumenTienda = {
  tienda: CompraEnCurso['tiendas'][number];
  estanteria: LineaCompra[];
  carro: LineaCompra[];
  total: number;
  enCarro: number;
};

/** Lo de cada tienda: lo que queda en la estantería, lo que va en el carro y los totales. */
export function porTienda(compra: CompraEnCurso): ResumenTienda[] {
  return compra.tiendas.map((tienda) => {
    const suyas = compra.lineas.filter((l) => l.tienda === tienda.id);
    const carro = suyas.filter((l) => l.enCarro);
    return {
      tienda,
      estanteria: suyas.filter((l) => !l.enCarro),
      carro,
      total: centimos(suyas.reduce((s, l) => s + l.coste, 0)),
      enCarro: centimos(carro.reduce((s, l) => s + l.coste, 0)),
    };
  });
}

/**
 * Al terminar, apunta la fecha de compra en lo que va en el carro (y, si se indica, también en
 * lo que quedó en la estantería). Devuelve solo las necesidades que cambian.
 */
export function terminarCompra(
  compra: CompraEnCurso,
  necesidades: Necesidad[],
  hoy: string,
  tambienEstanteria: boolean,
): Necesidad[] {
  const compradas = new Set(
    compra.lineas.filter((l) => l.enCarro || tambienEstanteria).map((l) => l.necesidad),
  );
  return necesidades.filter((n) => compradas.has(n.id)).map((n) => ({ ...n, ultimaCompra: hoy }));
}

const esFecha = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const esNumero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const esObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Lee la compra guardada; si no es válida (copia dañada, versión rara...), devuelve null. */
export function leerCompra(valor: unknown): CompraEnCurso | null {
  if (!esObjeto(valor) || !esFecha(valor.empezada)) return null;
  const { tiendas, lineas } = valor;
  if (!Array.isArray(tiendas) || !Array.isArray(lineas)) return null;
  const tiendasValidas = tiendas.every(
    (t) =>
      esObjeto(t) &&
      typeof t.id === 'string' &&
      typeof t.nombre === 'string' &&
      typeof t.color === 'string',
  );
  const lineasValidas = lineas.every(
    (l) =>
      esObjeto(l) &&
      typeof l.necesidad === 'string' &&
      typeof l.nombre === 'string' &&
      typeof l.tienda === 'string' &&
      esObjeto(l.producto) &&
      typeof l.producto.nombre === 'string' &&
      esObjeto(l.producto.formato) &&
      esNumero(l.producto.formato.cantidad) &&
      esNumero(l.envases) &&
      esNumero(l.precio) &&
      esNumero(l.coste) &&
      typeof l.porEnvase === 'boolean' &&
      typeof l.enCarro === 'boolean',
  );
  return tiendasValidas && lineasValidas ? (valor as CompraEnCurso) : null;
}

/** Lee la lista de necesidades adelantadas guardada en los ajustes. */
export function leerAdelantadas(valor: unknown): string[] {
  return Array.isArray(valor) ? valor.filter((v): v is string => typeof v === 'string') : [];
}
