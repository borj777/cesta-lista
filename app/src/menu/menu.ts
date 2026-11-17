/**
 * Menú de la semana, día a día de lunes a domingo: en cada día, los platos de cada comida
 * (desayuno, comida, cena...) y para cuántas personas. Un plato puede tener receta (se compran
 * sus ingredientes) o ser solo un nombre (un café, «Libre con moderación»), para que el menú
 * enseñe la dieta entera. Con él se calcula cuánto se gasta de cada ingrediente. Funciones puras.
 */
import { SEMANAS, textoCantidad, textoNecesidad, type Necesidad } from '../necesidades/modelo.ts';
import { convertir, type Receta } from './recetas.ts';

export const DIAS_SEMANA = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo',
] as const;

/** Comidas habituales, en el orden del día. */
export const COMIDAS = ['Desayuno', 'Almuerzo', 'Comida', 'Merienda', 'Cena'] as const;

export type PlatoDia = {
  /** «Desayuno», «Comida»...; vacío si no se sabe (menús guardados antes del 18/11/2026). */
  comida: string;
  /** Lo que se enseña: el texto de la dieta («Arroz (70g) con verduras») o el de la receta. */
  nombre: string;
  /** Receta cuyos ingredientes se compran; sin ella, el plato no compra nada. */
  receta?: string;
};

export type Menu = {
  /** Personas que comen cada plato (raciones). */
  personas: number;
  /** Siete días, de lunes a domingo. */
  dias: PlatoDia[][];
};

export const MAX_PERSONAS = 12;
export const MAX_PLATOS_DIA = 30;
const MAX_TEXTO = 300;

export const menuVacio = (personas = 1): Menu => ({
  personas,
  dias: DIAS_SEMANA.map(() => []),
});

