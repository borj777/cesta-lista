import { render } from 'preact';
import { App } from './app.tsx';
import { registrarServiceWorker } from './registro-sw.ts';
import './estilos.css';

const raiz = document.getElementById('app');
if (raiz) render(<App />, raiz);
void registrarServiceWorker();
