/**
 * Mantener la pantalla encendida mientras se compra (Screen Wake Lock). El iPhone la suelta
 * al cambiar de app o bloquear el móvil, así que se vuelve a pedir al volver a la app.
 */
import { useEffect, useState } from 'preact/hooks';

type CerrojoPantalla = {
  release: () => Promise<void>;
  addEventListener: (t: 'release', f: () => void) => void;
};
type ConWakeLock = { wakeLock?: { request: (tipo: 'screen') => Promise<CerrojoPantalla> } };

export const pantallaDisponible = (): boolean =>
  typeof navigator !== 'undefined' && 'wakeLock' in navigator;

/** Pide que la pantalla no se apague mientras `activa` sea true. Devuelve si lo ha conseguido. */
export function usePantallaEncendida(activa: boolean): boolean {
  const [conseguida, setConseguida] = useState(false);

  useEffect(() => {
    const wakeLock = (navigator as Navigator & ConWakeLock).wakeLock;
    if (!activa || !wakeLock) {
      setConseguida(false);
      return;
    }
    let cerrojo: CerrojoPantalla | null = null;
    let terminado = false;

    const pedir = async () => {
      if (terminado || document.visibilityState !== 'visible' || cerrojo) return;
      try {
        const nuevo = await wakeLock.request('screen');
        if (terminado) {
          await nuevo.release();
          return;
        }
        cerrojo = nuevo;
        setConseguida(true);
        nuevo.addEventListener('release', () => {
          cerrojo = null;
          setConseguida(false);
        });
      } catch {
        setConseguida(false);
      }
    };

    const alCambiarVisibilidad = () => void pedir();
    document.addEventListener('visibilitychange', alCambiarVisibilidad);
    void pedir();
    return () => {
      terminado = true;
      document.removeEventListener('visibilitychange', alCambiarVisibilidad);
      void cerrojo?.release().catch(() => {});
      cerrojo = null;
    };
  }, [activa]);

  return conseguida;
}
