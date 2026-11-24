/**
 * La dieta, en automático: qué lleva cada plato (por el recetario y por lo que dice su texto),
 * cuánto se compra a la semana de cada cosa y qué se guarda al usarla (recetas, necesidades y
 * menú). Funciones puras: el usuario solo revisa y corrige.
 */
import { palabras } from '../../buscador.ts';
import {
  elegirPorMi,
  ingredienteDe,
  ingredientePorNombre,
  unidadCompatible,
} from '../../ingredientes/automatico.ts';
import { INGREDIENTES, type Ingrediente } from '../../ingredientes/catalogo.ts';
import { elegirProducto } from '../../ingredientes/elegir.ts';
import type { Necesidad, UnidadNecesidad } from '../../necesidades/modelo.ts';
import type { DatosApp, ProductoApp } from '../../tipos.ts';
import { vecesPorReceta, type Menu } from '../menu.ts';
import { convertir, necesidadParaIngrediente, type Receta } from '../recetas.ts';
import { clavePlato, resumirDieta, type Lectura } from './leer.ts';
import { RECETARIO, type PlatoRecetario } from './recetario.ts';
import {
  colocarEnDias,
  decisionDe,
  gruposDeRevision,
  trozosDelPlato,
  type GrupoRevision,
} from './revision.ts';

/** Ajuste con lo que el usuario dijo que es cada trozo que la app no entendía (o '' = nada). */
export const AJUSTE_APRENDIDOS = 'trozosAprendidos';

const porId = new Map(INGREDIENTES.map((i) => [i.id, i]));

/**
 * Ingredientes que se sustituyen entre sí: si el recetario pone pan y la dieta dice «pan
 * integral», se compra solo el integral.
 */
const FAMILIAS = [
  ['pan', 'pan-integral', 'pan-molde', 'tortillas-trigo'],
  ['arroz', 'arroz-integral'],
  ['pasta', 'pasta-integral', 'fideos'],
  ['leche', 'leche-desnatada', 'leche-entera', 'bebida-avena'],
  ['yogur-natural', 'yogur-griego', 'queso-batido'],
  ['tomate', 'tomate-cherry'],
  ['aceite-oliva', 'aceite-girasol'],
  ['pollo', 'pechuga-pollo'],
  ['queso-rallado', 'mozzarella', 'queso-curado'],
  [
    'menestra',
    'brocoli',
    'coliflor',
    'judia-verde',
    'espinacas',
    'acelgas',
    'calabacin',
    'champinones',
    'esparragos',
    'alcachofa',
  ],
];
const familiaDe = (id: string) => FAMILIAS.find((f) => f.includes(id));

/** Lo que no se compra aparte: hierbas, especias, sal, agua... */
const IGNORAR =
  /^(?:hierbas?(?: aromaticas?| provenzales?)?|especias?|sal|pimienta(?: negra)?|oregano|comino|curry|pimenton|perejil seco|aliño|agua|hielo|edulcorante)$/;

export type IngredienteDelPlato = {
  ingrediente: Ingrediente;
  /** Por ración, en la unidad del ingrediente (kg, l o ud.). */
  cantidad: number;
  /** La cantidad la indica la dieta («Arroz (70g)»). */
  deLaDieta: boolean;
  /** Lo nombra el texto del plato (no solo el recetario). */
  delTexto?: boolean;
};

export type AnalisisPlato = {
  texto: string;
  /** No se compra nada (agua, infusión). */
  nada: boolean;
  ingredientes: IngredienteDelPlato[];
  /** Trozos del texto que la app no sabe qué son. */
  desconocidos: string[];
};

const contieneFrase = (suyas: ReadonlySet<string>, frase: string) => {
  const ps = palabras(frase);
  return ps.length > 0 && ps.every((p) => suyas.has(p));
};

/** Platos del recetario que valen para el texto, sin los que están contenidos en otro. */
export function platosDelRecetario(texto: string): PlatoRecetario[] {
  const suyas = new Set(palabras(texto));
  const validos = RECETARIO.flatMap((r) => {
    if ((r.excepto ?? []).some((e) => contieneFrase(suyas, e))) return [];
    const frase = r.nombres.find((n) => contieneFrase(suyas, n));
    return frase ? [{ r, frase: palabras(frase) }] : [];
  });
  return validos
    .filter(
      (a) =>
        !validos.some(
          (b) =>
            b !== a && b.frase.length > a.frase.length && a.frase.every((p) => b.frase.includes(p)),
        ),
    )
    .map((x) => x.r);
}

