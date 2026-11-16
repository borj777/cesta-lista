import { useEffect, useState } from 'preact/hooks';
import { SinConexion, VersionNueva } from './componentes/Banderas.tsx';
import { AvisosPrecios } from './componentes/EstadoPrecios.tsx';
import { Icono, type NombreIcono } from './componentes/Icono.tsx';
import { cargarDatos } from './datos.ts';
import { avisosPrecios } from './estado.ts';
import { PantallaAjustes, PantallaLidl, PantallaLista, PantallaNecesidades } from './pantallas.tsx';
import type { DatosApp } from './tipos.ts';

const PESTANAS = [
  { id: 'lista', nombre: 'Lista', icono: 'carrito' },
  { id: 'necesidades', nombre: 'Necesidades', icono: 'lista' },
  { id: 'lidl', nombre: 'Lidl', icono: 'etiqueta' },
  { id: 'ajustes', nombre: 'Ajustes', icono: 'ajustes' },
] as const satisfies readonly { id: string; nombre: string; icono: NombreIcono }[];
type IdPestana = (typeof PESTANAS)[number]['id'];

/** La pestaña activa se guarda en la dirección (#lista, #ajustes...). */
function pestanaDeLaDireccion(): IdPestana {
  const id = location.hash.replace('#', '');
  return PESTANAS.find((p) => p.id === id)?.id ?? 'lista';
}

export function App() {
  const [pestana, setPestana] = useState<IdPestana>(pestanaDeLaDireccion);
  const [datos, setDatos] = useState<DatosApp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ahora = new Date();

  useEffect(() => {
    cargarDatos()
      .then(setDatos)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    const alCambiar = () => setPestana(pestanaDeLaDireccion());
    window.addEventListener('hashchange', alCambiar);
    return () => window.removeEventListener('hashchange', alCambiar);
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pestana]);

  return (
    <>
      <main class="contenido">
        <VersionNueva />
        <SinConexion />
        {error && (
          <p class="aviso aviso--error" role="alert">
            <Icono nombre="alerta" tamano={20} />
            <span>{error} Comprueba la conexión y vuelve a abrir la app.</span>
          </p>
        )}
        {datos && <AvisosPrecios avisos={avisosPrecios(datos, ahora)} />}
        {pestana === 'lista' && <PantallaLista datos={datos} ahora={ahora} />}
        {pestana === 'necesidades' && <PantallaNecesidades />}
        {pestana === 'lidl' && <PantallaLidl />}
        {pestana === 'ajustes' && <PantallaAjustes datos={datos} ahora={ahora} />}
      </main>
      <nav class="pestanas" aria-label="Secciones">
        {PESTANAS.map((p) => (
          <a
            key={p.id}
            href={`#${p.id}`}
            class={p.id === pestana ? 'pestana pestana--activa' : 'pestana'}
            aria-current={p.id === pestana ? 'page' : undefined}
          >
            <Icono nombre={p.icono} tamano={26} />
            <span>{p.nombre}</span>
          </a>
        ))}
      </nav>
    </>
  );
}
