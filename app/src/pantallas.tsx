import { ComoInstalar } from './componentes/Banderas.tsx';
import { CopiaSeguridad } from './componentes/CopiaSeguridad.tsx';
import { Diagnostico } from './componentes/Diagnostico.tsx';
import { DetallePrecios, FechaPrecios } from './componentes/EstadoPrecios.tsx';
import { fechaHora } from './estado.ts';
import type { DatosApp } from './tipos.ts';

type Props = { datos: DatosApp | null; ahora: Date };

function Proximamente({ titulo, children }: { titulo: string; children: string }) {
  return (
    <section class="tarjeta vacia">
      <h2>{titulo}</h2>
      <p class="secundario">{children}</p>
    </section>
  );
}

export function PantallaLista({ datos, ahora }: Props) {
  return (
    <>
      <h1>Lista de compra</h1>
      {datos && <FechaPrecios datos={datos} ahora={ahora} />}
      <ComoInstalar />
      <Proximamente titulo="Tu lista aparecerá aquí">
        Cuando añadas tus necesidades y elijas qué producto compras en cada tienda, Cesta Lista
        repartirá la compra entre Mercadona, Consum y Lidl para que gastes lo mínimo.
      </Proximamente>
    </>
  );
}

export function PantallaAjustes({
  datos,
  ahora,
  guardados,
  error,
}: Props & { guardados: boolean; error: string | null }) {
  return (
    <>
      <h1>Ajustes</h1>
      <section class="tarjeta">
        <h2>Precios</h2>
        {datos ? (
          <>
            <DetallePrecios datos={datos} ahora={ahora} />
            <p class="secundario">
              Se actualizan cada mañana a las 7:00. Última comprobación: {fechaHora(datos.generado)}
              .
            </p>
          </>
        ) : (
          <p class="secundario">{error ?? 'Cargando precios…'}</p>
        )}
      </section>
      <CopiaSeguridad />
      <ComoInstalar />
      <Diagnostico guardados={guardados} error={error} />
      <section class="tarjeta">
        <h2>Acerca de</h2>
        <p class="secundario">
          Cesta Lista, versión {__VERSION_APP__} del {fechaHora(__FECHA_BUILD__)}. Tus datos se
          guardan solo en este iPhone.
        </p>
      </section>
    </>
  );
}
