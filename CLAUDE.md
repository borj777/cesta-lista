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
- Significado de `bulk_price` (comprobado en la fase 1): precio por kg o litro de `unit_size` cuando `size_format` es kg o l (en los packs, `unit_size` es el total: 6 briks de 1 L = 6); precio por pieza cuando el producto se cuenta en unidades (`reference_format` "ud" o "dc"; las piezas están en `total_units` o en `unit_size`, y en los packs de paquetes se toma el mayor). Los detergentes y suavizantes van por lavado cuando la tienda indica los lavados ("lv" o `unit_name` "lavados") y en las cápsulas de las categorías 226 (detergente y suavizante ropa) y 229 (limpieza vajilla), donde una cápsula es un lavado; su `bulk_price` va por litro, kg, lavado o cápsula; los rollos ("m"), por metro. Los congelados sin `unit_size` usan `drained_weight` (peso neto escurrido), y si hay los dos la tienda usa el total. A granel (`selling_method` 1) `unit_price` no es un precio real y vale `bulk_price` por kg. Los embutidos por pieza (`reference_format` "ud" con `unit_size` en kg) dan `bulk_price` por pieza. Los pañuelos de papel son incoherentes y generan avisos de precioRef.

### Consum: API JSON pública, sin login
- `GET https://tienda.consum.es/api/rest/V1.0/catalog/product?limit=N&offset=M&q=texto` devuelve `totalCount`, `hasMore` y `products[]`.
- Campos útiles: `id`, `code`, `ean`, `productData.name`, `productData.brand.name`, `productData.description` (incluye el formato, p. ej. "1 L"), `productData.imageURL` (da 404: la foto buena es `media[0].url`) y `priceData.prices[]` (el de `id: "PRICE"`; **ojo: `value.centAmount` está en euros, no en céntimos**; `centUnitAmount` es el precio por unidad de referencia). Además, `priceData.unitPriceUnitType` (p. ej. "1 L") y `offers[]`.
- Para el catálogo completo, recorrer con `limit`/`offset` sin `q` o por categorías. Sin `q`, `totalCount` era de 9378 productos el 15/11/2026. El `limit` máximo es 100 (si se pide más, devuelve 100) y el recorrido completo sin `q` devolvió los 9378 productos sin repetidos.
- `OFFER_PRICE` en `priceData.prices[]` es el precio de oferta vigente. `unitPriceUnitType` puede ser "1 Kg", "1 L", "1 U" o "100 Gr" (entonces `centUnitAmount` va por cada 100 g). La fruta suelta («Pieza precio aprox.») no indica el peso.

### Lidl: no hay catálogo de alimentación online
- Solo publica las ofertas semanales en HTML: `https://www.lidl.es/c/store/ofertas-semanales/a10089449` (nombre, precio, precio con Lidl Plus, formato y fechas). No se ha encontrado ninguna API JSON.
- Estrategia: **precios manuales** para los productos habituales de Lidl (editables en la app, con fecha de última actualización) y, en una fase posterior, extracción opcional de las ofertas semanales.

## Arquitectura