const redondear = (n: number) => Math.round(n * 1e6) / 1e6;
const entero = (v: unknown, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= max;
const texto = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;

function leerPlato(valor: unknown): PlatoDia | null {
  if (typeof valor !== 'object' || valor === null) return null;
  const { comida, nombre, receta } = valor as Record<string, unknown>;
  if (!texto(comida, 40) || !texto(nombre, MAX_TEXTO)) return null;
  if (receta !== undefined && (typeof receta !== 'string' || receta === '')) return null;
  if (nombre.trim() === '' && receta === undefined) return null;
  return receta === undefined ? { comida, nombre } : { comida, nombre, receta };
}

/**
 * Menú de antes (una lista de recetas con sus veces a la semana): cada receta se reparte
 * por los días (3 veces → lunes, miércoles y viernes) y se toman las personas más repetidas.
 */
function convertirMenuAntiguo(valor: unknown[]): Menu {
  const menu = menuVacio();
  const pesos = new Map<number, number>();
  const vistas = new Set<string>();
  for (const p of valor) {
    if (typeof p !== 'object' || p === null) continue;
    const { receta, veces, personas } = p as Record<string, unknown>;
    if (typeof receta !== 'string' || receta === '' || vistas.has(receta)) continue;
    if (!entero(veces, 21) || !entero(personas, MAX_PERSONAS)) continue;
    vistas.add(receta);
    pesos.set(personas, (pesos.get(personas) ?? 0) + veces);
    for (let k = 0; k < veces; k++) {
      menu.dias[Math.floor((k * 7) / veces) % 7]?.push({ comida: '', nombre: '', receta });
    }
  }
  const masRepetidas = [...pesos].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
  return { ...menu, personas: masRepetidas?.[0] ?? 1 };
}

/** Lee el menú guardado en los ajustes sin fiarse de lo que haya. */
export function leerMenu(valor: unknown): Menu {
  if (Array.isArray(valor)) return convertirMenuAntiguo(valor);
  if (typeof valor !== 'object' || valor === null) return menuVacio();
  const { personas, dias } = valor as Record<string, unknown>;
  const menu = menuVacio(entero(personas, MAX_PERSONAS) ? personas : 1);
  if (!Array.isArray(dias)) return menu;
  menu.dias = DIAS_SEMANA.map((_, d) => {
    const platos: unknown = dias[d];
    if (!Array.isArray(platos)) return [];
    return platos
      .map(leerPlato)
      .filter((x): x is PlatoDia => x !== null)
      .slice(0, MAX_PLATOS_DIA);
  });
  return menu;
}

/** ¿No hay ningún plato en toda la semana? */
export const menuSinPlatos = (menu: Menu) => menu.dias.every((d) => d.length === 0);

/** Platos de la semana que compran algo (con receta). */
export const platosConReceta = (menu: Menu) =>
  menu.dias.reduce((n, d) => n + d.filter((p) => p.receta).length, 0);

/** Cuántas veces a la semana sale cada receta. */
export function vecesPorReceta(menu: Menu): Map<string, number> {
  const veces = new Map<string, number>();
  for (const p of menu.dias.flat()) {
    if (p.receta) veces.set(p.receta, (veces.get(p.receta) ?? 0) + 1);
  }
  return veces;
}

/** Nombre que se enseña de un plato: el suyo o, si no tiene, el de su receta. */
export function nombrePlato(p: PlatoDia, recetas: ReadonlyMap<string, Receta>): string {
  return p.nombre.trim() || (p.receta ? (recetas.get(p.receta)?.nombre ?? '') : '');
}

/** Posición de una comida para ordenar el día: las habituales en su orden, las demás detrás. */
function ordenComida(comida: string): number {
  const i = (COMIDAS as readonly string[]).findIndex(
    (c) => c.toLowerCase() === comida.trim().toLowerCase(),
  );
  return i >= 0 ? i : comida.trim() === '' ? COMIDAS.length + 1 : COMIDAS.length;
}

export type ComidaDelDia = {
  comida: string;
  platos: { plato: PlatoDia; indice: number }[];
};

/** Los platos de un día agrupados por comida, en el orden del día (desayuno... cena). */
export function comidasDelDia(platos: readonly PlatoDia[]): ComidaDelDia[] {
  const grupos: ComidaDelDia[] = [];
  platos.forEach((plato, indice) => {
    const clave = plato.comida.trim().toLowerCase();
    let grupo = grupos.find((g) => g.comida.trim().toLowerCase() === clave);
    if (!grupo) {
      grupo = { comida: plato.comida.trim(), platos: [] };
      grupos.push(grupo);
    }
    grupo.platos.push({ plato, indice });
  });
  return grupos.sort((a, b) => ordenComida(a.comida) - ordenComida(b.comida));
}

/** Día de la semana de una fecha AAAA-MM-DD: 0 es lunes y 6, domingo. */
export function diaDeLaSemana(fecha: string): number {
  const [a, m, d] = fecha.split('-').map(Number);
  const dia = new Date(Date.UTC(a ?? 2000, (m ?? 1) - 1, d ?? 1)).getUTCDay();
  return (dia + 6) % 7;
}

/** Quita una receta del menú: sus platos se quedan con su nombre o, si no tienen, se quitan. */
export function quitarRecetaDelMenu(menu: Menu, receta: string): Menu {
  return {
    ...menu,
    dias: menu.dias.map((platos) =>
      platos
        .filter((p) => p.receta !== receta || p.nombre.trim() !== '')
        .map((p) => (p.receta === receta ? { comida: p.comida, nombre: p.nombre } : p)),
    ),
  };
}

export type AportePlato = { receta: Receta; veces: number; personas: number; semanal: number };

/** Lo que se gasta de una necesidad a la semana por el menú, en la unidad de la necesidad. */
export type AporteMenu = { semanal: number; platos: AportePlato[] };

/** Cuánto se gasta a la semana de cada necesidad por los platos del menú. */
export function aportesDelMenu(
  menu: Menu,
  recetas: readonly Receta[],
  necesidades: readonly Necesidad[],
): Map<string, AporteMenu> {
  const unidades = new Map(necesidades.map((n) => [n.id, n.unidad]));
  const aportes = new Map<string, AporteMenu>();
  for (const [id, veces] of vecesPorReceta(menu)) {
    const receta = recetas.find((r) => r.id === id);
    if (!receta) continue;
    for (const ing of receta.ingredientes) {
      const unidad = unidades.get(ing.necesidad);
      if (!unidad) continue;
      const porRacion = convertir(ing.cantidad, ing.unidad, unidad) / receta.raciones;
      const semanal = redondear(porRacion * veces * menu.personas);
      const aporte = aportes.get(ing.necesidad) ?? { semanal: 0, platos: [] };
      aporte.semanal = redondear(aporte.semanal + semanal);
      aporte.platos.push({ receta, veces, personas: menu.personas, semanal });
      aportes.set(ing.necesidad, aporte);
    }
  }
  return aportes;
}

/**
 * Necesidades tal como se compran con el menú: a cada una se le suma lo que gastan los platos
 * (en su misma frecuencia), y las que son solo para recetas pasan a ser lo que pide el menú
 * a la semana. Las que son solo para recetas y no están en el menú no se compran.
 */
export function necesidadesConMenu(
  necesidades: readonly Necesidad[],
  aportes: ReadonlyMap<string, AporteMenu>,
): Necesidad[] {
  const resultado: Necesidad[] = [];
  for (const n of necesidades) {
    const aporte = aportes.get(n.id);
    if (!aporte || aporte.semanal <= 0) {
      if (!n.soloRecetas) resultado.push(n);
      continue;
    }
    if (n.soloRecetas) {
      const delMenu: Necesidad = { ...n, cantidad: aporte.semanal, frecuencia: 'semana' };
      delete delMenu.soloRecetas;
      resultado.push(delMenu);
    } else {
      resultado.push({
        ...n,
        cantidad: redondear(n.cantidad + aporte.semanal * SEMANAS[n.frecuencia]),
      });
    }
  }
  return resultado;
}

const redondearTexto = (n: number) => Math.round(n * 10) / 10;

/**
 * Cuánto se gasta, contando el menú: «6 litros a la semana», «De tu menú: 320 g a la semana»,
 * «6 litros a la semana + 400 ml de tu menú» o «Solo para tus recetas (no está en tu menú)».
 */
export function textoConMenu(n: Necesidad, aporte: AporteMenu | undefined): string {
  if (!aporte || aporte.semanal <= 0) {
    return n.soloRecetas ? 'Solo para tus recetas (no está en tu menú)' : textoNecesidad(n);
  }
  const delMenu = textoCantidad(redondearTexto(aporte.semanal), n.unidad);
  return n.soloRecetas
    ? `De tu menú: ${delMenu} a la semana`
    : `${textoNecesidad(n)} + ${delMenu} a la semana de tu menú`;
}
