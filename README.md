# Cesta Lista

Aplicación web para iPhone que compara los precios de **Mercadona, Consum, Lidl** y las tiendas que añadas, y reparte la lista de la compra entre ellas para gastar lo mínimo.

- Se instala desde Safari con «Añadir a pantalla de inicio» y funciona sin conexión.
- Los precios se obtienen de las webs públicas de los supermercados una vez al día, con pausas entre peticiones.
- La dieta, la despensa y las listas se guardan solo en el teléfono. Este repositorio contiene únicamente código y precios públicos.

Es un proyecto personal y sin ánimo de lucro.

## Estado

- **Fase 0 (terminada):** Mercadona y Consum responden desde GitHub Actions.
- **Fase 1 (terminada):** descarga diaria completa de Mercadona y Consum.
- **Fase 2 (terminada):** la app para el iPhone: necesidades, buscador, tiendas propias, cálculo de la compra más barata y lista para ir a comprar.
- **Fase 3 (en marcha):** menú por días, despensa y avisos, y la dieta en automático: la app lee el PDF de la dieta, saca lo que lleva cada plato y elige el producto más barato de cada tienda.

## La app

Está en **https://borj777.github.io/cesta-lista/**. Para instalarla en el iPhone: ábrela en Safari, pulsa **Compartir** y luego **Añadir a pantalla de inicio**. Funciona sin conexión con los últimos precios descargados.

Se publica sola (workflow «Publicar la app») cada vez que se sube un cambio a `main` y cada mañana después de la descarga de precios, siempre que pasen los tests. Tus datos (necesidades, equivalencias, listas) se guardan solo en el iPhone.

### Cómo se usa

1. **Necesidades:** apunta lo que compras, con la cantidad y cada cuánto (por ejemplo, leche semidesnatada, 6 litros a la semana; detergente, 50 lavados al mes).
2. **Qué compras en cada tienda:** pulsa **Elegir por mí** y la app pone el producto de Mercadona y de Consum que menos cuesta para lo que gastas, y lo cambia sola cuando aparece otro más barato. También puedes elegirlo tú con el buscador (entonces queda fijo) o decir «No lo compro aquí». Se compara por precio por kg, litro, unidad o lavado.
3. **Tiendas:** Mercadona y Consum tienen precios automáticos. En Lidl y en las tiendas que añadas (hasta 8, por ejemplo la frutería) apuntas tú los precios mirando el ticket; la app avisa si un precio tiene más de 30 días. Cualquier tienda se puede apagar si no vas nunca.
4. **Lista:** dice a qué tiendas ir, cuánto pagarás y cuánto ahorras frente a comprarlo todo en una sola tienda. En **Ajustes** eliges para cuánto tiempo compras (1 semana, 2 semanas o 1 mes) y cuánto te compensa ir a una tienda más.
5. **Menú y dieta:** en **Menú → Leer el PDF de la dieta**, elige el PDF de tu nutricionista (se lee en el iPhone y no se guarda). Sale **«Tu compra para esta dieta»**: lo que comprarías cada semana con el producto de cada tienda. Quita lo que sobre, di qué es lo que la app no reconozca (lo recordará otros meses) y pulsa **Usar esta compra**: se guardan el menú de lunes a domingo, las recetas y las necesidades. Las cantidades son orientativas cuando la dieta no las indica; se cambian en **Mis recetas**.
6. **Empezar la compra:** en la tienda, toca cada cosa al cogerla de la estantería y pasará al carro. La pantalla no se apaga mientras tanto. Al terminar, la app apunta qué has comprado: lo que dura más que una compra (el detergente del mes en una compra semanal) no vuelve a salir hasta que se vaya a acabar, y mientras tanto aparece en «Puede que aún te quede».

### Copia de seguridad

Tus datos solo están en el iPhone. Haz de vez en cuando **Ajustes → Copia de seguridad → Exportar copia** y guárdala en Archivos o en iCloud. Para recuperarla, en un iPhone nuevo o tras borrar la app, usa **Importar copia**: sustituye todo lo que haya por lo de la copia. Las copias de versiones anteriores de la app se pueden seguir importando.