```
/scraper            Node 26 LTS + TypeScript. Un adaptador por supermercado.
  /adapters         mercadona.ts, consum.ts, lidl-ofertas.ts (fase 3)
  /fixtures         Respuestas reales guardadas para los tests
/data               Salida pública generada por el scraper
  mercadona.json, consum.json (completos, un producto por línea, ordenados por id)
  meta.json (fecha, estado y avisos de cada fuente)
  app.json (ligero para la PWA: sin url ni imagen, con estado y fecha de cada tienda)
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
  formato: { cantidad: number; unidad: 'kg' | 'l' | 'ud' | 'lavado' | 'm' };
  precio: number;          // € por artículo
  precioRef: number;       // € por kg, l, ud., lavado o m; si se conoce el peso, siempre €/kg
  precioAnterior?: number;
  oferta?: string;         // texto, p. ej. "Ahora más barato"
  ofertaHasta?: string;    // último día de la oferta, AAAA-MM-DD en hora de España
  url?: string;
  imagen?: string;
};
```
La fecha de actualización no va en cada producto: está en `meta.json` (una por tienda), para que cada commit diario solo muestre los productos cuyo precio cambia.

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
**Resultado (15/11/2026, completada):** `scraper/` (Node 26, TypeScript sin compilar) y workflow «Precios diarios» (`scrape.yml`: cron a las 7:00 con `timezone: 'Europe/Madrid'`, que aplica el horario de verano e invierno, y reserva a las 9:30 por si GitHub se salta la primera; las ejecuciones programadas no descargan si ya hay datos del día). En repositorios públicos GitHub desactiva los cron tras 60 días sin «actividad» y no define si cuentan los commits del robot; no se usan trucos para evitarlo (GitHub ha bloqueado herramientas que lo hacían): la app avisa si los precios son antiguos y el README explica cómo reactivarlo. Primera descarga real en GitHub: Mercadona 4345 productos (154 peticiones, 4,4 min) y Consum 9238 (94 peticiones, 2,9 min). Pendiente para más adelante: EAN de Mercadona (requiere una petición por producto).

