# Cesta Lista

Aplicación web para iPhone que compara los precios de **Mercadona, Consum y Lidl** y reparte la lista de la compra entre los supermercados para gastar lo mínimo.

- Se instala desde Safari con «Añadir a pantalla de inicio» y funciona sin conexión.
- Los precios se obtienen de las webs públicas de los supermercados una vez al día, con pausas entre peticiones.
- La dieta, la despensa y las listas se guardan solo en el teléfono. Este repositorio contiene únicamente código y precios públicos.

Es un proyecto personal y sin ánimo de lucro.

## Estado

- **Fase 0 (terminada):** Mercadona y Consum responden desde GitHub Actions.
- **Fase 1 (terminada):** descarga diaria completa de Mercadona y Consum.
- Fase 2: la aplicación para el iPhone.

## Precios diarios

Todos los días, a las 7:00 de España, GitHub descarga los catálogos completos de Mercadona (precios de Valencia, código postal 46001) y de Consum y los guarda en la carpeta [`data/`](data/):

| Archivo | Contenido |
|---|---|
| `data/mercadona.json` | Todos los productos de Mercadona, uno por línea |
| `data/consum.json` | Todos los productos de Consum, uno por línea |
| `data/meta.json` | Fecha, número de productos y estado de cada tienda |

Cada producto tiene su precio y su `precioRef`: el precio por kg, por litro o por unidad, que es el que sirve para comparar entre tiendas.

Si nada ha cambiado, no se crea ningún commit. Si cambian precios, aparece un commit «Actualiza los precios del DD/MM/AAAA» hecho por `github-actions[bot]`.

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
```

Para respetar las webs, conviene no lanzarlo más de una vez al día.

### Cómo saber si ha fallado

1. **Correo de GitHub:** si alguna tienda falla, la ejecución termina con una **cruz roja** y GitHub te envía un correo.
2. **Pestaña Actions:** al abrir una ejecución, el resumen indica el estado de cada tienda y el motivo del fallo.
3. **`data/meta.json`:** cada tienda tiene un `estado`:
   - `"ok"`: los precios son del día (`actualizado`).
   - `"fallida"`: algo ha ido mal y **se han conservado los precios del último día bueno**. `motivo` explica qué ha pasado y `actualizado` indica de qué día son los precios guardados.

Es normal ver cada día una segunda ejecución verde que no hace nada: es la otra hora programada (la del horario de verano o de invierno) y se detiene sola.

### Cuándo se conservan los datos anteriores

Para no estropear los datos buenos, una tienda se marca como fallida y **no se sobrescriben sus precios** si:

- devuelve 0 productos;
- cambia el formato de sus respuestas (más del 5 % de los productos no se puede leer, o los identificadores ya no coinciden);
- la descarga llega incompleta (menos del 95 % de lo que dice tener la tienda, o un 30 % menos de productos que el último día bueno);
- más del 20 % de los precios varía más de un 50 % de un día para otro;
- Mercadona deja de asignar el almacén de Valencia (`vlc1`) al código postal 46001.

### Otros datos de `meta.json`

- `avisosPrecioRef`: productos cuyo precio por kg, litro o unidad, calculado aquí, no coincide con el que publica la tienda (con un margen del 2 %). Se guardan igualmente; `ejemplosAvisos` enseña algunos para revisarlos.
- `sinVerificar`: productos cuyo `precioRef` se ha tomado de la tienda sin poder comprobarlo, como la fruta por piezas de Consum, que no indica el peso.
- `descartados`: productos que no se han podido leer.

## Para desarrollar

```bash
cd scraper
npm ci
npm test         # tests con Vitest (usan respuestas reales guardadas en scraper/fixtures)
npm run check    # tipos, ESLint, Prettier y tests
```

| Carpeta | Contenido |
|---|---|
| `scraper/src/adapters/` | Un adaptador por supermercado |
| `scraper/src/` | Cliente HTTP, normalización, `precioRef`, protección y programa principal |
| `scraper/test/` | Tests |
| `scraper/fixtures/` | Respuestas reales de las tiendas para los tests |
| `.github/workflows/` | `scrape.yml` (diario), `ci.yml` (tests) y `fase0.yml` (prueba de acceso) |
