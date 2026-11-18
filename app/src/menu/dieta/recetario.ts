/**
 * Recetario de platos habituales: lo que lleva un plato aunque su nombre no lo diga («Paella»,
 * «Tortilla de patatas», «Crema de...»). Las cantidades son por ración y en la unidad del
 * ingrediente del catálogo (kg, l o ud.); si faltan, se usa la ración del ingrediente. Son
 * cantidades orientativas de cocina, no una pauta de salud: si la dieta indica una cantidad,
 * manda la dieta, y el usuario puede cambiarlas en la receta.
 *
 * Un plato del recetario vale para un plato de la dieta si este tiene todas las palabras de uno
 * de sus `nombres`. Pueden valer varios a la vez («Crema de calabaza» y «al horno»); si uno
 * contiene a otro («paella de marisco» y «paella»), solo cuenta el más largo.
 */
export type PlatoRecetario = {
  id: string;
  nombres: string[];
  /** [id del ingrediente, cantidad por ración (opcional)]. */
  ingredientes: [string, number?][];
  /** El plato no compra nada (agua, infusión). */
  nada?: true;
  /** Si el plato tiene alguna de estas palabras, no vale («crema de cacahuete» no es una crema). */
  excepto?: string[];
  /**
   * Ingredientes que el texto nombra pero aquí son otra cosa: en «Macarrones con tomate», el
   * tomate es tomate frito.
   */
  cambia?: Record<string, string>;
};

const ACEITE: [string, number] = ['aceite-oliva', 0.01];
const ACEITE_POCO: [string, number] = ['aceite-oliva', 0.005];
const TOMATE_SALSA = { tomate: 'tomate-frito' };

