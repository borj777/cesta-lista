import { useEffect, useRef, useState } from 'preact/hooks';
import { recargarAjustesCompra } from '../ajustes.ts';
import { guardarAjuste, leerAjuste, leerTodo, reemplazarTodo } from '../almacen.ts';
import { crearCopia, leerCopia, nombreArchivo, ofrecerArchivo, textoCopia } from '../copia.ts';
import { fechaHora } from '../estado.ts';
import { recargarCompra } from '../lista/estado.ts';
import { recargarRecetas } from '../menu/estado.ts';
import { recargarNecesidades, useNecesidades } from '../necesidades/estado.ts';
import { recargarTiendas, useTiendas } from '../tiendas/estado.ts';
import { Icono } from './Icono.tsx';

type Mensaje = { tipo: 'bien' | 'error'; texto: string };
const cosas = (n: number) => (n === 1 ? '1 necesidad' : `${n} necesidades`);
/** "4 necesidades y 3 precios apuntados a mano" (sin la segunda parte si no hay ninguno). */
const contenido = (necesidades: number, precios: number) =>
  precios === 0
    ? cosas(necesidades)
    : `${cosas(necesidades)} y ${precios === 1 ? '1 precio apuntado' : `${precios} precios apuntados`} a mano`;

/** Ajustes → Copia de seguridad: exportar e importar todos los datos en un archivo. */
export function CopiaSeguridad() {
  const { necesidades } = useNecesidades();
  const { productos: propios } = useTiendas();
  const [ultima, setUltima] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<Mensaje | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const selector = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void leerAjuste<string>('ultimaCopia').then((v) => setUltima(v ?? null));
  }, []);

  const exportar = async () => {
    setOcupado(true);
    setMensaje(null);
    try {
      const ahora = new Date();
      const copia = crearCopia(await leerTodo(), ahora.toISOString());
      const resultado = await ofrecerArchivo(textoCopia(copia), nombreArchivo(ahora));
      if (resultado !== 'cancelada') {
        await guardarAjuste('ultimaCopia', copia.exportada);
        setUltima(copia.exportada);
        setMensaje({
          tipo: 'bien',
          texto: `Copia creada con ${contenido(copia.necesidades.length, copia.productos.length)}. Guárdala en Archivos o en iCloud.`,
        });
      }
    } catch (error) {
      setMensaje({
        tipo: 'error',
        texto: `No se ha podido crear la copia (${error instanceof Error ? error.message : error}).`,
      });
    } finally {
      setOcupado(false);
    }
  };

  const importar = async (archivo: File) => {
    setMensaje(null);
    const lectura = leerCopia(await archivo.text());
    if (!lectura.ok) {
      setMensaje({ tipo: 'error', texto: lectura.error });
      return;
    }
    const { copia } = lectura;
    const actuales = contenido(necesidades?.length ?? 0, propios?.length ?? 0);
    const confirmado = confirm(
      `La copia del ${fechaHora(copia.exportada)} tiene ${contenido(copia.necesidades.length, copia.productos.length)}. ` +
        `Sustituirá lo que tienes ahora en este iPhone (${actuales}). ¿Continuar?`,
    );
    if (!confirmado) return;
    setOcupado(true);
    try {
      // La copia importada se hizo en su fecha: esa es ahora la última copia de estos datos.
      // (Dentro de la copia no está su propia fecha, porque se apunta después de crearla.)
      await reemplazarTodo({
        ...copia,
        ajustes: { ...copia.ajustes, ultimaCopia: copia.exportada },
      });
      await Promise.all([
        recargarNecesidades(),
        recargarTiendas(),
        recargarAjustesCompra(),
        recargarCompra(),
        recargarRecetas(),
      ]);
      setUltima(copia.exportada);
      setMensaje({
        tipo: 'bien',
        texto: `Copia importada: ${contenido(copia.necesidades.length, copia.productos.length)}.`,
      });
    } catch (error) {
      setMensaje({
        tipo: 'error',
        texto: `No se ha podido importar; tus datos no han cambiado (${error instanceof Error ? error.message : error}).`,
      });
    } finally {
      setOcupado(false);
    }
  };

  return (
    <section class="tarjeta">
      <h2>Copia de seguridad</h2>
      <p class="secundario">
        Tus datos se guardan solo en este iPhone
        {necesidades ? ` (${contenido(necesidades.length, propios?.length ?? 0)})` : ''}. Haz una
        copia de vez en cuando y guárdala en Archivos o en iCloud por si cambias de móvil o borras
        la app.
      </p>
      <p class="secundario">Última copia: {ultima ? fechaHora(ultima) : 'todavía ninguna'}.</p>
      {mensaje && (
        <p
          class={`aviso ${mensaje.tipo === 'bien' ? 'aviso--bien' : 'aviso--error'}`}
          role="status"
        >
          <Icono nombre={mensaje.tipo === 'bien' ? 'hecho' : 'alerta'} tamano={20} />
          <span>{mensaje.texto}</span>
        </p>
      )}
      <div class="acciones">
        <button
          type="button"
          class="boton boton--principal boton--ancho"
          disabled={ocupado}
          onClick={exportar}
        >
          Exportar copia
        </button>
        <button
          type="button"
          class="boton boton--ancho"
          disabled={ocupado}
          onClick={() => selector.current?.click()}
        >
          Importar copia
        </button>
      </div>
      <input
        ref={selector}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          const archivo = e.currentTarget.files?.[0];
          e.currentTarget.value = '';
          if (archivo) void importar(archivo);
        }}
      />
    </section>
  );
}
