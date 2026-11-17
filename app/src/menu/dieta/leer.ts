/**
 * Lector de la dieta en PDF: entiende una tabla semanal con los días en columnas (lunes a
 * domingo) y las comidas en filas (desayuno, comida, cena...). Las filas que ocupan toda la
 * semana («Opciones: ...») son opciones para cualquier día. Funciones puras: reciben el texto
 * del PDF con su posición (lo saca pdf.js en `pdf.ts`) y no guardan nada.
 *
 * Solo se leen los platos: la cabecera (nombre, objetivo...), las notas y el pie se ignoran.
 */
import { normalizar } from '../../buscador.ts';

/** Un trozo de texto del PDF. Coordenadas en puntos, de arriba abajo y de izquierda a derecha. */
export type Texto = {
  texto: string;
  x: number;
  /** Línea base (la parte de abajo de las letras sin rabito). */
  y: number;
  ancho: number;
  /** Tamaño de la letra. */
  alto: number;
};

/** Línea horizontal dibujada (borde de una celda o de un fondo de color). */
export type Linea = { y: number; izquierda: number; derecha: number };

export type Pagina = {
  textos: Texto[];
  /** Líneas horizontales dibujadas (bordes de la tabla), si se conocen. */
  lineas?: Linea[];
};

export type Plato = {
  texto: string;
  /** «Libre con moderación»: no se compra nada para ella. */
  libre: boolean;
};

export type FilaDieta = {
  /** «Desayuno», «Comida»... tal como viene. */
  comida: string;
  /** Si la fila ocupa toda la semana: las opciones para cualquier día. */
  opciones: Plato[] | null;
  /** Si no: los platos de cada día, en el orden de `Dieta.dias`. */
  porDia: Plato[][];
};

export type Dieta = { dias: string[]; filas: FilaDieta[] };

export type Lectura =
  | { tipo: 'tabla'; dieta: Dieta }
  /** No se ha encontrado la tabla: las líneas con viñeta, para que el usuario elija. */
  | { tipo: 'lineas'; lineas: string[] }
  /** El PDF no tiene texto (una foto o un escaneo). */
  | { tipo: 'sin-texto' };

const DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
const NOMBRE_DIA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const COMIDAS = [
  'desayuno',
  'almuerzo',
  'media manana',
  'comida',
  'merienda',
  'media tarde',
  'cena',
  'recena',
  'tentempie',
  'pre entreno',
  'post entreno',
];
const VINETAS = /^[•·●▪◦‣∙•●-]\s*/;

/** «Miércoles:» → «miercoles». */
const clave = (texto: string) =>
  normalizar(texto)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const arriba = (t: Texto) => t.y - t.alto;
const abajo = (t: Texto) => t.y + t.alto * 0.25;
const centroX = (t: Texto) => t.x + t.ancho / 2;
const limpiar = (texto: string) => texto.replace(/\s+/g, ' ').trim();

/** Agrupa textos en líneas (misma línea base) y las ordena de arriba abajo. */
function lineas(textos: Texto[]): Texto[][] {
  const ordenados = [...textos].sort((a, b) => a.y - b.y || a.x - b.x);
  const resultado: Texto[][] = [];
  for (const t of ordenados) {
    const ultima = resultado.at(-1);
    const base = ultima?.[0];
    if (ultima && base && Math.abs(base.y - t.y) <= Math.max(2, base.alto * 0.3)) ultima.push(t);
    else resultado.push([t]);
  }
  return resultado.map((l) => l.sort((a, b) => a.x - b.x));
}

const textoDeLinea = (linea: Texto[]) => limpiar(linea.map((t) => t.texto).join(' '));

/**
 * Platos de una celda: cada viñeta empieza uno; las líneas sin viñeta siguen el anterior.
 * Se quitan los encabezados como «Opciones:».
 */
