#!/usr/bin/env bash
# Fase 0: comprueba si las API públicas de Mercadona y Consum responden
# desde la máquina donde se ejecuta (el Mac o GitHub Actions).
#
# Uso: bash scraper/fase0/comprobar.sh [carpeta_de_salida]
#
# Hace 7 peticiones en serie, con 2 s de pausa entre ellas, y deja en la carpeta:
#   <nombre>.json        la respuesta tal cual llega
#   <nombre>.cabeceras   las cabeceras HTTP de la respuesta
#   resumen.md           un resumen legible en español
#
# Termina con error si alguna de las dos tiendas no devuelve datos válidos.
# Compatible con el bash 3.2 del Mac y con el de Ubuntu (GitHub Actions).

SALIDA="${1:-respuestas}"
mkdir -p "$SALIDA"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

UA="CestaLista/0.1 (uso personal; +https://github.com/borj777/cesta-lista)"
MERCADONA="https://tienda.mercadona.es/api"
CONSUM="https://tienda.consum.es/api/rest/V1.0/catalog/product"
PAUSA=2
PRIMERA=1
FALLO_MERCADONA=0
FALLO_CONSUM=0
FILAS="$TMP/filas.md"
: > "$FILAS"

# pedir NOMBRE URL [argumentos extra de curl]
# Guarda la respuesta y deja en ESTADO el código HTTP y en ES_JSON 1 o 0.
# curl --retry reintenta los fallos pasajeros esperando cada vez más (1 s, 2 s).
pedir() {
  local nombre="$1" url="$2"
  shift 2
  if [ "$PRIMERA" -eq 0 ]; then sleep "$PAUSA"; fi
  PRIMERA=0

  local cuerpo="$SALIDA/$nombre.json"
  local datos
  datos=$(curl -sS --compressed --max-time 30 --retry 2 \
    -A "$UA" \
    -H "Accept: application/json" \
    -H "Accept-Language: es-ES,es;q=0.9" \
    -o "$cuerpo" -D "$SALIDA/$nombre.cabeceras" \
    -w '%{http_code} %{time_total} %{size_download}' \
    "$@" "$url" 2>"$TMP/error") || true

  ESTADO=$(echo "$datos" | awk '{print $1}')
  [ -z "$ESTADO" ] && ESTADO="000"
  local tiempo tamano nota icono
  tiempo=$(echo "$datos" | awk '{printf "%.1f", $2}')
  tamano=$(echo "$datos" | awk '{printf "%.0f", $3 / 1024}')

  if jq -e . "$cuerpo" >/dev/null 2>&1; then ES_JSON=1; else ES_JSON=0; fi

  if [ "$ESTADO" = "000" ]; then
    icono="❌"; nota="Sin conexión: $(head -c 120 "$TMP/error" | tr '\n|' '  ')"
  elif [ "${ESTADO:0:1}" = "2" ] && [ "$ES_JSON" -eq 1 ]; then
    icono="✅"; nota="Datos JSON válidos"
  elif [ "${ESTADO:0:1}" = "2" ]; then
    icono="⚠️"; nota="Responde, pero no son datos JSON"
  elif [ "$ESTADO" = "403" ] || [ "$ESTADO" = "429" ]; then
    icono="❌"; nota="Posible bloqueo (código $ESTADO)"
  else
    icono="❌"; nota="Error (código $ESTADO)"
  fi

  echo "| \`$nombre\` | $icono $ESTADO | $tiempo s | $tamano KB | $nota |" >> "$FILAS"
}

# Lista ordenada "id precio" de los productos de una categoría de Mercadona.
precios_mercadona() {
  jq -r '.categories[]?.products[]? | "\(.id) \(.price_instructions.unit_price)"' "$1" 2>/dev/null | sort > "$2"
}

# Compara dos listas: precios distintos entre los productos comunes y
# productos que solo aparecen en una de las dos.
comparar() {
  local comunes distintos sueltos
  comunes=$(join "$1" "$2" | wc -l | tr -d ' ')
  distintos=$(join "$1" "$2" | awk '$2 != $3' | wc -l | tr -d ' ')
  sueltos=$(join -v1 -v2 "$1" "$2" | wc -l | tr -d ' ')
  echo "**$distintos de $comunes** productos comunes con precio distinto; **$sueltos** solo están en una de las dos"
}

# ---------- Mercadona ----------

CONCL_MERCADONA=""
CONCL_ZONA=""

pedir mercadona-categorias "$MERCADONA/categories/?lang=es&wh=vlc1"
# Categoría de prueba: «Fruta», porque es donde más pueden variar los precios
# según la zona. Si no existe, la primera subcategoría.
ELEGIDA='([.results[]?.categories[]? | select(.name == "Fruta")][0] // .results[0].categories[0])'
CAT_ID=$(jq -r "$ELEGIDA.id // empty" "$SALIDA/mercadona-categorias.json" 2>/dev/null)
CAT_NOMBRE=$(jq -r "$ELEGIDA.name // empty" "$SALIDA/mercadona-categorias.json" 2>/dev/null)
NUM_CATS=$(jq -r '[.results[]?.categories[]?] | length' "$SALIDA/mercadona-categorias.json" 2>/dev/null)

if [ -z "$CAT_ID" ]; then
  FALLO_MERCADONA=1
  CONCL_MERCADONA="❌ **No responde con datos válidos** (código $ESTADO). No se han hecho las demás pruebas de Mercadona."
