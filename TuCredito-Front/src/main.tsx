import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { registerServiceWorker } from './services/pushService'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Registrar el service worker al arrancar (no solo cuando el usuario activa push) —
// sin un SW activo el navegador no ofrece "Instalar app", y esto además deja el shell
// cacheado desde la primera visita. `load` en vez de inmediato para no competir con el
// primer render por ancho de banda/CPU en conexiones lentas.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    registerServiceWorker().catch(() => {
      // No crítico: si falla, la app sigue funcionando como página web normal.
    });
  });
}