export function platosDeTexto(lineasCelda: string[]): Plato[] {
  const platos: string[] = [];
  for (const linea of lineasCelda) {
    const texto = limpiar(linea);
    if (!texto) continue;
    if (VINETAS.test(texto) || platos.length === 0) {
      platos.push(texto.replace(VINETAS, ''));
    } else {
      platos[platos.length - 1] = `${platos.at(-1) ?? ''} ${texto}`;
    }
  }
  return platos
    .map((p) => limpiar(p).replace(/[.;,]+$/, ''))
    .filter((p) => p.length > 0 && !p.endsWith(':'))
    .map((texto) => ({ texto, libre: clave(texto).startsWith('libre') }));
}

/** La fila de los días: la línea con más nombres de día distintos (al menos 5). */
function cabeceraDias(textos: Texto[]): Texto[] | null {
  const candidatos = textos.filter((t) => DIAS.includes(clave(t.texto)));
  let mejor: Texto[] = [];
  for (const linea of lineas(candidatos)) {
    const distintos = new Map<string, Texto>();
    for (const t of linea) distintos.set(clave(t.texto), t);
    if (distintos.size > mejor.length) mejor = [...distintos.values()];
  }
  return mejor.length >= 5 ? mejor.sort((a, b) => a.x - b.x) : null;
}

/** El hueco vertical más grande sin texto entre `desde` y `hasta`, o null. */
function mayorHueco(
  intervalos: [number, number][],
  desde: number,
  hasta: number,
): [number, number] | null {
  let mejor: [number, number] | null = null;
  let fin = -Infinity;
  for (const [a, b] of intervalos) {
    if (fin > -Infinity && a > fin) {
      const centro = (fin + a) / 2;
      if (centro > desde && centro < hasta && (!mejor || a - fin > mejor[1] - mejor[0])) {
        mejor = [fin, a];
      }
    }
    fin = Math.max(fin, b);
  }
  return mejor;
}

/** Une los intervalos [arriba, abajo] que se tocan, ordenados. */
function unir(intervalos: [number, number][]): [number, number][] {
  const ordenados = [...intervalos].sort((p, q) => p[0] - q[0]);
  const resultado: [number, number][] = [];
  for (const [a, b] of ordenados) {
    const ultimo = resultado.at(-1);
    if (ultimo && a <= ultimo[1]) ultimo[1] = Math.max(ultimo[1], b);
    else resultado.push([a, b]);
  }
  return resultado;
}

