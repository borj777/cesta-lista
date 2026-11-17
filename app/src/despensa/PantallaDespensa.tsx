import { useEffect, useState } from 'preact/hooks';
import { Icono } from '../componentes/Icono.tsx';
import { Interruptor } from '../componentes/Tienda.tsx';
import { hoyEnEspana, textoDia } from '../formato.ts';
import { avisosDespensa, olvidada, resumenDespensa, type FilaDespensa } from './avisos.ts';
import { textoAproximado, textoDias } from './despensa.ts';
import { guardarNumeroEnIcono, useConMenu, useNumeroEnIcono } from './estado.ts';
import { estadoIcono, pedirPermisoIcono, ponerNumeroEnIcono, type EstadoIcono } from './icono.ts';

function Enlaces({
  filas,
  detalle,
}: {
  filas: FilaDespensa[];
  detalle: (f: FilaDespensa) => string;
}) {
  return (
    <>
      {filas.map((f, i) => (
        <span key={f.necesidad.id}>
          {i > 0 && ', '}
          <a href={`#necesidades/${f.necesidad.id}`}>{f.necesidad.nombre}</a>
          {detalle(f) && ` (${detalle(f)})`}
        </span>
      ))}
      .
    </>
  );
}

/** Avisos de la despensa en la lista de la compra (solo si hay alguno). */
export function AvisosDespensa({ hoy }: { hoy: string }) {
  const conMenu = useConMenu();
  if (!conMenu) return null;
  const { acabado, poco, olvidado, total } = avisosDespensa(conMenu, hoy);
  if (total === 0) return null;
  return (
    <section class="tarjeta en-casa avisos-casa">
      <h2 class="tienda__titulo">
        <Icono nombre="casa" tamano={20} /> En casa
      </h2>
      {acabado.length > 0 && (
        <p>
          <strong>Se ha acabado:</strong> <Enlaces filas={acabado} detalle={() => ''} />
        </p>
      )}
      {poco.length > 0 && (
        <p>
          <strong>Queda poco:</strong>{' '}
          <Enlaces
            filas={poco}
            detalle={(f) => (f.estado.tipo === 'queda' ? textoDias(f.estado.dias) : '')}
          />
        </p>
      )}
      {olvidado.length > 0 && (
        <p>
          <strong>Hace tiempo que no lo compras:</strong>{' '}
          <Enlaces
            filas={olvidado}
            detalle={(f) =>
              f.necesidad.ultimaCompra ? `última vez el ${textoDia(f.necesidad.ultimaCompra)}` : ''
            }
          />
        </p>
      )}
      <a class="boton boton--ancho avisos-casa__ver" href="#necesidades/en-casa">
        Ver todo lo que tienes en casa
      </a>
    </section>
  );
}

function textoFila(f: FilaDespensa, hoy: string): string {
  const { estado, fin, necesidad } = f;
  if (estado.tipo === 'acabado') {
    return fin && fin < hoy ? `Se acabó hacia el ${textoDia(fin)}` : 'Se ha acabado';
  }
  if (estado.tipo === 'queda') {
    const { texto } = textoAproximado(estado.cantidad, necesidad);
    const cantidad = texto.charAt(0).toUpperCase() + texto.slice(1);
    if (estado.dias === Infinity) return cantidad;
    return `${cantidad}, ${textoDias(estado.dias)}${fin ? ` (hasta el ${textoDia(fin)})` : ''}`;
  }
  if (!necesidad.ultimaCompra) return 'Se sabrá tras tu próxima compra, o tócalo para decirlo';
  const ultima = `Comprado por última vez el ${textoDia(necesidad.ultimaCompra)}`;
  return olvidada(necesidad, hoy) ? `${ultima}: hace tiempo` : ultima;
}