/** Pasa la cantidad que dice la dieta a la unidad del ingrediente (70 g → 0,07 kg). */
function cantidadEnIngrediente(
  ingrediente: Ingrediente,
  cantidad: number,
  unidad: UnidadNecesidad,
): number | null {
  if (unidad === 'ud') {
    // «1 fruta», «2 huevos»: piezas; si el ingrediente va por kg, cada pieza es una ración.
    return ingrediente.unidad === 'ud' ? cantidad : cantidad * (ingrediente.racion ?? 0);
  }
  const destino: UnidadNecesidad = ingrediente.unidad;
  try {
    return convertir(cantidad, unidad, destino);
  } catch {
    return null; // «huevo (60 g)»: no se puede pasar de peso a unidades.
  }
}

/**
 * Qué lleva un plato y cuánto por ración. Primero, los platos del recetario que encajan; luego,
 * los trozos del texto («Arroz (70g) con verduras y gambas»): los que indican cantidad mandan;
 * los que no, se añaden con su ración si no estaban. `aprendidos` guarda lo que el usuario dijo
 * de los trozos que la app no entendía (clave del trozo → id del ingrediente, o '' si nada).
 */
export function analizarPlato(
  texto: string,
  aprendidos: Readonly<Record<string, string>> = {},
): AnalisisPlato {
  const recetario = platosDelRecetario(texto);
  const lista = new Map<string, IngredienteDelPlato>();
  const cambia: Record<string, string> = Object.assign({}, ...recetario.map((r) => r.cambia ?? {}));
  for (const r of recetario) {
    for (const [id, cantidad] of r.ingredientes) {
      const ingrediente = porId.get(id);
      if (!ingrediente || lista.has(id)) continue;
      lista.set(id, {
        ingrediente,
        cantidad: cantidad ?? ingrediente.racion ?? 0,
        deLaDieta: false,
      });
    }
  }

  const desconocidos: string[] = [];
  /** El trozo anterior: si encontró ingrediente, las alternativas con «o» que le siguen sobran. */
  let anterior: { encontrado: boolean; desconocido?: string } = { encontrado: false };
  for (const trozo of trozosDelPlato(texto)) {
    const k = clavePlato(trozo.nombre);
    if (IGNORAR.test(k)) continue;
    if (trozo.o && anterior.encontrado) continue;
    if (trozo.o && anterior.desconocido) {
      // «cereales o avena»: si se sabe qué es la alternativa, la primera ya no hace falta.
      const i = desconocidos.lastIndexOf(anterior.desconocido);
      if (i >= 0 && (k in aprendidos || ingredientePorNombre(trozo.nombre)))
        desconocidos.splice(i, 1);
    }
    let ingrediente: Ingrediente | undefined;
    if (k in aprendidos) {
      const id = aprendidos[k];
      if (!id) continue;
      ingrediente = porId.get(id);
    } else {
      ingrediente = ingredientePorNombre(trozo.nombre);
    }
    if (ingrediente && cambia[ingrediente.id])
      ingrediente = porId.get(cambia[ingrediente.id] ?? '');
    if (!ingrediente) {
      // «Lasaña», «Pizza»: el recetario ya dice lo que lleva.
      const suyas = new Set(palabras(trozo.nombre));
      const explicado = recetario.some((r) => r.nombres.some((n) => contieneFrase(suyas, n)));
      if (!explicado) desconocidos.push(trozo.nombre);
      anterior = explicado
        ? { encontrado: true }
        : { encontrado: false, desconocido: trozo.nombre };
      continue;
    }
    anterior = { encontrado: true };
    const indicada =
      trozo.cantidad !== undefined && trozo.unidad
        ? cantidadEnIngrediente(ingrediente, trozo.cantidad, trozo.unidad)
        : null;
    // Si el recetario puso otro de la misma familia (pan y la dieta dice pan integral), se cambia.
    const familia = familiaDe(ingrediente.id);
    let cantidadRecetario: number | undefined;
    for (const [id, i] of lista) {
      if (id !== ingrediente.id && familia?.includes(id) && !i.deLaDieta && !i.delTexto) {
        cantidadRecetario = i.cantidad;
        lista.delete(id);
      }
    }
    if (indicada !== null && indicada > 0) {
      lista.set(ingrediente.id, {
        ingrediente,
        cantidad: indicada,
        deLaDieta: true,
        delTexto: true,
      });
    } else if (cantidadRecetario !== undefined && !lista.has(ingrediente.id)) {
      lista.set(ingrediente.id, {
        ingrediente,
        cantidad: cantidadRecetario,
        deLaDieta: false,
        delTexto: true,
      });
    } else if (lista.has(ingrediente.id)) {
      // Ya lo ponía el recetario: ahora también lo nombra el texto.
      const ya = lista.get(ingrediente.id);
      if (ya) ya.delTexto = true;
    } else {
      // «huevo» en singular es uno; si no, la ración del ingrediente.
      const una = ingrediente.unidad === 'ud' && !/s$/i.test(trozo.nombre.trim());
      lista.set(ingrediente.id, {
        ingrediente,
        cantidad: una ? 1 : (ingrediente.racion ?? 0),
        deLaDieta: false,
        delTexto: true,
      });
    }
  }
  const ingredientes = [...lista.values()].filter((i) => i.cantidad > 0);
  const nada = ingredientes.length === 0 && recetario.some((r) => r.nada);
  return {
    texto,
    nada,
    ingredientes: nada ? [] : ingredientes,
    desconocidos: nada ? [] : desconocidos,
  };
}

