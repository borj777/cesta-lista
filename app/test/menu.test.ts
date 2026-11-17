import { describe, expect, it } from 'vitest';
import {
  consumoSemanal,
  empezarCompra,
  alternar,
  repartirNecesidades,
  seAcaba,
  terminarCompra,
  tocaComprar,
} from '../src/lista/compra.ts';
import {
  aportesDelMenu,
  comidasDelDia,
  diaDeLaSemana,
  leerMenu,
  menuVacio,
  necesidadesConMenu,
  nombrePlato,
  platosConReceta,
  quitarRecetaDelMenu,
  textoConMenu,
  vecesPorReceta,
  type Menu,
  type PlatoDia,
} from '../src/menu/menu.ts';
import { necesidadParaIngrediente, type Receta } from '../src/menu/recetas.ts';
import { crearNecesidad, type Necesidad } from '../src/necesidades/modelo.ts';
import { planificar } from '../src/optimizador.ts';
import { listaTiendas } from '../src/tiendas/modelo.ts';
import type { ProductoApp } from '../src/tipos.ts';

const AHORA = '2026-11-17T10:00:00.000Z';
const HOY = '2026-11-17';

const arroz = necesidadParaIngrediente('Arroz', 'g', AHORA, 'arroz');
const pollo: Necesidad = {
  ...crearNecesidad(
    { nombre: 'Pollo', categoria: 'alimentacion', cantidad: 1, unidad: 'kg', frecuencia: 'semana' },
    AHORA,
    'pollo',
  ),
};
const aceite: Necesidad = crearNecesidad(
  { nombre: 'Aceite', categoria: 'alimentacion', cantidad: 1, unidad: 'l', frecuencia: 'mes' },
  AHORA,
  'aceite',
);
const tomate = necesidadParaIngrediente('Tomate', 'ud', AHORA, 'tomate');
const receta = (id: string, raciones: number, ingredientes: Receta['ingredientes']): Receta => ({
  id,
  nombre: id,
  raciones,
  ingredientes,
  creada: AHORA,
  actualizada: AHORA,
});
const paella = receta('Paella', 2, [
  { necesidad: 'arroz', cantidad: 160, unidad: 'g' },
  { necesidad: 'pollo', cantidad: 300, unidad: 'g' },
  { necesidad: 'aceite', cantidad: 30, unidad: 'ml' },
]);
const arrozCubana = receta('Arroz a la cubana', 1, [
  { necesidad: 'arroz', cantidad: 80, unidad: 'g' },
]);
const ensalada = receta('Ensalada', 1, [{ necesidad: 'tomate', cantidad: 1, unidad: 'ud' }]);
const necesidades = [arroz, pollo, aceite, tomate];
const plato = (receta: string, comida = 'Comida'): PlatoDia => ({ comida, nombre: '', receta });
/** Para 2 personas: paella el lunes y arroz a la cubana (mitad de ración) martes y jueves. */
const menu: Menu = {
  personas: 2,
  dias: [
    [plato('Paella')],
    [plato('Arroz a la cubana')],
    [],
    [plato('Arroz a la cubana')],
    [],
    [],
    [],
  ],
};
const cubanaMedia: Receta = {
  ...receta('Arroz a la cubana', 2, [{ necesidad: 'arroz', cantidad: 80, unidad: 'g' }]),
};
const aportes = aportesDelMenu(menu, [paella, cubanaMedia, ensalada], necesidades);