**Fase 2. PWA básica.** Necesidades, equivalencias, precios manuales de Lidl, optimizador y lista de compra. Instalable y offline, con exportación e importación de copia de seguridad.
Reglas acordadas para la fase 2:
- **Equivalencias por id, nunca por nombre.** Cada equivalencia guarda `tienda` + `id` del producto. En Mercadona hay 273 nombres repetidos (p. ej. 6 «Leche semidesnatada Hacendado» con formatos distintos, del 15/11/2026) y en Consum el nombre no incluye la marca. Si un id desaparece del catálogo, la app lo avisa y pide elegir otro; nunca lo sustituye por otro del mismo nombre.
- **Mostrar siempre el formato** (p. ej. «pack 6 × 1 l», «12 ud.», «250 g») junto al nombre y al precio, en el buscador, en las equivalencias y en la lista, además del `precioRef` con su unidad (€/kg, €/l, €/ud., €/lavado o €/m).
- **Comparar solo precioRef de la misma unidad.** Si las equivalencias de una necesidad tienen unidades distintas (p. ej. un detergente líquido por lavado frente a uno en polvo que solo indica kg), la app no las compara por precioRef: avisa y compara por precio del envase según la cantidad necesaria, o pide elegir otro producto.
- La app descarga solo `data/app.json` (unos 420 KB comprimido). Si una tienda tiene `estado: "fallida"` o su `actualizado` tiene más de 36 horas, muestra el aviso «precios de X del día DD/MM».
- Si se muestra una oferta con `ofertaHasta`, indicar «hasta el DD/MM» y no aplicarla después de esa fecha.
- Se trabaja en 8 pasos; cada uno se publica en https://borj777.github.io/cesta-lista/ y se espera el visto bueno del usuario en su iPhone antes de seguir: 1) esqueleto instalable y offline, 2) necesidades y copia de seguridad, 3) buscador y equivalencias, 4) precios de Lidl, 5) optimizador, 6) otras tiendas (añadido a petición del usuario), 7) lista de compra, 8) repaso final.
- **Paso 1 (16/11/2026, comprobado en el iPhone):** `/app` con Vite, Preact y TypeScript; service worker propio (`app/sw/sw.js`); `deploy.yml` publica en Pages si pasan los tests, en cada push a `main` y tras «Precios diarios». Lección de Safari: en el service worker, **nunca esperar a `cache.put` de una copia antes de responder** (con archivos grandes se bloquea y los precios no salen); guardar la copia con `evento.waitUntil`. Segunda lección (vista en el simulador de iPhone): al instalar el service worker, descargar los archivos con `cache: 'reload'`; si no, guarda la página principal de la caché HTTP (10 minutos en GitHub Pages), que apunta a archivos ya borrados, y la app se queda en blanco. Además, la primera vez que se abre la app instalada los precios no pasan por el service worker, así que se guardan también en su `install`. Las versiones nuevas se activan solas (`skipWaiting`) y, si la app no arranca en 8 s, `index.html` muestra un botón «Reparar».
- Pruebas en el iPhone: hay simulador de Xcode (iPhone Air) para comprobar cada paso antes de pedir el visto bueno. Ajustes tiene una sección «Diagnóstico» para averiguar fallos en el iPhone.
- **Paso 2 (16/11/2026, probado en el simulador):** necesidades en IndexedDB (`app/src/almacen.ts`, base `cesta-lista` con los almacenes `necesidades`, `lidl` y `ajustes`), con unidades kg, g, l, ml, ud, lavado y m y frecuencias semana, quincena y mes. Copia de seguridad en JSON (`app/src/copia.ts`, `version` 1): se comprueba entera antes de importar y la importación es una sola transacción (si falla, no se pierde nada).
- **Paso 3 (16/11/2026, comprobado en el iPhone):** buscador sobre `app.json` (`app/src/buscador.ts`: sin tildes, plurales sencillos, por nombre y marca, ordenado por `precioRef`; aparte los de otra unidad y primero los del mismo EAN que en la otra tienda). Equivalencias guardadas en cada necesidad (`equivalencias: { mercadona?: {id} | {noCompro: true}, ... }`). Fotos en `data/imagenes.json` (aparte, ~184 KB comprimido), guardadas sin conexión al verlas (máx. 400). **Consum: `productData.imageURL` da 404; la foto buena es la primera de `media` («…_001.jpg»).** Las ofertas con `ofertaHasta` pasada no se aplican (`precioVigente`).
- **Paso 4 (16/11/2026, comprobado en el iPhone):** precios de Lidl a mano en el almacén `lidl` (`app/src/lidl/`): producto con nombre, marca, formato (los g y ml se guardan en kg y l), precio, `actualizado` y `creado`. Cambiar solo el nombre no cambia `actualizado`; «Sigue al mismo precio» lo pone a hoy. Aviso si tiene más de 30 días (contados por fechas de España). Se eligen como equivalencia de Lidl por su id, igual que los demás (`aProductoApp` los convierte al formato de app.json), y se pueden añadir desde el buscador de la ficha. Van en la copia de seguridad (sigue siendo `version` 1) y se comprueban al importar. La barra de pestañas se esconde con el teclado abierto.
- **Paso 5 (16/11/2026, comprobado en el iPhone):** optimizador en `app/src/optimizador.ts` (funciones puras). Cantidad del periodo = cantidad × semanas del periodo / semanas de la frecuencia (g y ml a kg y l); coste = envases enteros (redondeo hacia arriba, mínimo 1) × precio vigente. Con otra unidad solo se calcula si la necesidad va por unidades (un envase por unidad); si no, se avisa. Cada necesidad va a la tienda más barata de la combinación (empate: menor precioRef y luego Mercadona, Consum, Lidl); la combinación gana si tiene todo lo que se puede comprar y su total (caja + coste por visita × tiendas extra) es el menor (empate: menos tiendas). Ahorro = caja de la tienda sola más barata que tiene todo − caja de la elegida. Ajustes `periodo` (semana, quincena, mes; por defecto semana) y `costeVisita` (0, 1, 2, 3 o 5 €; por defecto 2) en el almacén `ajustes`. Pendiente para el paso 7: lo que dura más que el periodo (p. ej. detergente al mes en una compra semanal) sale cada semana.
- **Paso 6 (16/11/2026, comprobado en el iPhone):** la pestaña Lidl pasa a ser «Tiendas» (`app/src/tiendas/`). Tiendas propias (como mucho 8, una por color) con nombre, color y productos apuntados a mano; Lidl es una más, con el id `lidl` de siempre, y viene creada. Cualquier tienda se puede apagar (también Mercadona y Consum): el ajuste `tiendasApagadas` guarda sus ids, y lo elegido en ellas se conserva pero no cuenta. IndexedDB versión 2: almacenes `necesidades`, `tiendas`, `productos` (con `tienda`) y `ajustes`; al actualizar, los productos del almacén `lidl` pasan a `productos` con `tienda: 'lidl'` y ese almacén se borra. Borrar una tienda quita en una sola operación sus productos, lo elegido en ella en cada necesidad y su apagado. Equivalencias por id de tienda (cualquier texto). Copia de seguridad `version` 2 (`tiendas` y `productos`); las de la versión 1 se convierten al importar. El optimizador combina solo las tiendas encendidas donde hay algo elegido (2ⁿ − 1 combinaciones, en orden de tamaño y de tienda: Mercadona, Consum y las propias por fecha de creación). Las direcciones `#lidl…` antiguas llevan a `#tiendas/lidl`.
- **Paso 7 (17/11/2026, comprobado en el iPhone):** lista para ir a comprar (`app/src/lista/`). «Empezar la compra» fija la lista (`compra.ts`, `empezarCompra`: copia producto, envases, precio y coste de la combinación elegida) y la guarda en el ajuste `compraEnCurso`, así que va en la copia de seguridad y no se pierde al cerrar la app. En cada tienda, «En la estantería» y «En el carro»: tocar una línea la pasa de un lado a otro. Interruptor «Mantener la pantalla encendida» (Screen Wake Lock, ajuste `pantallaEncendida`, por defecto sí); Safari solo la concede tras tocar la pantalla, así que se vuelve a pedir con cada toque y al volver a la app. «He terminado» apunta `ultimaCompra` (AAAA-MM-DD) en lo que va en el carro y pregunta qué hacer con lo que queda en la estantería (dejarlo para la próxima o darlo por comprado); «Cancelar la compra» no apunta nada. Lo que dura más que el periodo (frecuencia mayor) solo entra si nunca se ha comprado con la app o si se acaba (`ultimaCompra` + su frecuencia) antes de la siguiente compra, y entonces se compra para toda su frecuencia (`cantidadEnPeriodo` usa el máximo de las dos); si no, sale en «Puede que aún te quede», desde donde se puede añadir (ajuste `adelantadas`, se vacía al terminar).
- **Paso 8 (17/11/2026, repaso final, comprobado en el iPhone):** sin conexión (Chrome con un proxy propio que se corta: 21 conexiones bloqueadas y todas las pantallas cargan con los precios guardados), copia de seguridad con compra empezada, fechas de compra y adelantadas (test), 16 pantallas a 320 y 375 px en claro y oscuro sin nada que se salga, textos revisados (plurales y «sus un producto»), lista vacía sin la tarjeta repetida y aviso «Esta vez no hace falta comprar nada». Diagnóstico ampliado: tus datos, datos protegidos frente a borrado (`navigator.storage.persisted`), tiendas apagadas, compra empezada y pantalla encendida disponible. README con uso, copia de seguridad y qué hacer si algo falla. La descarga diaria llega con 55–60 min de retraso sobre la hora programada (normal en GitHub).
**Resultado de la fase 2 (17/11/2026, completada):** los 8 pasos tienen el visto bueno del usuario en su iPhone.
- **Después de la fase 2:** convertir la dieta en necesidades (el usuario lo ha pedido): él apunta las cantidades que le pauta su nutricionista y la app calcula cuánto comprar; o el usuario pasa el PDF en la conversación y se le prepara una copia de seguridad para importar (nunca se guarda en el repositorio). Descartado por el usuario tras explicárselo: leer las calorías de Garmin Connect (sin API gratuita; con usuario y contraseña sería frágil y contra sus normas) y que la app calcule gramos para adelgazar (es una pauta de salud).

**Fase 3. Mejoras.** Dieta semanal convertida en necesidades, ofertas semanales de Lidl, historial de precios y avisos de bajadas.