else
  pedir mercadona-categoria-vlc1 "$MERCADONA/categories/$CAT_ID/?lang=es&wh=vlc1"
  pedir mercadona-categoria-mad1 "$MERCADONA/categories/$CAT_ID/?lang=es&wh=mad1"
  pedir mercadona-categoria-sin-wh "$MERCADONA/categories/$CAT_ID/?lang=es"
  pedir mercadona-codigo-postal "$MERCADONA/postal-codes/actions/change-pc/" \
    -X PUT -H "Content-Type: application/json" --data '{"new_postal_code":"46001"}'
  ESTADO_CP="$ESTADO"
  WH_CP=$(grep -i '^x-customer-wh:' "$SALIDA/mercadona-codigo-postal.cabeceras" 2>/dev/null | tail -1 | cut -d: -f2 | tr -d ' \r')

  precios_mercadona "$SALIDA/mercadona-categoria-vlc1.json" "$TMP/vlc1"
  precios_mercadona "$SALIDA/mercadona-categoria-mad1.json" "$TMP/mad1"
  precios_mercadona "$SALIDA/mercadona-categoria-sin-wh.json" "$TMP/sinwh"
  N_VLC1=$(wc -l < "$TMP/vlc1" | tr -d ' ')

  if [ "$N_VLC1" -eq 0 ]; then
    FALLO_MERCADONA=1
    CONCL_MERCADONA="⚠️ Responde a la lista de categorías ($NUM_CATS), pero la categoría «$CAT_NOMBRE» llega sin productos."
  else
    CONCL_MERCADONA="✅ **Responde.** $NUM_CATS categorías. La categoría de prueba, «$CAT_NOMBRE», tiene $N_VLC1 productos con precio."
    DIF_MAD1=$(comparar "$TMP/vlc1" "$TMP/mad1")
    DIF_SINWH=$(comparar "$TMP/vlc1" "$TMP/sinwh")
    CONCL_ZONA="- Valencia (\`wh=vlc1\`) frente a Madrid (\`wh=mad1\`): $DIF_MAD1."
    CONCL_ZONA="$CONCL_ZONA
- Valencia (\`wh=vlc1\`) frente a no indicar zona: $DIF_SINWH."
    if [ -n "$WH_CP" ]; then
      CONCL_ZONA="$CONCL_ZONA
- Al fijar el código postal 46001, Mercadona asigna el almacén **\`$WH_CP\`** (código $ESTADO_CP)."
    else
      CONCL_ZONA="$CONCL_ZONA
- Al fijar el código postal 46001 no ha devuelto ningún almacén (código $ESTADO_CP). Revisar \`mercadona-codigo-postal.cabeceras\`."
    fi
  fi
fi

# ---------- Consum ----------

CONCL_CONSUM=""
pedir consum-busqueda-leche "$CONSUM?limit=5&offset=0&q=leche"
N_LECHE=$(jq -r '.products | length' "$SALIDA/consum-busqueda-leche.json" 2>/dev/null)
EJEMPLO=$(jq -r '.products[0] | "\(.productData.name) (\(.productData.description // "")): \([.priceData.prices[]? | select(.id == "PRICE") | .value.centAmount][0] | . * 100 | round / 100) €"' \
  "$SALIDA/consum-busqueda-leche.json" 2>/dev/null)

pedir consum-catalogo "$CONSUM?limit=1&offset=0"
TOTAL_CONSUM=$(jq -r '.totalCount // empty' "$SALIDA/consum-catalogo.json" 2>/dev/null)

if [ -z "$N_LECHE" ] || [ "$N_LECHE" = "0" ] || [ "$N_LECHE" = "null" ]; then
  FALLO_CONSUM=1
  CONCL_CONSUM="❌ **La búsqueda no devuelve productos.**"
else
  CONCL_CONSUM="✅ **Responde.** La búsqueda «leche» devuelve $N_LECHE productos; el primero es $EJEMPLO."
fi
if [ -n "$TOTAL_CONSUM" ]; then
  CONCL_CONSUM="$CONCL_CONSUM El catálogo completo tiene **$TOTAL_CONSUM** productos."
else
  CONCL_CONSUM="$CONCL_CONSUM No se ha podido leer el tamaño del catálogo completo."
fi

# ---------- Resumen ----------

if [ "${GITHUB_ACTIONS:-}" = "true" ]; then ORIGEN="GitHub Actions"; else ORIGEN="este ordenador"; fi
FECHA=$(TZ=Europe/Madrid date '+%d/%m/%Y a las %H:%M')

{
  echo "# Fase 0 · ¿Responden los supermercados?"
  echo
  echo "Prueba hecha desde **$ORIGEN** el $FECHA (hora de Madrid)."
  echo
  echo "## Mercadona"
  echo
  echo "$CONCL_MERCADONA"
  if [ -n "$CONCL_ZONA" ]; then
    echo
    echo "**Zona de precios:**"
    echo
    echo "$CONCL_ZONA"
  fi
  echo
  echo "## Consum"
  echo
  echo "$CONCL_CONSUM"
  echo
  echo "## Detalle de cada petición"
  echo
  echo "| Petición | Resultado | Tiempo | Tamaño | Nota |"
  echo "|---|---|---|---|---|"
  cat "$FILAS"
} > "$SALIDA/resumen.md"

cat "$SALIDA/resumen.md"
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  cat "$SALIDA/resumen.md" >> "$GITHUB_STEP_SUMMARY"
fi

if [ "$FALLO_MERCADONA" -eq 1 ] || [ "$FALLO_CONSUM" -eq 1 ]; then
  exit 1
fi