function Grupo({
  titulo,
  filas,
  hoy,
  atencion = false,
}: {
  titulo: string;
  filas: FilaDespensa[];
  hoy: string;
  atencion?: boolean;
}) {
  if (filas.length === 0) return null;
  return (
    <section class="grupo">
      <h2 class="grupo__titulo">{titulo}</h2>
      <ul class="filas tarjeta tarjeta--lista">
        {filas.map((f) => (
          <li key={f.necesidad.id}>
            <a class="fila fila--enlace" href={`#necesidades/${f.necesidad.id}/casa`}>
              <div class="fila__texto">
                <span>{f.necesidad.nombre}</span>
                <span class={atencion ? 'texto--atencion' : 'secundario'}>{textoFila(f, hoy)}</span>
              </div>
              <span class="chevron" aria-hidden="true">
                ›
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** #necesidades/en-casa: lo que queda de cada cosa. */
export function VistaDespensa() {
  const conMenu = useConMenu();
  const hoy = hoyEnEspana();
  const volver = (
    <a class="volver" href="#necesidades">
      ‹ Mis necesidades
    </a>
  );
  if (!conMenu) return volver;
  const r = resumenDespensa(conMenu, hoy);
  return (
    <>
      {volver}
      <h1>En casa</h1>
      <p class="secundario">
        Lo que te queda de cada cosa, calculado con lo que gastas (y tu menú). Es una estimación:
        toca cualquiera para corregirla.
      </p>
      {conMenu.length === 0 && (
        <section class="tarjeta">
          <p class="secundario">
            Aún no hay nada que se gaste. Añade tus necesidades o pon platos en tu menú.
          </p>
        </section>
      )}
      <Grupo titulo="Se ha acabado" filas={r.acabado} hoy={hoy} atencion />
      <Grupo titulo="Queda poco" filas={r.poco} hoy={hoy} atencion />
      <Grupo titulo="Te queda" filas={r.queda} hoy={hoy} />
      <Grupo titulo="No se sabe cuánto te queda" filas={r.desconocido} hoy={hoy} />
    </>
  );
}

/**
 * Pone en el icono de la app el número de avisos cada vez que cambian (al abrir la app, al
 * volver a ella y al corregir algo). No pinta nada.
 */
export function NumeroEnIcono() {
  const activo = useNumeroEnIcono();
  const conMenu = useConMenu();
  const [, setVuelta] = useState(0);
  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState === 'visible') setVuelta((v) => v + 1);
    };
    document.addEventListener('visibilitychange', alVolver);
    return () => document.removeEventListener('visibilitychange', alVolver);
  }, []);
  const total = conMenu ? avisosDespensa(conMenu, hoyEnEspana()).total : null;
  useEffect(() => {
    if (activo === null || total === null) return;
    ponerNumeroEnIcono(activo ? total : 0);
  }, [activo, total]);
  return null;
}

const DETALLE_ICONO: Record<EstadoIcono, string> = {
  'no-disponible':
    'Solo funciona con Cesta Lista añadida a la pantalla de inicio (iOS 16.4 o posterior).',
  'sin-permiso':
    'Al encenderlo, el iPhone te pedirá permiso para las notificaciones: lo necesita para mostrar el número. Cesta Lista no te enviará ninguna.',
  denegado:
    'El iPhone no da permiso. Puedes darlo en Ajustes del iPhone › Notificaciones › Cesta Lista.',
  concedido:
    'Cuenta lo que se ha acabado, lo que queda poco y lo que hace tiempo que no compras. Se pone al día cada vez que abres la app.',
};

/** Ajustes → Avisos de la despensa. */
export function AjusteIcono() {
  const activo = useNumeroEnIcono();
  const [permiso, setPermiso] = useState<EstadoIcono>(estadoIcono);
  const [fallo, setFallo] = useState<string | null>(null);
  if (activo === null) return null;
  const encendido = activo && permiso === 'concedido';

  const cambiar = async (quiere: boolean) => {
    setFallo(null);
    try {
      if (!quiere) {
        ponerNumeroEnIcono(0);
        await guardarNumeroEnIcono(false);
        return;
      }
      const nuevo = await pedirPermisoIcono();
      setPermiso(nuevo);
      await guardarNumeroEnIcono(nuevo === 'concedido');
    } catch (e) {
      setFallo(`No se ha podido guardar (${e instanceof Error ? e.message : String(e)}).`);
    }
  };

  return (
    <section class="tarjeta">
      <h2>Avisos de la despensa</h2>
      <p class="secundario">
        Al abrir la app, la lista te avisa de lo que se ha acabado, lo que queda poco y lo que hace
        tiempo que no compras. Puedes verlo todo en{' '}
        <a href="#necesidades/en-casa">Necesidades › En casa</a>.
      </p>
      <Interruptor
        id="numero-icono"
        etiqueta="Número de avisos en el icono"
        detalle={DETALLE_ICONO[permiso]}
        encendido={encendido}
        alCambiar={(v) => void cambiar(v)}
      />
      {fallo && (
        <p class="aviso aviso--error" role="alert">
          <Icono nombre="alerta" tamano={20} />
          <span>{fallo}</span>
        </p>
      )}
    </section>
  );
}
