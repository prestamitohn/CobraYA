import { useState } from 'react';
import { Download, Share, X, Smartphone } from 'lucide-react';
import { useInstallPrompt } from '../../hooks/useInstallPrompt';

const DISMISS_KEY = 'cobraya_install_banner_dismissed';

/** Botón simple para Ajustes — no se muestra si ya está instalada o el navegador no ofreció el prompt. */
export function InstallAppButton() {
  const { puedeInstalar, esIos, instalada, solicitarInstalacion } = useInstallPrompt();

  if (instalada) {
    return (
      <p className="text-sm text-muted flex items-center gap-2">
        <Smartphone className="h-4 w-4 text-primary-500" /> Ya tenés CobraYA instalada en este dispositivo.
      </p>
    );
  }

  if (esIos) {
    return (
      <p className="text-sm text-muted flex items-center gap-2">
        <Share className="h-4 w-4 flex-shrink-0" /> En iPhone/iPad: tocá <strong>Compartir</strong> y luego <strong>"Agregar a pantalla de inicio"</strong>.
      </p>
    );
  }

  if (!puedeInstalar) {
    return <p className="text-sm text-muted">Tu navegador todavía no ofreció la opción de instalar — probá recargar la página.</p>;
  }

  return (
    <button
      onClick={solicitarInstalacion}
      className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium transition-colors"
    >
      <Download className="h-4 w-4" />
      Instalar app
    </button>
  );
}

/** Aviso discreto y descartable (una vez por navegador) que aparece bajo el header
 * cuando el navegador ya ofreció el prompt nativo de instalación. */
export function InstallAppBanner() {
  const { puedeInstalar, solicitarInstalacion } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });

  if (!puedeInstalar || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // localStorage puede fallar en navegación privada — no es crítico, solo reaparece la próxima visita
    }
  };

  return (
    <div className="mx-4 md:mx-8 mb-2 flex items-center gap-2 rounded-lg bg-primary-500/10 border border-primary-500/20 px-4 py-2 text-sm text-primary-500 relative z-10">
      <Smartphone className="h-4 w-4 flex-shrink-0" />
      <span className="flex-1">Instalá CobraYA en tu celular para acceder directo, sin buscar el link.</span>
      <button onClick={solicitarInstalacion} className="font-medium underline hover:no-underline flex-shrink-0">
        Instalar
      </button>
      <button onClick={dismiss} className="flex-shrink-0 text-primary-500/70 hover:text-primary-500">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