describe('menú', () => {
  it('suma lo que gastan los platos de cada ingrediente, en la unidad de su necesidad', () => {
    // Paella para 2 una vez (160 g) + arroz a la cubana para 2, 2 veces (2 × 80 g).
    expect(aportes.get('arroz')?.semanal).toBe(320);
    expect(aportes.get('arroz')?.platos.map((p) => p.receta.nombre)).toEqual([
      'Paella',
      'Arroz a la cubana',
    ]);
    expect(aportes.get('pollo')?.semanal).toBe(0.3); // 300 g → kg
    expect(aportes.get('aceite')?.semanal).toBe(0.03); // 30 ml → l
    expect(aportes.has('tomate')).toBe(false); // la ensalada no está en el menú
  });

  it('las raciones cuentan: la paella para 4 gasta el doble', () => {
    const doble = aportesDelMenu(
      { ...menuVacio(4), dias: [[plato('Paella')], [], [], [], [], [], []] },
      [paella, arrozCubana],
      necesidades,
    );
    expect(doble.get('arroz')?.semanal).toBe(320);
  });

  it('cuenta las veces de cada receta en la semana; los platos sin receta no compran nada', () => {
    const conCafe: Menu = {
      ...menu,
      dias: menu.dias.map((d, i) => (i === 0 ? [{ comida: 'Desayuno', nombre: 'Café' }, ...d] : d)),
    };
    expect([...vecesPorReceta(conCafe)]).toEqual([
      ['Paella', 1],
      ['Arroz a la cubana', 2],
    ]);
    expect(platosConReceta(conCafe)).toBe(3);
    expect(aportesDelMenu(conCafe, [paella, cubanaMedia], necesidades).get('arroz')?.semanal).toBe(
      320,
    );
  });

  it('ordena las comidas del día y enseña el nombre del plato o el de su receta', () => {
    const dia: PlatoDia[] = [
      { comida: 'Cena', nombre: 'Tortilla francesa' },
      { comida: 'Desayuno', nombre: 'Café' },
      { comida: '', nombre: '', receta: 'Paella' },
      { comida: 'cena', nombre: '1 fruta', receta: 'fruta' },
      { comida: 'Snack', nombre: 'Barrita' },
    ];
    expect(comidasDelDia(dia).map((g) => [g.comida, g.platos.map((p) => p.indice)])).toEqual([
      ['Desayuno', [1]],
      ['Cena', [0, 3]],
      ['Snack', [4]],
      ['', [2]],
    ]);
    const porId = new Map([['Paella', paella]]);
    expect(nombrePlato(dia[2] as PlatoDia, porId)).toBe('Paella');
    expect(nombrePlato(dia[3] as PlatoDia, porId)).toBe('1 fruta');
  });

  it('el lunes es el día 0 y el domingo el 6', () => {
    expect(diaDeLaSemana('2026-11-16')).toBe(0); // lunes
    expect(diaDeLaSemana('2026-11-17')).toBe(1);
    expect(diaDeLaSemana('2026-11-22')).toBe(6); // domingo
  });

  it('al borrar una receta, sus platos con nombre se quedan sin comprar y los demás se quitan', () => {
    const m: Menu = {
      personas: 1,
      dias: [
        [{ comida: 'Cena', nombre: '1 fruta', receta: 'fruta' }, plato('fruta')],
        [],
        [],
        [],
        [],
        [],
        [],
      ],
    };
    expect(quitarRecetaDelMenu(m, 'fruta').dias[0]).toEqual([
      { comida: 'Cena', nombre: '1 fruta' },
    ]);
  });

  it('suma el menú a las necesidades y quita las de recetas que no están en el menú', () => {
    const conMenu = necesidadesConMenu(necesidades, aportes);
    expect(conMenu.map((n) => n.id)).toEqual(['arroz', 'pollo', 'aceite']);
    expect(conMenu[0]).toMatchObject({ cantidad: 320, unidad: 'g', frecuencia: 'semana' });
    expect(conMenu[0]).not.toHaveProperty('soloRecetas');
    expect(conMenu[1]).toMatchObject({ cantidad: 1.3, frecuencia: 'semana' });
    // El aceite va al mes: se le suma lo de un mes de menú (0,03 l × 52/12 semanas).
    expect(conMenu[2]?.cantidad).toBeCloseTo(1.13, 6);
    expect(conMenu[2]?.frecuencia).toBe('mes');
  });

  it('lee el menú guardado sin fiarse de lo que haya', () => {
    expect(leerMenu(menu)).toEqual(menu);
    expect(leerMenu(undefined)).toEqual(menuVacio());
    expect(leerMenu({ personas: 99, dias: 'x' })).toEqual(menuVacio());
    const raro = leerMenu({
      personas: 3,
      dias: [
        [
          { comida: 'Cena', nombre: 'Sopa' },
          { comida: 'Cena', nombre: '' },
          'hola',
          { comida: 1, nombre: 'x' },
        ],
        [{ comida: 'Comida', nombre: 'x', receta: '' }],
      ],
    });
    expect(raro).toEqual({
      personas: 3,
      dias: [[{ comida: 'Cena', nombre: 'Sopa' }], [], [], [], [], [], []],
    });
  });

  it('convierte el menú de antes (veces a la semana) repartiendo las veces por los días', () => {
    const antiguo = leerMenu([
      { receta: 'Paella', veces: 1, personas: 2 },
      { receta: 'Paella', veces: 2, personas: 2 },
      { receta: 'Fruta', veces: 3, personas: 2 },
      { receta: 'Sopa', veces: 0, personas: 1 },
      { receta: 'Sopa', veces: 1.5, personas: 1 },
      { receta: 'Crema', veces: 1, personas: 1 },
      'hola',
    ]);
    expect(antiguo.personas).toBe(2);
    expect([...vecesPorReceta(antiguo)]).toEqual([
      ['Paella', 1],
      ['Fruta', 3],
      ['Crema', 1],
    ]);
    // 3 veces: lunes, miércoles y viernes.
    const diasFruta = antiguo.dias.flatMap((d, i) =>
      d.some((p) => p.receta === 'Fruta') ? [i] : [],
    );
    expect(diasFruta).toEqual([0, 2, 4]);
    expect(antiguo.dias[0]?.[0]).toEqual({ comida: '', nombre: '', receta: 'Paella' });
  });

  it('explica cuánto se gasta contando el menú', () => {
    expect(textoConMenu(arroz, aportes.get('arroz'))).toBe('De tu menú: 320 g a la semana');
    expect(textoConMenu(pollo, aportes.get('pollo'))).toBe(
      '1 kg a la semana + 0,3 kg a la semana de tu menú',
    );
    expect(textoConMenu(tomate, undefined)).toBe('Solo para tus recetas (no está en tu menú)');
  });
});