### Si algo falla

En **Ajustes → Diagnóstico** están la versión de la app, la fecha de los precios guardados, si el modo sin conexión está activo y un resumen de tus datos. Si la app no arranca en 8 segundos, sale un botón **Reparar**, que vuelve a descargarla sin borrar tus datos.

## Precios diarios

Todos los días, a las 7:00 de España, GitHub descarga los catálogos completos de Mercadona (precios de Valencia, código postal 46001) y de Consum y los guarda en la carpeta [`data/`](data/):

| Archivo | Contenido |
|---|---|
| `data/mercadona.json` | Todos los productos de Mercadona, uno por línea |
| `data/consum.json` | Todos los productos de Consum, uno por línea |
| `data/meta.json` | Fecha, número de productos y estado de cada tienda |
| `data/secciones.json` | Nombre de cada sección de cada tienda («Carne > Aves y pollo > Pollo»), por su id |
| `data/app.json` | Versión ligera para la app: solo los campos que usa (sin enlaces ni fotos) y el estado de cada tienda. Unos 2,8 MB, que se descargan comprimidos como unos 500 KB |

Cada producto tiene su sección (`seccion`), su precio y su `precioRef`: el precio por kg, por litro o por unidad, que es el que sirve para comparar entre tiendas. Si está en oferta, `oferta` dice cuál es y `ofertaHasta`, su último día.

La fecha de los precios está en `meta.json` (una por tienda), no en cada producto. Los productos van ordenados por id, uno por línea, así que cada commit diario «Actualiza los precios del DD/MM/AAAA», hecho por `github-actions[bot]`, solo muestra las líneas de los productos que han cambiado. Si no ha cambiado nada, no se crea ningún commit.

### Lanzarlo a mano

**Desde GitHub (lo más fácil):**

1. Abre la pestaña **Actions** del repositorio.
2. En la lista de la izquierda, elige **Precios diarios**.
3. Pulsa **Run workflow** y otra vez **Run workflow** en el desplegable.
4. Tarda unos 8 minutos. Al terminar verás un círculo verde (todo bien) o una cruz roja (algo ha fallado).

**Desde el Mac** (hace falta Node 26):

```bash
cd scraper
npm ci
npm run scrape            # todas las tiendas
npm run scrape -- consum  # solo una tienda
npm run estado            # resumen de data/meta.json
npm run app               # regenera data/app.json sin descargar nada
```

Para respetar las webs, conviene no lanzarlo más de una vez al día. Las ejecuciones automáticas ya lo tienen en cuenta: si ese día ya hay datos, no descargan nada.

### Cómo saber si ha fallado

1. **Correo de GitHub:** si alguna tienda falla, la ejecución termina con una **cruz roja** y GitHub te envía un correo.
2. **Pestaña Actions:** al abrir una ejecución, el resumen indica el estado de cada tienda y el motivo del fallo.
3. **`data/meta.json`:** cada tienda tiene un `estado`:
   - `"ok"`: los precios son del día (`actualizado`).
   - `"fallida"`: algo ha ido mal y **se han conservado los precios del último día bueno**. `motivo` explica qué ha pasado y `actualizado` indica de qué día son los precios guardados.

### Horario y ejecución de reserva

La ejecución está programada a las 7:00 en hora de España (`timezone: 'Europe/Madrid'`), así que sigue siendo a las 7:00 en verano y en invierno. GitHub no garantiza que se ejecuten todos los cron, sobre todo a las horas en punto, así que hay una **reserva a las 9:30**: si a esa hora aún no hay precios del día, los descarga; si ya los hay, termina en verde sin hacer nada. Es normal ver esa segunda ejecución corta cada día.

### Si GitHub desactiva la ejecución diaria

