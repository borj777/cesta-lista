import { useMemo, useState } from 'preact/hooks';
import { hoyEnEspana, textoDia, textoPrecioRef } from '../formato.ts';
import type { ProductoApp, Unidad } from '../tipos.ts';
import { useHistorial } from './carga.ts';
import {
  graficaHistorial,
  resumenHistorial,
  textosCambios,
  textosResumen,
  tramoEn,
  type Punto,
  type Tramo,
} from './historial.ts';

const ANCHO = 300;
const ALTO = 64;

const POR: Record<Unidad, string> = {
  kg: 'por kg',
  l: 'por litro',
  ud: 'por unidad',
  lavado: 'por lavado',
  m: 'por metro',
};

/**
 * Historial del precio de un producto de Mercadona o Consum: una gráfica de escalones del
 * precio por kg (o por litro, unidad…) desde el primer día guardado, un resumen y la lista de
 * cambios. Al tocar la gráfica se ve el precio de ese día.
 */
export function HistorialPrecio({ producto, color }: { producto: ProductoApp; color: string }) {
  const historial = useHistorial(producto.tienda, producto.id);
  if (historial.estado === 'cargando') return null;
  if (historial.estado === 'error') {
    return (
      <p class="producto__nota historial__nota">
        No se ha podido cargar el historial del precio. Se intentará al volver a abrirlo.
      </p>
    );
  }
  if (!historial.puntos) return null;
  return <Grafica puntos={historial.puntos} unidad={producto.formato.unidad} color={color} />;
}

function Grafica({ puntos, unidad, color }: { puntos: Punto[]; unidad: Unidad; color: string }) {
  const hoy = hoyEnEspana();
  const resumen = useMemo(() => resumenHistorial(puntos), [puntos]);
  const grafica = useMemo(() => graficaHistorial(puntos, hoy, ANCHO, ALTO), [puntos, hoy]);
  const [tocado, setTocado] = useState<Tramo | null>(null);
  if (!resumen) return null;

  const ultimo = grafica.tramos.at(-1);
  const textos = textosResumen(resumen, unidad);
  const tocar = (e: PointerEvent) => {
    const caja = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    if (caja.width === 0) return;
    setTocado(tramoEn(grafica.tramos, ((e.clientX - caja.left) / caja.width) * ANCHO));
  };
  const lectura = tocado
    ? `${tocado.dia === hoy ? 'Hoy' : `Desde el ${textoDia(tocado.dia)}`}: ${textoPrecioRef(tocado.precioRef, unidad)}`
    : resumen.actual
      ? `Hoy: ${textoPrecioRef(resumen.actual.precioRef, unidad)}`
      : 'Ya no está en la tienda';

  return (
    <div class="historial" style={{ '--serie': color }}>
      <p class="tienda__parte">
        Precio {POR[unidad]} desde el {textoDia(resumen.desde)}
      </p>
      <p class="historial__lectura" aria-live="polite">
        {lectura}
      </p>
      <div class="historial__cuerpo">
        <svg
          class="historial__grafica"
          viewBox={`0 0 ${ANCHO} ${ALTO}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`Precio ${POR[unidad]} desde el ${textoDia(resumen.desde)}. ${textos.join(' ')}`}
          onPointerDown={tocar}
          onPointerMove={(e) => {
            if (e.pointerType === 'mouse' || e.buttons > 0) tocar(e);
          }}
          onPointerLeave={(e) => {
            if (e.pointerType === 'mouse') setTocado(null);
          }}
        >
          <line class="historial__guia" x1={0} x2={ANCHO} y1={ALTO - 0.5} y2={ALTO - 0.5} />
          {tocado && (
            <line
              class="historial__guia historial__guia--tocado"
              x1={(tocado.x1 + tocado.x2) / 2}
              x2={(tocado.x1 + tocado.x2) / 2}
              y1={0}
              y2={ALTO}
            />
          )}
          {grafica.caminos.map((d) => (
            <path key={d} class="historial__linea" d={d} />
          ))}
          {/* Punto final (y el tocado): trazos de largo cero con extremos redondos, que se ven
              redondos aunque la gráfica se estire. */}
          {[tocado ?? ultimo].map(
            (t) =>
              t && (
                <g key="punto">
                  <path
                    class="historial__punto-borde"
                    d={`M${tocado ? (t.x1 + t.x2) / 2 : t.x2} ${t.y} h0`}
                  />
                  <path
                    class="historial__punto"
                    d={`M${tocado ? (t.x1 + t.x2) / 2 : t.x2} ${t.y} h0`}
                  />
                </g>
              ),
          )}
        </svg>
        <span
          class={
            resumen.maximo === resumen.minimo
              ? 'historial__eje historial__eje--uno'
              : 'historial__eje'
          }
          aria-hidden="true"
        >
          <span>{textoPrecioRef(resumen.maximo, unidad)}</span>
          {resumen.maximo !== resumen.minimo && (
            <span>{textoPrecioRef(resumen.minimo, unidad)}</span>
          )}
        </span>
      </div>
      <p class="historial__fechas" aria-hidden="true">
        <span>{textoDia(resumen.desde)}</span>
        <span>Hoy</span>
      </p>
      {textos.map((t) => (
        <p key={t} class="producto__nota historial__nota">
          {t}
        </p>
      ))}
      <details class="historial__cambios">
        <summary>Ver los cambios</summary>
        <ul>
          {textosCambios(puntos, unidad).map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