/** Nombre corto de un ingrediente para una necesidad nueva: sin lo que va entre paréntesis. */
export const nombreCorto = (i: Ingrediente) => i.nombre.replace(/\s*\(.*?\)\s*/g, ' ').trim();

/** Unidad de la necesidad nueva: g para lo que va por kg y ml para los litros (cantidades de receta). */
const unidadNueva = (i: Ingrediente): UnidadNecesidad =>
  i.unidad === 'kg' ? 'g' : i.unidad === 'l' ? 'ml' : 'ud';

/** La necesidad que ya existe para un ingrediente: la que lo tiene apuntado o la de su nombre. */
export function necesidadDelIngrediente(
  i: Ingrediente,
  necesidades: readonly Necesidad[],
): Necesidad | undefined {
  const compatibles = necesidades.filter((n) => unidadCompatible(i, n));
  return (
    compatibles.find((n) => n.ingrediente === i.id) ??
    compatibles.find((n) => !n.ingrediente && ingredienteDe(n)?.id === i.id)
  );
}

export type Cosa = {
  /** «n:<id de necesidad>» o «i:<id de ingrediente>» (necesidad nueva). */
  clave: string;
  nombre: string;
  ingrediente?: Ingrediente;
  necesidad?: Necesidad;
  /** Lo que se gasta a la semana, en kg, l o ud. */
  semanal: number;
  unidad: 'kg' | 'l' | 'ud';
  /** Platos de los que sale. */
  platos: string[];
};

export type PlanDieta = {
  grupos: GrupoRevision[];
  /** Cada plato distinto, por su clave. */
  platos: Map<string, AnalisisPlato & { receta?: Receta; veces: number }>;
  /** Lo que se compra, de lo que más se gasta a lo que menos (por nombre si empatan). */
  cosas: Cosa[];
  menu: Menu;
};

const unidadBase = (u: UnidadNecesidad): 'kg' | 'l' | 'ud' =>
  u === 'g' || u === 'kg' ? 'kg' : u === 'ml' || u === 'l' ? 'l' : 'ud';

/**
 * Todo lo que sale de la dieta: lo que lleva cada plato (las recetas ya guardadas de otros meses
 * mandan), las veces a la semana y lo que se compra de cada cosa para las personas elegidas.
 * Las opciones de una comida se reparten por días (4 y 3) y las líneas sueltas salen una vez.
 */
