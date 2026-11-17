import { useState } from 'preact/hooks';
import { Icono } from '../componentes/Icono.tsx';
import { Interruptor, Punto } from '../componentes/Tienda.tsx';
import { fechaHora } from '../estado.ts';
import { hoyEnEspana, textoFormato, textoPrecio } from '../formato.ts';
import type { Necesidad } from '../necesidades/modelo.ts';
import {
  alternar,
  porTienda,
  terminarCompra,
  type CompraEnCurso,
  type LineaCompra,
} from './compra.ts';
import { cerrarCompra, guardarCompra, guardarPantallaEncendida } from './estado.ts';
import { pantallaDisponible, usePantallaEncendida } from './pantalla.ts';

const euros = textoPrecio;
const falloDe = (error: unknown) =>
  `No se ha podido guardar (${error instanceof Error ? error.message : String(error)}).`;

function FilaLinea({ linea, alTocar }: { linea: LineaCompra; alTocar: () => void }) {
  const { producto } = linea;
  return (
    <li>
      <button
        type="button"
        class={linea.enCarro ? 'fila fila--compra fila--en-carro' : 'fila fila--compra'}
        aria-pressed={linea.enCarro}
        onClick={alTocar}
      >
        <span class="casilla" aria-hidden="true">
          {linea.enCarro && <Icono nombre="hecho" tamano={18} />}
        </span>
        <span class="fila__texto">
          <span class="fila__nombre">{linea.nombre}</span>
          <span class="secundario">
            {[producto.marca, producto.nombre, textoFormato(producto.formato)]
              .filter(Boolean)
              .join(' · ')}
          </span>
          <span class="secundario">
            {linea.envases} × {euros(linea.precio)}
            {linea.porEnvase ? ' (un envase por unidad)' : ''}
          </span>
        </span>
        <span class="fila__importe">{euros(linea.coste)}</span>
      </button>
    </li>
  );
}

