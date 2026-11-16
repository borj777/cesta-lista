import { ComoInstalar } from './componentes/Banderas.tsx';
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

export function PantallaNecesidades() {
  return (
    <>
      <h1>Mis necesidades</h1>
      <Proximamente titulo="Próximamente">
        Aquí apuntarás lo que compras, con su cantidad y cada cuánto: por ejemplo, pechuga de pollo,
        1,5 kg a la semana.
      </Proximamente>
    </>
  );
}

export function PantallaLidl() {
  return (
    <>
      <h1>Precios de Lidl</h1>
      <Proximamente titulo="Próximamente">
        Lidl no publica sus precios en internet. Aquí podrás apuntar a mano los de los productos que
        compras allí, y la app te avisará cuando tengan más de 30 días.
      </Proximamente>
    </>
  );
}

export function PantallaAjustes({ datos, ahora }: Props) {
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
          <p class="secundario">Cargando precios…</p>
        )}
      </section>
      <ComoInstalar />
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