export function planDeLaDieta(
  lectura: Lectura,
  contexto: {
    recetas: readonly Receta[];
    necesidades: readonly Necesidad[];
    sinCompra: readonly string[];
    aprendidos: Readonly<Record<string, string>>;
    personas: number;
    /** Cosas que el usuario ha quitado (por su clave). */
    quitadas?: ReadonlySet<string>;
  },
): PlanDieta {
  const grupos = gruposDeRevision(lectura);
  const elegidas: Record<string, number> = {};
  if (lectura.tipo === 'lineas')
    for (const p of grupos.flatMap((g) => g.platos)) elegidas[p.id] = 1;
  const libres = lectura.tipo === 'tabla' ? resumirDieta(lectura.dieta).libresEn : [];

  const platos: PlanDieta['platos'] = new Map();
  for (const p of grupos.flatMap((g) => g.platos)) {
    const k = clavePlato(p.texto);
    if (platos.has(k)) continue;
    const d = decisionDe(p.texto, contexto.recetas, contexto.sinCompra);
    if (d.tipo === 'sin-compra') {
      platos.set(k, { texto: p.texto, nada: true, ingredientes: [], desconocidos: [], veces: 0 });
    } else if (d.tipo === 'receta') {
      platos.set(k, {
        texto: p.texto,
        nada: false,
        ingredientes: [],
        desconocidos: [],
        receta: d.receta,
        veces: 0,
      });
    } else {
      platos.set(k, { ...analizarPlato(p.texto, contexto.aprendidos), veces: 0 });
    }
  }
  // Las veces de cada plato, contando por días como el menú.
  const porPlato = colocarEnDias(
    grupos,
    elegidas,
    (p) => `plato:${clavePlato(p.texto)}`,
    1,
    libres,
  );
  for (const [clave, veces] of vecesPorReceta(porPlato)) {
    const plato = platos.get(clave.slice('plato:'.length));
    if (plato) plato.veces += veces;
  }

  const cosas = new Map<string, Cosa>();
  const sumar = (c: Omit<Cosa, 'semanal' | 'platos'>, semanal: number, plato: string) => {
    if (contexto.quitadas?.has(c.clave)) return;
    const cosa = cosas.get(c.clave) ?? { ...c, semanal: 0, platos: [] };
    cosa.semanal = Math.round((cosa.semanal + semanal) * 1e6) / 1e6;
    if (!cosa.platos.includes(plato)) cosa.platos.push(plato);
    cosas.set(c.clave, cosa);
  };
  const necesidadPorId = new Map(contexto.necesidades.map((n) => [n.id, n]));
  for (const plato of platos.values()) {
    if (plato.veces === 0) continue;
    const raciones = plato.veces * contexto.personas;
    if (plato.receta) {
      for (const ing of plato.receta.ingredientes) {
        const n = necesidadPorId.get(ing.necesidad);
        if (!n) continue;
        const unidad = unidadBase(n.unidad);
        const cantidad = convertir(ing.cantidad, ing.unidad, unidad) / plato.receta.raciones;
        const i = ingredienteDe(n);
        sumar(
          {
            clave: `n:${n.id}`,
            nombre: n.nombre,
            necesidad: n,
            ...(i ? { ingrediente: i } : {}),
            unidad,
          },
          cantidad * raciones,
          plato.texto,
        );
      }
      continue;
    }
    for (const { ingrediente, cantidad } of plato.ingredientes) {
      const n = necesidadDelIngrediente(ingrediente, contexto.necesidades);
      sumar(
        n
          ? {
              clave: `n:${n.id}`,
              nombre: n.nombre,
              necesidad: n,
              ingrediente,
              unidad: ingrediente.unidad,
            }
          : {
              clave: `i:${ingrediente.id}`,
              nombre: nombreCorto(ingrediente),
              ingrediente,
              unidad: ingrediente.unidad,
            },
        cantidad * raciones,
        plato.texto,
      );
    }
  }
  const lista = [...cosas.values()].sort((a, b) =>
    a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }),
  );
  return { grupos, platos, cosas: lista, menu: porPlato };
}

/** El producto que se compraría de una cosa en una tienda: el elegido o el que elegiría la app. */
export function productoDe(
  cosa: Cosa,
  tienda: string,
  datos: Pick<DatosApp, 'productos' | 'secciones'>,
  buscarProducto: (tienda: string, id: string) => ProductoApp | undefined,
  hoy: string,
): ProductoApp | undefined {
  const e = cosa.necesidad?.equivalencias?.[tienda];
  if (e && 'noCompro' in e) return undefined;
  if (e && 'id' in e && !e.auto) return buscarProducto(tienda, e.id);
  if (!cosa.ingrediente) return e && 'id' in e ? buscarProducto(tienda, e.id) : undefined;
  return elegirProducto(cosa.ingrediente, datos, tienda, hoy);
}

