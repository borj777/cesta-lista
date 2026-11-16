/** Valores que vite.config.ts inserta al compilar. */
declare const __VERSION_APP__: string;
declare const __FECHA_BUILD__: string;

interface Navigator {
  /** Safari en iPhone: true si la app se ha abierto desde la pantalla de inicio. */
  standalone?: boolean;
}
