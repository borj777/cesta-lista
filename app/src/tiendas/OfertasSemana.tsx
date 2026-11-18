import { useMemo, useState } from 'preact/hooks';
import { palabras } from '../buscador.ts';
import { Icono } from '../componentes/Icono.tsx';
import { InfoProducto } from '../componentes/Producto.tsx';
import { fechaCorta } from '../estado.ts';
import type { DatosApp, ProductoApp } from '../tipos.ts';

/** Nombre de la sección de una oferta («Carne y aves > Aves de corral» → «Aves de corral»). */
function nombreSeccion(datos: DatosApp, p: ProductoApp): string {
  const completo = p.seccion ? datos.secciones?.[p.tienda]?.[p.seccion] : undefined;
  return completo?.split(' > ').at(-1) ?? 'Otras';
}

/**
 * Ofertas de la semana de una tienda sin catálogo (Lidl), agrupadas por sección y con un
 * buscador. Solo para mirarlas: se eligen desde cada necesidad.
 */
export function OfertasSemana({
  ofertas,
  datos,
  tienda,
  nombre,
}: {
  ofertas: ProductoApp[];
  datos: DatosApp;
  tienda: string;
  nombre: string;
}) {
  const [consulta, setConsulta] = useState('');
  const estado = datos.tiendas[tienda as 'lidl'];
  const grupos = useMemo(() => {
    const buscadas = palabras(consulta);
    const encajan = ofertas.filter((p) => {
      const suyas = palabras(`${p.nombre} ${p.marca ?? ''}`);
      return buscadas.every((b) => suyas.some((s) => s.startsWith(b)));
    });
    const porSeccion = new Map<string, ProductoApp[]>();
    for (const p of encajan) {
      const s = nombreSeccion(datos, p);
      porSeccion.set(s, [...(porSeccion.get(s) ?? []), p]);
    }
    return [...porSeccion.entries()]
      .sort(([a], [b]) => a.localeCompare(b, 'es'))
      .map(([seccion, lista]) => ({
        seccion,
        lista: lista.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
      }));
  }, [ofertas, consulta, datos]);

  return (
    <>
      <h2 class="grupo__titulo grupo__titulo--separado">
        Ofertas de esta semana ({ofertas.length})
      </h2>
      <p class="secundario">
        Se descargan solas cada mañana de la web de {nombre}
        {estado?.actualizado ? ` (última, el ${fechaCorta(estado.actualizado)})` : ''}. Para usar
        una, elígela en la necesidad: la app la tiene en cuenta mientras dura.
      </p>
      {estado?.estado === 'fallida' && (
        <p class="aviso aviso--atencion">
          <Icono nombre="alerta" tamano={20} />
          <span>
            La última descarga de las ofertas de {nombre} ha fallado: pueden faltar las nuevas.
          </span>
        </p>
      )}
      <div class="buscador">
        <Icono nombre="buscar" tamano={20} />
        <input
          class="entrada entrada--busqueda"
          type="search"
          enterkeyhint="search"
          autocomplete="off"
          aria-label={`Buscar en las ofertas de ${nombre}`}
          placeholder="Buscar en las ofertas"
          value={consulta}
          onInput={(e) => setConsulta(e.currentTarget.value)}
        />
      </div>
      {grupos.length === 0 && <p class="secundario">Ninguna oferta tiene esas palabras.</p>}
      {grupos.map((g) => (
        <section key={g.seccion}>
          <h3 class="grupo__titulo grupo__titulo--separado">{g.seccion}</h3>
          <ul class="filas tarjeta tarjeta--lista">
            {g.lista.map((p) => (
              <li key={p.id}>
                <div class="producto">
                  <InfoProducto producto={p} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
