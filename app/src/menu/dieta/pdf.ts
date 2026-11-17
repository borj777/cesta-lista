/**
 * Saca el texto de un PDF con su posición, y las líneas horizontales de las tablas, con pdf.js.
 * Todo pasa dentro del dispositivo: el PDF no se envía a ningún sitio ni se guarda. pdf.js pesa
 * unos 540 KB comprimido, así que se descarga solo al usarlo por primera vez (el service worker
 * lo guarda para usarlo sin conexión).
 */
import type { Linea, Pagina, Texto } from './leer.ts';

type Matriz = number[];

type PaginaPdf = {
  getViewport(o: { scale: number }): { transform: Matriz };
  getTextContent(): Promise<{ items: unknown[] }>;
  getOperatorList(): Promise<{ fnArray: number[]; argsArray: unknown[] }>;
  cleanup(): void;
};

type Documento = { numPages: number; getPage(n: number): Promise<PaginaPdf> };

/** Lo que se usa de pdf.js (se pasa para poder probarlo en Node con el mismo código). */
export type Pdfjs = {
  Util: { transform(m1: Matriz, m2: Matriz): Matriz };
  OPS: Record<string, number>;
};

const IDENTIDAD: Matriz = [1, 0, 0, 1, 0, 0];

function aplicar(m: Matriz, x: number, y: number): [number, number] {
  const [a = 1, b = 0, c = 0, d = 1, e = 0, f = 0] = m;
  return [a * x + c * y + e, b * x + d * y + f];
}

/**
 * Altura (de arriba abajo, en puntos) de las líneas horizontales dibujadas en la página: los
 * bordes de las celdas y los bordes de los fondos de color. Sirven para saber dónde acaba cada
 * fila de la tabla aunque el texto de una celda llegue hasta el borde.
 */
function lineasHorizontales(
  operaciones: { fnArray: number[]; argsArray: unknown[] },
  vista: Matriz,
  { Util, OPS }: Pdfjs,
): Linea[] {
  let ctm = IDENTIDAD;
  const pila: Matriz[] = [];
  const lineas: Linea[] = [];
  operaciones.fnArray.forEach((op, i) => {
    const args = operaciones.argsArray[i] as unknown[] | null;
    if (op === OPS.save) pila.push(ctm);
    else if (op === OPS.restore) ctm = pila.pop() ?? IDENTIDAD;
    else if (op === OPS.transform && args) ctm = Util.transform(ctm, args as Matriz);
    else if (op === OPS.paintFormXObjectBegin) {
      pila.push(ctm);
      const matriz = args?.[0];
      if (Array.isArray(matriz) || ArrayBuffer.isView(matriz)) {
        ctm = Util.transform(ctm, Array.from(matriz as ArrayLike<number>));
      }
    } else if (op === OPS.paintFormXObjectEnd) ctm = pila.pop() ?? IDENTIDAD;
    else if (op === OPS.constructPath) {
      const caja = args?.[2] as ArrayLike<number> | null | undefined;
      if (!caja || caja.length < 4) return;
      const m = Util.transform(vista, ctm);
      const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = Array.from(caja);
      const esquinas = [aplicar(m, x0, y0), aplicar(m, x1, y1), aplicar(m, x0, y1)];
      const xs = esquinas.map((p) => p[0]);
      const ys = esquinas.map((p) => p[1]);
      const izquierda = Math.min(...xs);
      const derecha = Math.max(...xs);
      const arriba = Math.min(...ys);
      const abajo = Math.max(...ys);
      if (derecha - izquierda < 20) return;
      if (abajo - arriba < 3) lineas.push({ y: (arriba + abajo) / 2, izquierda, derecha });
      else lineas.push({ y: arriba, izquierda, derecha }, { y: abajo, izquierda, derecha });
    }
  });
  return lineas;
}

/** Páginas del documento con su texto (como mucho las 6 primeras: la dieta va al principio). */
export async function extraerPaginas(documento: Documento, pdfjs: Pdfjs): Promise<Pagina[]> {
  const paginas: Pagina[] = [];
  for (let n = 1; n <= Math.min(documento.numPages, 6); n++) {
    const pagina = await documento.getPage(n);
    const vista = pagina.getViewport({ scale: 1 }).transform;
    const contenido = await pagina.getTextContent();
    const textos: Texto[] = [];
    for (const item of contenido.items) {
      const { str, transform, width } = item as {
        str?: string;
        transform?: Matriz;
        width?: number;
      };
      if (typeof str !== 'string' || !str.trim() || !transform) continue;
      const m = pdfjs.Util.transform(vista, transform);
      const alto = Math.hypot(m[2] ?? 0, m[3] ?? 0);
      textos.push({ texto: str, x: m[4] ?? 0, y: m[5] ?? 0, ancho: width ?? 0, alto });
    }
    let lineas: Linea[] = [];
    try {
      lineas = lineasHorizontales(await pagina.getOperatorList(), vista, pdfjs);
    } catch {
      // Sin líneas se usan los huecos entre textos.
    }
    paginas.push({ textos, lineas });
    pagina.cleanup();
  }
  return paginas;
}

export class ErrorPdf extends Error {}

/** Abre el PDF (pdf.js se carga ahora, no al abrir la app) y devuelve sus páginas. */
export async function leerPdf(datos: ArrayBuffer): Promise<Pagina[]> {
  const [pdfjs, trabajador] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = trabajador.default;
  const carga = pdfjs.getDocument({ data: new Uint8Array(datos) });
  let documento;
  try {
    documento = await carga.promise;
  } catch (e) {
    void carga.destroy();
    const nombre = e instanceof Error ? e.name : '';
    if (nombre === 'PasswordException') throw new ErrorPdf('El PDF tiene contraseña.');
    throw new ErrorPdf('No es un PDF o está dañado.');
  }
  try {
    return await extraerPaginas(documento, pdfjs);
  } finally {
    void carga.destroy();
  }
}
