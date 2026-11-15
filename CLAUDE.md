# Cesta Lista — comparador de compra para iPhone

Proyecto personal (Valencia). Una PWA para iPhone que, a partir de la dieta y las necesidades del hogar, compara precios de **Consum, Mercadona y Lidl** y genera una lista de compra repartida entre supermercados para gastar lo mínimo.

Idioma de la interfaz, de los textos y de los mensajes de commit: **español**, sin faltas de ortografía.

## Restricciones no negociables

- **Coste cero.** Nada de cuentas de pago, servidores ni App Store. Alojamiento en GitHub Pages, automatización con GitHub Actions y repositorio público.
- **iPhone primero.** Se instala desde Safari con "Añadir a pantalla de inicio". Tiene que funcionar sin conexión una vez cargada.
- **Datos personales fuera del repositorio.** La dieta, la despensa y las listas se guardan solo en el dispositivo (IndexedDB) y se pueden exportar e importar como copia de seguridad en JSON. El repositorio público solo contiene código y precios públicos.
- **Uso respetuoso de las webs.** Una pasada al día como máximo, peticiones en serie con pausa de 1 a 2 s, reintentos con espera creciente, User-Agent identificable y caché. Es para uso personal.

## Fuentes de precios (comprobadas el 15/11/2026 desde un navegador en una conexión doméstica)

### Mercadona: API JSON pública, sin login
- `GET https://tienda.mercadona.es/api/categories/` devuelve el árbol de categorías.
- `GET https://tienda.mercadona.es/api/categories/{id}/?lang=es&wh=vlc1` devuelve las subcategorías con sus productos.
- Campos útiles: `id`, `display_name`, `packaging`, `thumbnail`, `share_url` y `price_instructions` (`unit_price` = precio del artículo; `bulk_price` = precio por unidad de referencia; `reference_format` = L, kg o ud.; `unit_size`, `size_format`, `previous_unit_price`, `price_decreased`).
- Los precios dependen de la zona o almacén. **Verificado en la fase 0 (15/11/2026):** en la categoría «Fruta», 26 de 43 precios cambian entre `wh=vlc1` y `wh=mad1`, así que basta con añadir `wh=vlc1` a cada petición, sin cookies ni cabeceras. El código postal 46001 corresponde al almacén `vlc1` (`PUT /api/postal-codes/actions/change-pc/` con `{"new_postal_code":"46001"}` lo confirma en la cabecera `x-customer-wh`). Sin `wh` devuelve hoy los precios de `vlc1`, también desde GitHub Actions, pero se indica siempre por si cambia.
- El listado no incluye el EAN, que solo aparece en el detalle de cada producto (`/api/products/{id}/`).

### Consum: API JSON pública, sin login
- `GET https://tienda.consum.es/api/rest/V1.0/catalog/product?limit=N&offset=M&q=texto` devuelve `totalCount`, `hasMore` y `products[]`.
- Campos útiles: `id`, `code`, `ean`, `productData.name`, `productData.brand.name`, `productData.description` (incluye el formato, p. ej. "1 L"), `productData.imageURL` y `priceData.prices[]` (el de `id: "PRICE"`; **ojo: `value.centAmount` está en euros, no en céntimos**; `centUnitAmount` es el precio por unidad de referencia). Además, `priceData.unitPriceUnitType` (p. ej. "1 L") y `offers[]`.
- Para el catálogo completo, recorrer con `limit`/`offset` sin `q` o por categorías. Sin `q`, `totalCount` era de 9378 productos el 15/11/2026. Queda por comprobar en la fase 1 el `limit` máximo que acepta y que el recorrido completo no repite ni pierde productos.

### Lidl: no hay catálogo de alimentación online
- Solo publica las ofertas semanales en HTML: `https://www.lidl.es/c/store/ofertas-semanales/a10089449` (nombre, precio, precio con Lidl Plus, formato y fechas). No se ha encontrado ninguna API JSON.
- Estrategia: **precios manuales** para los productos habituales de Lidl (editables en la app, con fecha de última actualización) y, en una fase posterior, extracción opcional de las ofertas semanales.

## Arquitectura