/** La lista mientras se compra: en cada tienda, lo que queda en la estantería y lo que va en el carro. */
export function ModoCompra({
  compra,
  necesidades,
  pantallaEncendida,
  alTerminar,
}: {
  compra: CompraEnCurso;
  necesidades: Necesidad[];
  pantallaEncendida: boolean;
  alTerminar: (mensaje: string) => void;
}) {
  const [fallo, setFallo] = useState<string | null>(null);
  const [terminando, setTerminando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const conseguida = usePantallaEncendida(pantallaEncendida);
  const tiendas = porTienda(compra);
  const total = compra.lineas.length;
  const enCarro = compra.lineas.filter((l) => l.enCarro);
  const enEstanteria = compra.lineas.filter((l) => !l.enCarro);
  const importeTotal = tiendas.reduce((s, t) => s + t.total, 0);
  const importeCarro = tiendas.reduce((s, t) => s + t.enCarro, 0);

  const tocar = (necesidad: string) => {
    setFallo(null);
    guardarCompra(alternar(compra, necesidad)).catch((e: unknown) => setFallo(falloDe(e)));
  };

  const terminar = async (tambienEstanteria: boolean) => {
    setOcupado(true);
    setFallo(null);
    try {
      const compradas = terminarCompra(compra, necesidades, hoyEnEspana(), tambienEstanteria);
      await cerrarCompra(compradas);
      const n = compradas.length;
      alTerminar(
        n === 0
          ? 'Compra terminada. No se ha apuntado nada como comprado.'
          : `Compra terminada. ${n === 1 ? 'Apuntada 1 cosa' : `Apuntadas ${n} cosas`} como comprada${n === 1 ? '' : 's'} hoy.`,
      );
    } catch (e) {
      setFallo(falloDe(e));
      setOcupado(false);
    }
  };

  const cancelar = async () => {
    if (
      !confirm(
        '¿Cancelar la compra?\n\nSe borra la lista con lo marcado y no se apunta nada como comprado.',
      )
    ) {
      return;
    }
    try {
      await guardarCompra(null);
      alTerminar('Compra cancelada.');
    } catch (e) {
      setFallo(falloDe(e));
    }
  };

  return (
    <>
      <h1>De compras</h1>
      <p class="secundario">
        Empezada el {fechaHora(compra.empezada)}. Toca cada cosa al cogerla de la estantería y
        pasará al carro. Si te equivocas, tócala en el carro y volverá a la estantería.
      </p>

      <section class="tarjeta tarjeta--destacada plan">
        <p class="plan__periodo">En el carro</p>
        <h2 class="plan__titulo">
          {enCarro.length} de {total}
        </h2>
        <p class="plan__total">{euros(importeCarro)}</p>
        <p>de {euros(importeTotal)} en total</p>
      </section>

      <section class="tarjeta">
        <Interruptor
          id="pantalla-encendida"
          etiqueta="Mantener la pantalla encendida"
          detalle={
            !pantallaEncendida
              ? 'La pantalla se apagará como siempre.'
              : conseguida
                ? 'La pantalla no se apagará mientras estés en esta lista.'
                : pantallaDisponible()
                  ? 'Se activará en cuanto toques la pantalla.'
                  : 'Tu iPhone no lo permite desde la app. Actualiza iOS o cambia el bloqueo automático en Ajustes del iPhone.'
          }
          encendido={pantallaEncendida}
          alCambiar={(v) => void guardarPantallaEncendida(v)}
        />
      </section>

      {fallo && (
        <p class="aviso aviso--error" role="alert">
          <Icono nombre="alerta" tamano={20} />
          <span>{fallo}</span>
        </p>
      )}

      {tiendas.map(({ tienda, estanteria, carro, total: totalTienda, enCarro: carroTienda }) => (
        <section key={tienda.id} class="grupo">
          <h2 class="grupo__titulo grupo__titulo--tienda">
            <span>
              <Punto color={tienda.color} /> {tienda.nombre}
            </span>
            <span>
              {euros(carroTienda)} de {euros(totalTienda)}
            </span>
          </h2>
          <h3 class="subtitulo-compra">En la estantería ({estanteria.length})</h3>
          {estanteria.length === 0 ? (
            <p class="aviso aviso--bien">
              <Icono nombre="hecho" tamano={20} />
              <span>¡Todo cogido en {tienda.nombre}!</span>
            </p>
          ) : (
            <ul class="filas tarjeta tarjeta--lista">
              {estanteria.map((l) => (
                <FilaLinea key={l.necesidad} linea={l} alTocar={() => tocar(l.necesidad)} />
              ))}
            </ul>
          )}
          {carro.length > 0 && (
            <>
              <h3 class="subtitulo-compra">
                <Icono nombre="carrito" tamano={18} /> En el carro ({carro.length})
              </h3>
              <ul class="filas tarjeta tarjeta--lista">
                {carro.map((l) => (
                  <FilaLinea key={l.necesidad} linea={l} alTocar={() => tocar(l.necesidad)} />
                ))}
              </ul>
            </>
          )}
        </section>
      ))}

      {terminando && enEstanteria.length > 0 ? (
        <section class="tarjeta">
          <h2>¿Y lo que queda en la estantería?</h2>
          <p class="secundario">
            {enEstanteria.length === 1 ? 'Queda 1 cosa' : `Quedan ${enEstanteria.length} cosas`}:{' '}
            {enEstanteria.map((l) => l.nombre).join(', ')}.
          </p>
          <div class="acciones">
            <button
              type="button"
              class="boton boton--principal boton--ancho"
              disabled={ocupado}
              onClick={() => void terminar(false)}
            >
              Dejarlo para la próxima compra
            </button>
            <button
              type="button"
              class="boton boton--ancho"
              disabled={ocupado}
              onClick={() => void terminar(true)}
            >
              También lo he comprado
            </button>
            <button
              type="button"
              class="boton boton--ancho"
              disabled={ocupado}
              onClick={() => setTerminando(false)}
            >
              Seguir comprando
            </button>
          </div>
        </section>
      ) : (
        <div class="acciones">
          <button
            type="button"
            class="boton boton--principal boton--ancho"
            disabled={ocupado}
            onClick={() => (enEstanteria.length > 0 ? setTerminando(true) : void terminar(false))}
          >
            He terminado
          </button>
          <button
            type="button"
            class="boton boton--peligro boton--ancho"
            disabled={ocupado}
            onClick={() => void cancelar()}
          >
            Cancelar la compra
          </button>
        </div>
      )}
    </>
  );
}