describe('hasta cuándo dura lo comprado', () => {
  const producto = (
    tienda: string,
    id: string,
    precio: number,
    cantidad: number,
    unidad: ProductoApp['formato']['unidad'],
  ): ProductoApp => ({
    tienda,
    id,
    nombre: id,
    formato: { cantidad, unidad },
    precio,
    precioRef: precio / cantidad,
  });
  const catalogo = [
    producto('mercadona', 'arroz-1kg', 1.2, 1, 'kg'),
    producto('mercadona', 'pollo', 3, 0.5, 'kg'),
  ];
  const buscar = (t: string, id: string) => catalogo.find((p) => p.tienda === t && p.id === id);
  const conProductos = [
    { ...arroz, equivalencias: { mercadona: { id: 'arroz-1kg' } } },
    { ...pollo, equivalencias: { mercadona: { id: 'pollo' } } },
  ];
  const conMenu = necesidadesConMenu(conProductos, aportes);
  const tiendas = listaTiendas([], []);
  const plan = planificar(conMenu, buscar, {
    semanas: 1,
    costeVisita: 2,
    hoy: HOY,
    tiendas: tiendas.map((t) => t.id),
  });
  const compra = empezarCompra(plan, tiendas, AHORA);
  if (!compra) throw new Error('Debería haber compra');

  it('calcula lo que se gasta a la semana en kg o litros', () => {
    expect(consumoSemanal(conMenu[0] as Necesidad)).toBe(0.32);
    expect(consumoSemanal(aceite)).toBeCloseTo(12 / 52, 6);
  });

  it('un paquete de 1 kg de arroz para 320 g a la semana dura 21 días', () => {
    expect(compra.lineas.map((l) => [l.necesidad, l.envases, l.duraDias])).toEqual([
      ['arroz', 1, 21],
      ['pollo', 3, 8], // 1,5 kg para 1,3 kg a la semana
    ]);
  });

  it('al terminar apunta hasta cuándo dura, y no vuelve a la lista hasta que se acaba', () => {
    const [compradoArroz] = terminarCompra(alternar(compra, 'arroz'), conProductos, HOY, false);
    expect(compradoArroz).toMatchObject({
      ultimaCompra: HOY,
      despensa: { cantidad: 1, fecha: HOY, lleno: 1 },
    });
    if (!compradoArroz) throw new Error('falta');
    // Con el menú, 320 g a la semana: el kilo se acaba hacia el 08/12.
    const conGasto = { ...compradoArroz, cantidad: 320, frecuencia: 'semana' as const };
    delete (conGasto as Partial<Necesidad>).soloRecetas;
    expect(seAcaba(conGasto)).toBe('2026-12-08');
    expect(tocaComprar(conGasto, '2026-11-24', 1)).toBe(false); // quedan 680 g
    expect(tocaComprar(conGasto, '2026-12-01', 1)).toBe(false); // quedan 360 g: llegan
    expect(tocaComprar(conGasto, '2026-12-08', 1)).toBe(true); // quedan 40 g
    const { tocan, quedan } = repartirNecesidades([conGasto], '2026-11-24', 1, []);
    expect([tocan.length, quedan.length]).toEqual([0, 1]);
  });

  it('lo que se gasta justo en una semana vuelve a la lista la semana siguiente', () => {
    // Compras de antes de la despensa: solo se sabía hasta cuándo duraba.
    const leche = { ...pollo, duraHasta: '2026-11-24' };
    expect(tocaComprar(leche, HOY, 1)).toBe(false);
    expect(tocaComprar(leche, '2026-11-24', 1)).toBe(true);
  });
});