En los repositorios públicos, GitHub desactiva las ejecuciones programadas si pasan **60 días sin actividad** en el repositorio. No aclara si cuentan los commits del robot, así que puede pasar aunque los precios se actualicen cada día. Cómo darse cuenta:

- la app mostrará el aviso «precios de X del día DD/MM» con una fecha antigua;
- en la pestaña **Actions** aparece un aviso amarillo y GitHub suele enviar un correo.

Cómo arreglarlo (un minuto): pestaña **Actions** → **Precios diarios** → botón **Enable workflow**. Mientras se trabaje en la app habrá commits propios a menudo, que muy probablemente cuentan como actividad.

### Cuándo se conservan los datos anteriores

Para no estropear los datos buenos, una tienda se marca como fallida y **no se sobrescriben sus precios** si:

- devuelve 0 productos;
- cambia el formato de sus respuestas (más del 5 % de los productos no se puede leer, o los identificadores ya no coinciden);
- la descarga llega incompleta (menos del 95 % de lo que dice tener la tienda, o un 30 % menos de productos que el último día bueno);
- más del 20 % de los precios varía más de un 50 % de un día para otro;
- Mercadona deja de asignar el almacén de Valencia (`vlc1`) al código postal 46001.

### Otros datos de `meta.json`

- `avisosPrecioRef`: productos cuyo precio por kg, litro o unidad, calculado aquí, no coincide con el que publica la tienda (con un margen del 2 %). Se guardan igualmente; `ejemplosAvisos` enseña algunos para revisarlos.
- `sinVerificar`: productos cuyo `precioRef` no se puede contrastar directamente con el de la tienda: la fruta por piezas de Consum (no indica el peso y se usa su precio por kg), lo vendido a granel, o productos en los que la tienda usa otra unidad (por ejemplo, el fuet: la tienda da el precio por pieza y aquí se calcula por kg; o el detergente: la tienda lo da por litro y aquí por lavado).
- Unidades de `precioRef`: kg, l, ud., `lavado` (detergentes, suavizantes y sus cápsulas) y `m` (aluminio, film). Si se conoce el peso, siempre va por kg.
- `ejemplosDescartados`: lista de los productos que no se han podido leer, para revisarlos.
- `descartados`: productos que no se han podido leer.

## Para desarrollar

```bash
cd scraper
npm ci
npm test         # tests con Vitest (usan respuestas reales guardadas en scraper/fixtures)
npm run check    # tipos, ESLint, Prettier y tests
```

La app:

```bash
cd app
npm ci
npm run dev      # vista previa en http://localhost:5173/cesta-lista/
npm run check    # tipos, ESLint, Prettier y tests
npm run build    # versión para publicar, en app/dist
```

| Carpeta | Contenido |
|---|---|
| `scraper/src/adapters/` | Un adaptador por supermercado |
| `scraper/src/` | Cliente HTTP, normalización, `precioRef`, protección y programa principal |
| `scraper/test/` | Tests |
| `scraper/fixtures/` | Respuestas reales de las tiendas para los tests |
| `app/` | La app (Vite, Preact y TypeScript) |
| `app/src/necesidades/` | Necesidades, buscador y elección de productos |
| `app/src/ingredientes/` | Catálogo de ingredientes y elección automática del producto («Elegir por mí») |
| `app/src/menu/` | Menú por días, recetas y lector del PDF de la dieta (`dieta/`: lectura, recetario y compra automática) |
| `app/src/despensa/` | Lo que queda en casa y avisos |
| `app/src/tiendas/` | Tiendas propias, sus productos y tiendas apagadas |
| `app/src/optimizador.ts` | Cálculo de la combinación de tiendas más barata |
| `app/src/lista/` | Lista de compra, compra en la tienda y pantalla encendida |
| `app/sw/sw.js` | Service worker (funcionamiento sin conexión) |
| `.github/workflows/` | `scrape.yml` (precios diarios), `deploy.yml` (publicar la app), `ci.yml` (tests de las propuestas de cambio) y `fase0.yml` (prueba de acceso) |