export type Cambios = {
  /** Necesidades nuevas o cambiadas (con los productos elegidos por la app). */
  necesidades: Necesidad[];
  recetas: Receta[];
  menu: Menu;
};

/**
 * Lo que se guarda al usar la dieta: una necesidad nueva por cada ingrediente que no existía
 * (solo para recetas, con su ingrediente apuntado y los productos elegidos por la app), una
 * receta por cada plato nuevo (1 ración, con el texto del plato como alias para reconocerlo otros
 * meses) y el menú por días. Las recetas de otros meses no se tocan.
 */
export function cambiosDeLaDieta(
  plan: PlanDieta,
  contexto: {
    necesidades: readonly Necesidad[];
    personas: number;
    quitadas?: ReadonlySet<string>;
    datos: Pick<DatosApp, 'productos' | 'secciones'>;
    hoy: string;
    ahora: string;
    nuevoId: () => string;
  },
): Cambios {
  const { ahora, hoy, datos } = contexto;
  const cambiadas = new Map<string, Necesidad>();
  const nuevas = new Map<string, Necesidad>();
  /** Necesidad de un ingrediente: la que existe o una nueva. */
  const necesidadPara = (i: Ingrediente): Necesidad => {
    const existente = necesidadDelIngrediente(i, contexto.necesidades);
    if (existente) {
      if (!cambiadas.has(existente.id)) {
        // Si le falta el producto de alguna tienda, lo elige la app.
        const r = elegirPorMi(existente, datos, hoy, ahora);
        cambiadas.set(existente.id, r?.necesidad ?? existente);
      }
      return cambiadas.get(existente.id) ?? existente;
    }
    const ya = nuevas.get(i.id);
    if (ya) return ya;
    const base: Necesidad = {
      ...necesidadParaIngrediente(nombreCorto(i), unidadNueva(i), ahora, contexto.nuevoId()),
      ingrediente: i.id,
    };
    const n = elegirPorMi(base, datos, hoy, ahora)?.necesidad ?? base;
    nuevas.set(i.id, n);
    return n;
  };

  const recetaDePlato = new Map<string, string>();
  const recetas: Receta[] = [];
  for (const [clave, plato] of plan.platos) {
    if (plato.receta) {
      recetaDePlato.set(clave, plato.receta.id);
      continue;
    }
    if (plato.nada || plato.veces === 0) continue;
    const ingredientes = plato.ingredientes.flatMap(({ ingrediente, cantidad }) => {
      const existente = necesidadDelIngrediente(ingrediente, contexto.necesidades);
      const claveCosa = existente ? `n:${existente.id}` : `i:${ingrediente.id}`;
      if (contexto.quitadas?.has(claveCosa)) return [];
      const n = necesidadPara(ingrediente);
      return [
        {
          necesidad: n.id,
          cantidad: convertir(cantidad, ingrediente.unidad, n.unidad),
          unidad: n.unidad,
        },
      ];
    });
    if (ingredientes.length === 0) continue;
    const receta: Receta = {
      id: contexto.nuevoId(),
      nombre: plato.texto.length > 80 ? `${plato.texto.slice(0, 79)}…` : plato.texto,
      raciones: 1,
      ingredientes,
      alias: [plato.texto],
      creada: ahora,
      actualizada: ahora,
    };
    recetas.push(receta);
    recetaDePlato.set(clave, receta.id);
  }

  // El menú: cada plato en su día, con su receta si compra algo.
  const menu: Menu = {
    personas: contexto.personas,
    dias: plan.menu.dias.map((platos) =>
      platos.map((p) => {
        const receta = p.receta ? recetaDePlato.get(p.receta.slice('plato:'.length)) : undefined;
        return receta
          ? { comida: p.comida, nombre: p.nombre, receta }
          : { comida: p.comida, nombre: p.nombre };
      }),
    ),
  };
  const necesidades = [
    ...[...cambiadas.values()].filter((n) => n !== contexto.necesidades.find((x) => x.id === n.id)),
    ...nuevas.values(),
  ];
  return { necesidades, recetas, menu };
}
