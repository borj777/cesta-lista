import {
  avisosPrecios,
  fechaCorta,
  fechaHora,
  HORAS_ANTIGUEDAD,
  miles,
  resumenTiendas,
  type Aviso,
} from '../estado.ts';
import { hoyEnEspana } from '../formato.ts';
import { useTiendas } from '../tiendas/estado.ts';
import { ofertasDe } from '../tiendas/ofertas.ts';
import type { DatosApp } from '../tipos.ts';
import { Icono } from './Icono.tsx';
import { Punto } from './Tienda.tsx';

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
      <OfertasLidl datos={datos} ahora={ahora} />
    </ul>
  );
}

/** Línea de las ofertas de Lidl: fecha de la última descarga y cuántas valen hoy o más adelante. */
function OfertasLidl({ datos, ahora }: { datos: DatosApp; ahora: Date }) {
  const { lista } = useTiendas();
  const lidl = lista?.find((t) => t.id === 'lidl');
  const estado = datos.tiendas.lidl;
  if (!lidl || !estado) return null;
  const n = ofertasDe(datos, 'lidl', hoyEnEspana(ahora)).length;
  const antigua =
    !estado.actualizado ||
    (ahora.getTime() - Date.parse(estado.actualizado)) / 3_600_000 > HORAS_ANTIGUEDAD;
  const correcto = estado.estado === 'ok' && !antigua;
  return (
    <li class="fila">
      <Punto color={lidl.color} />
      <div class="fila__texto">
        <span>Ofertas de {lidl.nombre}</span>
        <span class={correcto ? 'secundario' : 'secundario texto--atencion'}>
          {estado.actualizado
            ? `${estado.estado === 'fallida' ? 'Falló la última descarga · ' : ''}Del ${fechaHora(estado.actualizado)} · ${n === 1 ? '1 oferta' : `${miles(n)} ofertas`}`
            : 'Sin ofertas todavía'}
        </span>
      </div>
      <span class={correcto ? 'texto--bien' : 'texto--atencion'}>
        <Icono nombre={correcto ? 'hecho' : 'alerta'} />
      </span>
    </li>
  );
}