export const RECETARIO: PlatoRecetario[] = [
  // Sin compra
  { id: 'agua', nombres: ['agua'], ingredientes: [], nada: true },
  {
    id: 'infusion',
    nombres: ['infusion', 'te verde', 'manzanilla', 'poleo'],
    ingredientes: [],
    nada: true,
  },
  // Arroces
  {
    id: 'paella',
    nombres: ['paella', 'paella valenciana'],
    ingredientes: [
      ['arroz', 0.08],
      ['pollo', 0.15],
      ['judia-verde', 0.05],
      ['tomate', 0.03],
      ACEITE,
    ],
  },
  {
    id: 'paella-verduras',
    nombres: ['paella verdura', 'arroz verdura'],
    ingredientes: [['arroz', 0.08], ['menestra', 0.15], ['tomate', 0.03], ACEITE],
  },
  {
    id: 'paella-marisco',
    nombres: ['paella marisco', 'arroz marisco', 'arroz banda', 'arroz negro'],
    ingredientes: [['arroz', 0.08], ['gambas', 0.08], ['calamar', 0.08], ['tomate', 0.03], ACEITE],
  },
  {
    id: 'arroz-cubana',
    nombres: ['arroz cubana'],
    ingredientes: [['arroz', 0.08], ['tomate-frito', 0.05], ['huevos', 1], ACEITE],
  },
  {
    id: 'arroz-horno',
    nombres: ['arroz horno'],
    ingredientes: [
      ['arroz', 0.08],
      ['garbanzos', 0.06],
      ['patata', 0.07],
      ['tomate', 0.05],
      ACEITE,
    ],
  },
  {
    id: 'risotto',
    nombres: ['risotto'],
    ingredientes: [
      ['arroz', 0.08],
      ['champinones', 0.08],
      ['cebolla', 0.03],
      ['queso-rallado', 0.015],
      ACEITE,
    ],
  },
  // Legumbres y guisos
  {
    id: 'lentejas',
    nombres: ['lenteja'],
    ingredientes: [
      ['lentejas', 0.2],
      ['zanahoria', 0.04],
      ['cebolla', 0.03],
      ['patata', 0.05],
      ACEITE,
    ],
  },
  {
    id: 'garbanzos-guiso',
    nombres: ['garbanzos estofados', 'potaje', 'cocido madrileño', 'puchero'],
    ingredientes: [
      ['garbanzos', 0.2],
      ['patata', 0.06],
      ['zanahoria', 0.04],
      ['cebolla', 0.03],
      ACEITE,
    ],
  },
  {
    id: 'fabada',
    nombres: ['fabada', 'alubias estofadas', 'alubias guisadas'],
    ingredientes: [['alubias', 0.2], ['cebolla', 0.03], ['pimiento', 0.03], ACEITE],
  },
  // Pasta
  {
    id: 'pasta-tomate',
    nombres: [
      'macarrones tomate',
      'espaguetis tomate',
      'spaghetti tomate',
      'pasta tomate',
      'tallarines tomate',
    ],
    ingredientes: [
      ['pasta', 0.08],
      ['tomate-frito', 0.06],
      ['queso-rallado', 0.01],
    ],
    cambia: TOMATE_SALSA,
  },
  {
    id: 'bolonesa',
    nombres: ['bolonesa', 'boloñesa'],
    ingredientes: [
      ['pasta', 0.08],
      ['carne-picada', 0.1],
      ['tomate-frito', 0.06],
      ['cebolla', 0.03],
      ACEITE_POCO,
    ],
    cambia: TOMATE_SALSA,
  },
  {
    id: 'lasana',
    nombres: ['lasaña', 'canelones'],
    ingredientes: [
      ['pasta', 0.06],
      ['carne-picada', 0.1],
      ['tomate-frito', 0.05],
      ['queso-rallado', 0.02],
      ['cebolla', 0.03],
      ['leche', 0.1],
      ['harina', 0.01],
    ],
    cambia: TOMATE_SALSA,
  },
  {
    id: 'sopa-fideos',
    nombres: ['sopa fideo', 'fideos caldo'],
    ingredientes: [
      ['fideos', 0.03],
      ['caldo', 0.3],
    ],
  },
  {
    id: 'fideua',
    nombres: ['fideua'],
    ingredientes: [['fideos', 0.08], ['gambas', 0.06], ['calamar', 0.06], ACEITE],
  },
  // Huevos
  {
    id: 'tortilla-patatas',
    nombres: ['tortilla patata', 'tortilla española'],
    excepto: ['trigo', 'maiz'],
    ingredientes: [
      ['huevos', 2],
      ['patata', 0.15],
      ['cebolla', 0.03],
      ['aceite-oliva', 0.02],
    ],
  },
  {
    id: 'tortilla-francesa',
    nombres: ['tortilla francesa'],
    excepto: ['trigo', 'maiz'],
    ingredientes: [['huevos', 2], ACEITE_POCO],
  },
  {
    id: 'tortilla',
    nombres: ['tortilla'],
    excepto: ['trigo', 'maiz'],
    ingredientes: [['huevos', 2], ACEITE_POCO],
  },
  {
    id: 'revuelto',
    nombres: ['revuelto', 'huevos revueltos'],
    ingredientes: [['huevos', 2], ACEITE_POCO],
  },
  // Cremas, sopas y verduras
  {
    id: 'crema',
    nombres: ['crema', 'pure'],
    excepto: ['cacahuete', 'cacao', 'avellana', 'queso', 'catalana', 'nata'],
    ingredientes: [['patata', 0.05], ['cebolla', 0.03], ACEITE_POCO],
  },
  {
    id: 'gazpacho',
    nombres: ['gazpacho', 'salmorejo'],
    ingredientes: [['tomate', 0.25], ['pepino', 0.05], ['pimiento', 0.03], ['pan', 0.02], ACEITE],
  },
  {
    id: 'pisto',
    nombres: ['pisto', 'samfaina'],
    ingredientes: [
      ['calabacin', 0.1],
      ['pimiento', 0.06],
      ['cebolla', 0.04],
      ['tomate-triturado', 0.08],
      ['berenjena', 0.08],
      ACEITE,
    ],
  },
  {
    id: 'judias-patata',
    nombres: ['judia verde patata', 'judias verdes patata'],
    ingredientes: [['judia-verde', 0.2], ['patata', 0.1], ACEITE_POCO],
  },
  { id: 'wok', nombres: ['wok', 'salteado'], ingredientes: [['menestra', 0.2], ACEITE_POCO] },
  // Ensaladas
  {
    id: 'ensalada-mixta',
    nombres: ['ensalada mixta'],
    ingredientes: [
      ['lechuga', 0.08],
      ['tomate', 0.1],
      ['cebolla', 0.02],
      ['atun', 0.05],
      ['huevos', 1],
      ACEITE,
    ],
  },
  { id: 'ensalada', nombres: ['ensalada'], ingredientes: [['lechuga', 0.08], ACEITE] },
  {
    id: 'ensaladilla',
    nombres: ['ensaladilla'],
    ingredientes: [
      ['patata', 0.15],
      ['zanahoria', 0.03],
      ['guisantes', 0.03],
      ['atun', 0.04],
      ['huevos', 1],
    ],
  },
  // Carne y pescado
  {
    id: 'albondigas',
    nombres: ['albondiga'],
    ingredientes: [
      ['carne-picada', 0.12],
      ['tomate-frito', 0.05],
      ['cebolla', 0.03],
      ['pan-rallado', 0.01],
      ['huevos', 0.5],
      ACEITE,
    ],
  },
  { id: 'hamburguesa', nombres: ['hamburguesa'], ingredientes: [['hamburguesa', 0.15]] },
  {
    id: 'fajitas',
    nombres: ['fajita', 'burrito', 'wrap'],
    ingredientes: [
      ['tortillas-trigo', 0.06],
      ['pechuga-pollo', 0.1],
      ['pimiento', 0.05],
      ['cebolla', 0.03],
      ACEITE_POCO,
    ],
  },
  { id: 'horno', nombres: ['horno'], ingredientes: [ACEITE] },
  { id: 'plancha', nombres: ['plancha', 'parrilla', 'brasa'], ingredientes: [ACEITE_POCO] },
  // Panes y desayunos
  {
    id: 'pizza',
    nombres: ['pizza'],
    ingredientes: [['harina', 0.08], ['tomate-frito', 0.04], ['mozzarella', 0.06], ACEITE_POCO],
    cambia: TOMATE_SALSA,
  },
  {
    id: 'tostada-tomate',
    nombres: ['tostada tomate', 'pan tomate'],
    ingredientes: [['pan', 0.06], ['tomate', 0.05], ACEITE_POCO],
  },
  { id: 'tostada', nombres: ['tostada'], ingredientes: [['pan', 0.06]] },
  { id: 'sandwich', nombres: ['sandwich', 'sándwich'], ingredientes: [['pan-molde', 0.06]] },
  { id: 'bocadillo', nombres: ['bocadillo'], ingredientes: [['pan', 0.1]] },
  {
    id: 'cafe-leche',
    nombres: ['cafe leche'],
    ingredientes: [
      ['cafe', 0.007],
      ['leche', 0.15],
    ],
  },
  {
    id: 'porridge',
    nombres: ['porridge', 'gachas'],
    ingredientes: [
      ['avena', 0.04],
      ['leche', 0.2],
    ],
  },
];
