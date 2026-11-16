import { useEffect, useState } from 'preact/hooks';
import { SinConexion, VersionNueva } from './componentes/Banderas.tsx';
import { AvisosPrecios } from './componentes/EstadoPrecios.tsx';
import { Icono, type NombreIcono } from './componentes/Icono.tsx';
import { cargarDatos } from './datos.ts';
import { avisosPrecios } from './estado.ts';
import { PantallaNecesidades } from './necesidades/PantallaNecesidades.tsx';
import { PantallaLidl } from './lidl/PantallaLidl.tsx';
import { PantallaLista } from './lista/PantallaLista.tsx';
import { PantallaAjustes } from './pantallas.tsx';
import type { DatosApp } from './tipos.ts';

const PESTANAS = [
  { id: 'lista', nombre: 'Lista', icono: 'carrito' },
  { id: 'necesidades', nombre: 'Necesidades', icono: 'lista' },
  { id: 'lidl', nombre: 'Lidl', icono: 'etiqueta' },
  { id: 'ajustes', nombre: 'Ajustes', icono: 'ajustes' },
] as const satisfies readonly { id: string; nombre: string; icono: NombreIcono }[];
type IdPestana = (typeof PESTANAS)[number]['id'];

type Ruta = { pestana: IdPestana; sub: string | null };

/** La pantalla se guarda en la dirección: #lista, #necesidades/nueva, #necesidades/<id>... */
function rutaDeLaDireccion(): Ruta {
  const [id = '', ...resto] = location.hash.replace('#', '').split('/');
  const pestana = PESTANAS.find((p) => p.id === id)?.id ?? 'lista';
  return { pestana, sub: resto.length > 0 ? resto.map(decodeURIComponent).join('/') : null };
}

export function App() {
  const [ruta, setRuta] = useState<Ruta>(rutaDeLaDireccion);
  const { pestana, sub } = ruta;
  const [datos, setDatos] = useState<DatosApp | null>(null);
  const [guardados, setGuardados] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const ahora = new Date();

  const cargar = () => {
    setCargando(true);
    setError(null);
    cargarDatos()
      .then((r) => {
        setDatos(r.datos);
        setGuardados(r.guardados);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setCargando(false));
  };

  useEffect(() => {
    cargar();
    const alCambiar = () => setRuta(rutaDeLaDireccion());
    window.addEventListener('hashchange', alCambiar);
    return () => window.removeEventListener('hashchange', alCambiar);
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pestana, sub]);

  return (
    <>
      <main class="contenido">
        <VersionNueva />
        <SinConexion />
        {error && (
          <div class="aviso aviso--error" role="alert">
            <Icono nombre="alerta" tamano={20} />
            <span>{error}</span>
            <button type="button" class="boton boton--pequeno" onClick={cargar}>
              Reintentar
            </button>
          </div>
        )}
        {cargando && !datos && !error && (
          <p class="aviso aviso--info" role="status">
            <Icono nombre="recargar" tamano={20} />
            <span>Cargando precios…</span>
          </p>
        )}
        {guardados && datos && (
          <div class="aviso aviso--info" role="status">
            <Icono nombre="sinConexion" tamano={20} />
            <span>No se han podido descargar los precios: usas los guardados en el iPhone.</span>
            <button type="button" class="boton boton--pequeno" onClick={cargar}>
              Reintentar
            </button>
          </div>
        )}
        {datos && <AvisosPrecios avisos={avisosPrecios(datos, ahora)} />}
        {pestana === 'lista' && <PantallaLista datos={datos} ahora={ahora} />}
        {pestana === 'necesidades' && <PantallaNecesidades sub={sub} datos={datos} />}
        {pestana === 'lidl' && <PantallaLidl sub={sub} />}
        {pestana === 'ajustes' && (
          <PantallaAjustes datos={datos} ahora={ahora} guardados={guardados} error={error} />
        )}
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
