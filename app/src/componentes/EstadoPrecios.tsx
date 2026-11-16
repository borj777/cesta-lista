import {
  avisosPrecios,
  fechaCorta,
  fechaHora,
  miles,
  resumenTiendas,
  type Aviso,
} from '../estado.ts';
import type { DatosApp } from '../tipos.ts';
import { Icono } from './Icono.tsx';

/** Avisos de precios fallidos o antiguos. Se muestran arriba en todas las pantallas. */
export function AvisosPrecios({ avisos }: { avisos: Aviso[] }) {
  if (avisos.length === 0) return null;
  return (
    <div class="avisos" role="status">
      {avisos.map((a) => (
        <p key={a.tienda} class="aviso aviso--atencion">
          <Icono nombre="alerta" tamano={20} />
          <span>{a.texto}</span>
        </p>
      ))}
    </div>
  );
}

/** Una línea con la fecha de los precios, para la cabecera de la lista. */
export function FechaPrecios({ datos, ahora }: { datos: DatosApp; ahora: Date }) {
  const resumen = resumenTiendas(datos, ahora);
  const total = resumen.reduce((suma, t) => suma + t.productos, 0);
  const fechas = resumen
    .map((t) => (t.actualizado ? `${t.nombre} ${fechaCorta(t.actualizado)}` : null))
    .filter(Boolean)
    .join(' · ');
  return (
    <p class="secundario">
      Precios: {fechas} · {miles(total)} productos
    </p>
  );
}

/** Detalle por tienda: fecha, número de productos y si la última descarga fue bien. */
export function DetallePrecios({ datos, ahora }: { datos: DatosApp; ahora: Date }) {
  const avisos = avisosPrecios(datos, ahora);
  return (
    <ul class="filas">
      {resumenTiendas(datos, ahora).map((t) => {
        const aviso = avisos.find((a) => a.tienda === t.tienda);
        return (
          <li key={t.tienda} class="fila">
            <span class={`punto punto--${t.tienda}`} aria-hidden="true" />
            <div class="fila__texto">
              <span>{t.nombre}</span>
              <span class={aviso ? 'secundario texto--atencion' : 'secundario'}>
                {t.actualizado
                  ? `${aviso?.tipo === 'fallida' ? 'Falló la última descarga · ' : ''}Precios del ${fechaHora(t.actualizado)} · ${miles(t.productos)} productos`
                  : 'Sin precios todavía'}
              </span>
            </div>
            <span class={t.correcto ? 'texto--bien' : 'texto--atencion'}>
              <Icono nombre={t.correcto ? 'hecho' : 'alerta'} />
            </span>
          </li>
        );
      })}
    </ul>
  );
}
