import { readFileSync } from 'node:fs';
import { getDocument, OPS, Util } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it } from 'vitest';
import {
  leerDieta,
  platosDeTexto,
  resumirDieta,
  type Dieta,
  type Pagina,
} from '../src/menu/dieta/leer.ts';
import { extraerPaginas } from '../src/menu/dieta/pdf.ts';

/** Dieta inventada (test/fixtures/dieta-inventada.html pasada a PDF). */
async function paginasDelPdf(): Promise<Pagina[]> {
  const datos = new Uint8Array(
    readFileSync(new URL('./fixtures/dieta-inventada.pdf', import.meta.url)),
  );
  const carga = getDocument({ data: datos });
  try {
    return await extraerPaginas(await carga.promise, { Util, OPS });
  } finally {
    await carga.destroy();
  }
}

const textos = (platos: { texto: string }[]) => platos.map((p) => p.texto);

describe('lector de la dieta en PDF', () => {
  it('encuentra los días y las comidas de la tabla', async () => {
    const lectura = leerDieta(await paginasDelPdf());
    expect(lectura.tipo).toBe('tabla');
    const dieta = (lectura as { dieta: Dieta }).dieta;
    expect(dieta.dias).toEqual([
      'Lunes',
      'Martes',
      'Miércoles',
      'Jueves',
      'Viernes',
      'Sábado',
      'Domingo',
    ]);
    expect(dieta.filas.map((f) => f.comida)).toEqual([
      'Desayuno',
      'Almuerzo',
      'Comida',
      'Merienda',
      'Cena',
    ]);
  });

  it('las filas de toda la semana son opciones', async () => {
    const { dieta } = leerDieta(await paginasDelPdf()) as { dieta: Dieta };
    const [desayuno, almuerzo, , merienda] = dieta.filas;
    expect(textos(desayuno?.opciones ?? [])).toEqual([
      'Café con leche y tostada de pan integral con tomate',
      'Yogur natural con avena',
    ]);
    expect(textos(almuerzo?.opciones ?? [])).toEqual([
      '1 fruta',
      '1 puñado de frutos secos (20-30g)',
    ]);
    expect(textos(merienda?.opciones ?? [])).toEqual([
      'Yogur natural',
      '1 puñado de frutos secos (20-30g)',
      'Hummus con palitos de zanahoria',
    ]);
  });

  it('une las líneas de cada plato y separa los días', async () => {
    const { dieta } = leerDieta(await paginasDelPdf()) as { dieta: Dieta };
    const comida = dieta.filas[2];
    const cena = dieta.filas[4];
    expect(comida?.opciones).toBeNull();
    expect(comida?.porDia.map(textos)).toEqual([
      ['Arroz (70g) con verduras y gambas', '1 fruta'],
      ['Garbanzos con espinacas y huevo duro', '1 fruta'],
      ['Pollo al horno con patata, pimiento y cebolla', '1 fruta'],
      ['Lentejas estofadas con verduras', '1 fruta'],
      ['Macarrones (60g) con tomate y pavo', '1 fruta'],
      ['Libre con moderación'],
      ['Paella de verduras', '1 fruta'],
    ]);
    expect(cena?.porDia.map(textos)).toEqual([
      ['Crema de calabaza', 'Merluza al horno', '1 fruta'],
      ['Ensalada de lechuga, tomate y atún', 'Tortilla francesa', '1 fruta'],
      ['Crema de calabaza', 'Revuelto de champiñones', '1 fruta'],
      ['Ensalada de lechuga, tomate y atún', 'Salmón a la plancha con limón', '1 fruta'],
      ['Pollo al horno con patata, pimiento y cebolla', '1 fruta'],
      ['Pizza casera de verduras'],
      ['Libre con moderación'],
    ]);
    // Ni la cabecera ni las notas ni el pie se leen como platos.
    const todo = JSON.stringify(dieta);
    expect(todo).not.toMatch(/Inventada|Objetivo|NOTAS|ideas|nutricion@/);
  });

  it('resume la semana: veces de cada plato, opciones y comidas libres', async () => {
    const { dieta } = leerDieta(await paginasDelPdf()) as { dieta: Dieta };
    const resumen = resumirDieta(dieta);
    expect(resumen.platos[0]).toEqual({
      texto: '1 fruta',
      veces: 11,
      cuando: expect.arrayContaining(['Lunes, comida', 'Viernes, cena']) as unknown,
    });
    const veces = Object.fromEntries(resumen.platos.map((p) => [p.texto, p.veces]));
    expect(veces['Crema de calabaza']).toBe(2);
    expect(veces['Pollo al horno con patata, pimiento y cebolla']).toBe(2);
    expect(veces['Paella de verduras']).toBe(1);
    expect(resumen.platos).toHaveLength(14);
    expect(resumen.libres).toEqual(['Sábado, comida', 'Domingo, cena']);
    expect(resumen.opciones.map((o) => o.comida)).toEqual(['Desayuno', 'Almuerzo', 'Merienda']);
  });
});

describe('casos sin tabla', () => {
  it('un PDF sin texto (una foto) se avisa', () => {
    expect(leerDieta([{ textos: [] }])).toEqual({ tipo: 'sin-texto' });
  });

  it('sin tabla de días, devuelve las líneas con viñeta', () => {
    const t = (texto: string, y: number) => ({ texto, x: 50, y, ancho: 100, alto: 10 });
    const lectura = leerDieta([
      {
        textos: [
          t('Mi dieta', 20),
          t('• Lentejas con verduras', 40),
          t('• Pescado al horno', 55),
          t('• Lentejas con verduras', 70),
          t('Libre con moderación', 85),
        ],
      },
    ]);
    expect(lectura).toEqual({
      tipo: 'lineas',
      lineas: ['Lentejas con verduras', 'Pescado al horno'],
    });
  });

  it('cada viñeta empieza un plato y se quitan los encabezados', () => {
    expect(
      textos(
        platosDeTexto(['Opciones:', '• Pollo, 1 patata', 'pequeña al horno.', '\uf0b7 1 fruta']),
      ),
    ).toEqual(['Pollo, 1 patata pequeña al horno', '1 fruta']);
    expect(platosDeTexto(['Libre con', 'moderación'])).toEqual([
      { texto: 'Libre con moderación', libre: true },
    ]);
  });
});

describe('sin las líneas de la tabla', () => {
  it('separa las filas por los huecos entre textos', async () => {
    const paginas = (await paginasDelPdf()).map((p) => ({ textos: p.textos }));
    const lectura = leerDieta(paginas);
    expect(lectura.tipo).toBe('tabla');
    const { dieta } = lectura as { dieta: Dieta };
    expect(dieta.filas.map((f) => (f.opciones ? 'opciones' : 'días'))).toEqual([
      'opciones',
      'opciones',
      'días',
      'opciones',
      'días',
    ]);
    expect(resumirDieta(dieta).platos).toHaveLength(14);
  });
});