function leerTabla(pagina: Pagina): Dieta | null {
  const textos = pagina.textos.filter((t) => t.texto.trim());
  const dias = cabeceraDias(textos);
  if (!dias) return null;
  const centros = dias.map(centroX);
  const paso = ((centros.at(-1) ?? 0) - (centros[0] ?? 0)) / Math.max(1, centros.length - 1);
  // Columnas: de la mitad entre un día y el anterior a la mitad entre ese día y el siguiente.
  const bordes = [
    (centros[0] ?? 0) - paso / 2,
    ...centros.slice(1).map((c, i) => (c + (centros[i] ?? 0)) / 2),
    (centros.at(-1) ?? 0) + paso / 2,
  ];
  const izquierda = (bordes[0] ?? 0) - 2;
  const finCabecera = Math.max(...dias.map(abajo));

  // Nombres de las comidas, en la columna de la izquierda y por debajo de los días.
  const columnaIzquierda = textos.filter(
    (t) => t.x + t.ancho <= izquierda + 4 && t.y > finCabecera,
  );
  const etiquetas = lineas(columnaIzquierda)
    .map((l) => ({ linea: l, texto: textoDeLinea(l) }))
    .filter(({ texto }) => COMIDAS.some((c) => clave(texto).startsWith(c)));
  if (etiquetas.length === 0) return null;
  // Lo que acompaña a cada nombre («(opcional)») llega hasta el siguiente nombre.
  const bloques = etiquetas.map((e, i) => {
    const siguiente = etiquetas[i + 1]?.linea[0]?.y ?? Infinity;
    const suyos = columnaIzquierda.filter(
      (t) => t.y >= (e.linea[0]?.y ?? 0) - 1 && t.y < siguiente - 1,
    );
    return {
      comida: limpiar(e.texto.replace(/\(.*$/, '')),
      base: e.linea[0]?.y ?? 0,
      arriba: Math.min(...e.linea.map(arriba)),
      abajo: Math.max(...suyos.map(abajo)),
    };
  });

  // Lo que hay en la tabla, a la derecha de los nombres.
  const contenido = textos.filter((t) => t.x >= izquierda && t.y > finCabecera);
  const intervalos = unir(contenido.map((t): [number, number] => [arriba(t), abajo(t)]));
  // Cada fila empieza en el borde dibujado entre su nombre y el anterior que no corta ningún
  // texto. Si no hay bordes, en el mayor hueco sin texto (y si tampoco, a la mitad).
  const cortes = (y: number) =>
    contenido.filter((t) => t.y - t.alto * 0.7 < y - 0.3 && t.y + t.alto * 0.2 > y + 0.3).length;
  // Bordes que cruzan casi toda la tabla (de lunes a domingo), aunque sea a trozos.
  const anchoTabla = (bordes.at(-1) ?? 0) - (bordes[0] ?? 0);
  // Los trozos de un mismo borde pueden diferir en algo más de un punto: se juntan.
  const grupos: { y: number; tramos: [number, number][] }[] = [];
  for (const l of [...(pagina.lineas ?? [])].sort((a, b) => a.y - b.y)) {
    const desde = Math.max(l.izquierda, bordes[0] ?? 0);
    const hasta = Math.min(l.derecha, bordes.at(-1) ?? 0);
    if (hasta <= desde) continue;
    const ultimo = grupos.at(-1);
    if (ultimo && l.y - ultimo.y <= 1.5) ultimo.tramos.push([desde, hasta]);
    else grupos.push({ y: l.y, tramos: [[desde, hasta]] });
  }
  const lineasTabla = grupos
    .filter((g) => unir(g.tramos).reduce((s, [a, b]) => s + b - a, 0) >= anchoTabla * 0.8)
    .map((g) => g.y);
  const limites: number[] = [finCabecera];
  for (let i = 1; i < bloques.length; i++) {
    const antes = bloques[i - 1];
    const ahora = bloques[i];
    if (!antes || !ahora) continue;
    const borde = lineasTabla
      .filter((y) => y > antes.abajo && y < ahora.base)
      .map((y) => ({ y, cortes: cortes(y) }))
      .sort((a, b) => a.cortes - b.cortes || b.y - a.y)[0];
    if (borde && borde.cortes === 0) {
      limites.push(borde.y);
      continue;
    }
    const hueco = mayorHueco(intervalos, antes.abajo, ahora.arriba);
    limites.push(hueco ? (hueco[0] + hueco[1]) / 2 : (antes.abajo + ahora.arriba) / 2);
  }
  // La tabla acaba en el primer hueco grande después del último nombre (antes de las notas).
  const ultimo = bloques.at(-1);
  const alto =
    contenido.length > 0 ? contenido.reduce((s, t) => s + t.alto, 0) / contenido.length : 10;
  const inicioUltima = limites.at(-1) ?? 0;
  let fin = Infinity;
  for (let i = 1; i < intervalos.length; i++) {
    const antes = intervalos[i - 1]?.[1] ?? 0;
    const despues = intervalos[i]?.[0] ?? 0;
    if (antes > inicioUltima && despues - antes > alto * 1.5 && despues > (ultimo?.abajo ?? 0)) {
      fin = (antes + despues) / 2;
      break;
    }
  }
  limites.push(fin);

  const columna = (t: Texto) => {
    for (let i = 0; i < dias.length; i++) {
      if (t.x < (bordes[i + 1] ?? Infinity) - 1) return i;
    }
    return dias.length - 1;
  };

  const filas: FilaDieta[] = bloques.map((b, i) => {
    const desde = limites[i] ?? 0;
    const hasta = limites[i + 1] ?? Infinity;
    const suyos = contenido.filter((t) => {
      const centro = (arriba(t) + abajo(t)) / 2;
      return centro > desde && centro < hasta;
    });
    // Si nada empieza en las columnas de martes a domingo, la fila es para toda la semana.
    const deTodaLaSemana = suyos.length > 0 && suyos.every((t) => columna(t) === 0);
    const largos = suyos.some((t) => t.x + t.ancho > (bordes[1] ?? Infinity) + 4);
    if (deTodaLaSemana && (largos || suyos.some((t) => clave(t.texto).startsWith('opciones')))) {
      return {
        comida: b.comida,
        opciones: platosDeTexto(lineas(suyos).map(textoDeLinea)),
        porDia: [],
      };
    }
    return {
      comida: b.comida,
      opciones: null,
      porDia: dias.map((_, d) =>
        platosDeTexto(lineas(suyos.filter((t) => columna(t) === d)).map(textoDeLinea)),
      ),
    };
  });

  return {
    dias: dias.map((d) => NOMBRE_DIA[DIAS.indexOf(clave(d.texto))] ?? d.texto),
    filas,
  };
}

/** Lee la dieta: la tabla de la primera página que la tenga o, si no, las líneas con viñeta. */
export function leerDieta(paginas: Pagina[]): Lectura {
  const conTexto = paginas.filter((p) => p.textos.some((t) => t.texto.trim()));
  if (conTexto.length === 0) return { tipo: 'sin-texto' };
  for (const pagina of conTexto) {
    const dieta = leerTabla(pagina);
    if (dieta && dieta.filas.some((f) => f.opciones?.length || f.porDia.some((d) => d.length))) {
      return { tipo: 'tabla', dieta };
    }
  }
  const vistas = new Set<string>();
  const sueltas: string[] = [];
  for (const pagina of conTexto) {
    for (const p of platosDeTexto(
      lineas(pagina.textos)
        .map(textoDeLinea)
        .filter((l) => VINETAS.test(l)),
    )) {
      if (!p.libre && !vistas.has(clave(p.texto))) {
        vistas.add(clave(p.texto));
        sueltas.push(p.texto);
      }
    }
  }
  return { tipo: 'lineas', lineas: sueltas };
}

export type PlatoSemana = {
  texto: string;
  veces: number;
  /** «Lunes, comida», «Jueves, cena». */
  cuando: string[];
};

export type ResumenDieta = {
  /** Platos de los días, de los que más se repiten a los que menos. */
  platos: PlatoSemana[];
  /** Filas para cualquier día: desayuno, merienda... */
  opciones: { comida: string; platos: string[] }[];
  /** «Sábado, comida»: comidas libres. */
  libres: string[];
};

/** Lo que se come en la semana: cada plato con las veces que sale. */
export function resumirDieta(dieta: Dieta): ResumenDieta {
  const platos = new Map<string, PlatoSemana>();
  const libres: { texto: string; dia: number; fila: number }[] = [];
  const opciones: ResumenDieta['opciones'] = [];
  for (const [f, fila] of dieta.filas.entries()) {
    if (fila.opciones) {
      const suyas = fila.opciones.filter((p) => !p.libre).map((p) => p.texto);
      if (suyas.length > 0) opciones.push({ comida: fila.comida, platos: suyas });
      continue;
    }
    fila.porDia.forEach((delDia, d) => {
      const cuando = `${dieta.dias[d] ?? ''}, ${fila.comida.toLowerCase()}`;
      for (const p of delDia) {
        if (p.libre) {
          libres.push({ texto: cuando, dia: d, fila: f });
          continue;
        }
        const k = clave(p.texto);
        const plato = platos.get(k) ?? { texto: p.texto, veces: 0, cuando: [] };
        plato.veces += 1;
        plato.cuando.push(cuando);
        platos.set(k, plato);
      }
    });
  }
  return {
    platos: [...platos.values()].sort(
      (a, b) => b.veces - a.veces || a.texto.localeCompare(b.texto, 'es'),
    ),
    opciones,
    // Por días: «sábado, comida» antes que «domingo, cena».
    libres: libres.sort((a, b) => a.dia - b.dia || a.fila - b.fila).map((l) => l.texto),
  };
}
