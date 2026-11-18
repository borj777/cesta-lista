/**
 * Descarga del historial de precios: cada trozo (data/historial/<tienda>-<n>.json) se pide la
 * primera vez que se mira un producto suyo. El service worker guarda una copia para verlo sin
 * conexión.
 */
import { useEffect, useState } from 'preact/hooks';
import { leerTrozo, trozoDe, type Historial, type Punto } from './historial.ts';

const cargas = new Map<string, Promise<Historial | null>>();
const cargados = new Map<string, Historial>();

const clave = (tienda: string, id: string) => `${tienda}-${trozoDe(id)}`;

function cargarTrozo(nombre: string): Promise<Historial | null> {
  let carga = cargas.get(nombre);
  if (!carga) {
    carga = fetch(`${import.meta.env.BASE_URL}data/historial/${nombre}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((datos: unknown) => {
        const historial = leerTrozo(datos);
        if (historial) cargados.set(nombre, historial);
        else cargas.delete(nombre);
        return historial;
      })
      .catch(() => {
        // Sin conexión y sin copia: se intentará otra vez la próxima vez.
        cargas.delete(nombre);
        return null;
      });
    cargas.set(nombre, carga);
  }
  return carga;
}

export type EstadoHistorial =
  { estado: 'cargando' } | { estado: 'error' } | { estado: 'listo'; puntos: Punto[] | null };

/** Historial de un producto de Mercadona o Consum. */
export function useHistorial(tienda: string, id: string): EstadoHistorial {
  const inicial = (): EstadoHistorial => {
    const h = cargados.get(clave(tienda, id));
    return h ? { estado: 'listo', puntos: h.get(id) ?? null } : { estado: 'cargando' };
  };
  const [estado, setEstado] = useState<EstadoHistorial>(inicial);
  useEffect(() => {
    let vigente = true;
    setEstado(inicial());
    void cargarTrozo(clave(tienda, id)).then((h) => {
      if (vigente)
        setEstado(h ? { estado: 'listo', puntos: h.get(id) ?? null } : { estado: 'error' });
    });
    return () => {
      vigente = false;
    };
  }, [tienda, id]);
  return estado;
}