```
/scraper            Node 26 LTS + TypeScript. Un adaptador por supermercado.
  /adapters         mercadona.ts, consum.ts, lidl-ofertas.ts (fase 3)
  /fixtures         Respuestas reales guardadas para los tests
/data               Salida pública generada por el scraper
  mercadona.json, consum.json, meta.json (fecha y estado de cada fuente)
/app                PWA: Vite + TypeScript + Preact (ligera y sin dependencias pesadas)
  manifest, service worker (offline), IndexedDB
/.github/workflows  scrape.yml (cron diario), deploy.yml (Pages), ci.yml (tests)
```

### Esquema normalizado de producto (común a todas las tiendas)
```ts
type Producto = {
  tienda: 'mercadona' | 'consum' | 'lidl';
  id: string;              // id propio de la tienda
  ean?: string;
  nombre: string;
  marca?: string;
  formato: { cantidad: number; unidad: 'kg' | 'l' | 'ud' };
  precio: number;          // € por artículo
  precioRef: number;       // € por kg, l o ud., calculado y verificado
  precioAnterior?: number;
  oferta?: string;
  url?: string;
  imagen?: string;
  actualizado: string;     // ISO
};
```

### Modelo de la app
- **Necesidad**: lo que hace falta comprar ("pechuga de pollo", 1,5 kg/semana; "detergente", 1 ud./mes). Se genera desde la dieta o se añade a mano.
- **Equivalencias**: para cada necesidad, el usuario confirma una sola vez qué producto concreto de cada tienda le vale (con buscador y sugerencias por nombre, EAN y precio por kg). Se compara siempre por `precioRef`, nunca por precio por envase.
- **Optimizador**: con 3 tiendas hay 7 combinaciones posibles. Para cada una, asigna cada necesidad a la tienda más barata de la combinación y suma un **coste por visita** que configura el usuario (p. ej. 2 € de tiempo y desplazamiento por cada tienda extra). Elige la combinación de menor coste total. Es un cálculo exacto e instantáneo, sin heurísticas.
- **Lista final**: agrupada por tienda, con el total de cada una, el ahorro frente a comprarlo todo en una sola tienda, casillas para marcar y modo pantalla siempre encendida.

## Calidad (cómo se trabaja en este repositorio)

- TypeScript estricto. ESLint y Prettier. Funciones puras para la normalización y el optimizador.
- **Tests con Vitest** obligatorios para los adaptadores (contra las fixtures reales), el cálculo de `precioRef` y el optimizador (casos con empates, productos que no están en todas las tiendas y coste por visita 0 y alto).
- El scraper **valida** cada producto con zod. Si una fuente devuelve 0 productos, cambia de formato o más del 20 % de los precios varía más de un 50 %, **no sobrescribe** los datos buenos: marca la fuente como fallida en `meta.json` y la app muestra el aviso "precios de X del día DD/MM".
- Commits pequeños, en español y con mensajes claros. Cada fase termina con los tests en verde y una demo comprobable en el iPhone.
- Antes de programar algo grande, presentar un plan y esperar el visto bueno.

## Fases

**Fase 0. Validar el acceso desde GitHub (decide la arquitectura).**
Crear el repositorio y un workflow manual que pida una categoría de Mercadona y una búsqueda de Consum y guarde las respuestas como artefacto. Si GitHub Actions es bloqueado, el plan B es ejecutar el scraper en el Mac con `launchd` una vez al día y hacer `git push` de `/data`. Resolver también cómo fijar la zona de Valencia en Mercadona.
**Resultado (15/11/2026, completada):** Mercadona y Consum responden desde GitHub Actions exactamente igual que desde casa, sin bloqueos y con los mismos precios. Se sigue con GitHub Actions; el plan B no hace falta por ahora. La zona se fija con `wh=vlc1`. Prueba: `scraper/fase0/comprobar.sh`, workflow «Fase 0 · Comprobar acceso a los supermercados». Las respuestas están en `scraper/fixtures/`.

**Fase 1. Scraper completo de Mercadona y Consum.** Adaptadores, normalización, validación, tests y cron diario que hace commit de `/data`.

**Fase 2. PWA básica.** Necesidades, equivalencias, precios manuales de Lidl, optimizador y lista de compra. Instalable y offline, con exportación e importación de copia de seguridad.

**Fase 3. Mejoras.** Dieta semanal convertida en necesidades, ofertas semanales de Lidl, historial de precios y avisos de bajadas.
