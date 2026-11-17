/**
 * Número en el icono de la app (Badging API). En el iPhone solo funciona con la app añadida a
 * la pantalla de inicio (iOS 16.4 o posterior) y con permiso de notificaciones: el iPhone lo
 * exige para mostrar el número, aunque Cesta Lista no envía ninguna notificación.
 */

export type EstadoIcono = 'no-disponible' | 'sin-permiso' | 'denegado' | 'concedido';

export function estadoIcono(): EstadoIcono {
  if (!('setAppBadge' in navigator) || typeof Notification === 'undefined') {
    return 'no-disponible';
  }
  if (Notification.permission === 'granted') return 'concedido';
  if (Notification.permission === 'denied') return 'denegado';
  return 'sin-permiso';
}

/** Pide permiso (tiene que ser al tocar un botón). */
export async function pedirPermisoIcono(): Promise<EstadoIcono> {
  if (estadoIcono() === 'no-disponible') return 'no-disponible';
  try {
    await Notification.requestPermission();
  } catch {
    // Safari antiguo: sin promesa. Se mira el permiso igualmente.
  }
  return estadoIcono();
}

/** Pone el número (0 lo quita). Si no se puede, no hace nada. */
export function ponerNumeroEnIcono(numero: number): void {
  if (estadoIcono() !== 'concedido') return;
  const peticion = numero > 0 ? navigator.setAppBadge(numero) : navigator.clearAppBadge();
  peticion.catch(() => undefined);
}
