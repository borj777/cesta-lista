/** Iconos de línea (estilo Tabler, licencia MIT) dibujados con SVG, sin descargas. */
const TRAZOS = {
  carrito: [
    'M4 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0',
    'M15 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0',
    'M17 17h-11v-14h-2',
    'M6 5l14 1l-1 7h-13',
  ],
  lista: [
    'M13 5h8',
    'M13 9h5',
    'M13 15h8',
    'M13 19h5',
    'M4 4h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1z',
    'M4 14h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1z',
  ],
  etiqueta: [
    'M6.5 7.5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0',
    'M3 6v5.172a2 2 0 0 0 .586 1.414l7.71 7.71a2.41 2.41 0 0 0 3.408 0l5.592 -5.592a2.41 2.41 0 0 0 0 -3.408l-7.71 -7.71a2 2 0 0 0 -1.414 -.586h-5.172a3 3 0 0 0 -3 3z',
  ],
  casa: [
    'M5 12l-2 0l9 -9l9 9l-2 0',
    'M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7',
    'M9 21v-6a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v6',
  ],
  cubiertos: [
    'M19 3v12h-5c-.023 -3.681 .184 -7.406 5 -12zm0 12v6h-1v-3m-10 -14v17m-3 -17v3a3 3 0 1 0 6 0v-3',
  ],
  tienda: [
    'M3 21l18 0',
    'M3 7v1a3 3 0 0 0 6 0v-1m0 1a3 3 0 0 0 6 0v-1m0 1a3 3 0 0 0 6 0v-1h-18l2 -4h14l2 4',
    'M5 21l0 -10.15',
    'M19 21l0 -10.15',
    'M9 21v-4a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v4',
  ],
  ajustes: [
    'M12 6a2 2 0 1 0 4 0a2 2 0 1 0 -4 0',
    'M4 6h8',
    'M16 6h4',
    'M6 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0',
    'M4 12h2',
    'M10 12h10',
    'M15 18a2 2 0 1 0 4 0a2 2 0 1 0 -4 0',
    'M4 18h11',
    'M19 18h1',
  ],
  alerta: [
    'M12 9v4',
    'M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0z',
    'M12 16h.01',
  ],
  hecho: ['M5 12l5 5l10 -10'],
  buscar: ['M3 10a7 7 0 1 0 14 0a7 7 0 1 0 -14 0', 'M21 21l-6 -6'],
  sinConexion: [
    'M12 18h.01',
    'M9.172 15.172a4 4 0 0 1 5.656 0',
    'M6.343 12.343a7.963 7.963 0 0 1 3.864 -2.14m4.163 .155a7.965 7.965 0 0 1 3.287 2',
    'M3.515 9.515a12 12 0 0 1 3.544 -2.455m3.101 -.92a12 12 0 0 1 10.325 3.374',
    'M3 3l18 18',
  ],
  compartir: [
    'M8 9h-1a2 2 0 0 0 -2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-8a2 2 0 0 0 -2 -2h-1',
    'M12 14v-11',
    'M9 6l3 -3l3 3',
  ],
  documento: [
    'M14 3v4a1 1 0 0 0 1 1h4',
    'M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z',
    'M9 9h1',
    'M9 13h6',
    'M9 17h6',
  ],
  recargar: ['M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4', 'M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4'],
} as const;

export type NombreIcono = keyof typeof TRAZOS;

export function Icono({ nombre, tamano = 22 }: { nombre: NombreIcono; tamano?: number }) {
  return (
    <svg
      class="icono"
      width={tamano}
      height={tamano}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {TRAZOS[nombre].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
