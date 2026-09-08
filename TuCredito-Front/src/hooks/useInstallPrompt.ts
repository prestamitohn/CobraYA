import { useEffect, useState } from 'react';

/** Evento no estándar (Chrome/Edge/Android) — TS no lo trae en lib.dom todavía. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone(): boolean {
  // navigator.standalone es específico de iOS Safari, no está en lib.dom.
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.('(display-mode: standalone)').matches || nav.standalone === true;
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

/** Captura el prompt de instalación nativo (Chrome/Edge/Android) y expone cómo
 * dispararlo. iOS Safari no soporta beforeinstallprompt — ahí solo se puede indicar
 * "Compartir → Agregar a inicio", por eso `puedeInstalar` distingue de `esIos`. */
export function useInstallPrompt() {
  const [deferredEvent, setDeferredEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [instalada, setInstalada] = useState(isStandalone());

  useEffect(() => {
    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalada(true);
      setDeferredEvent(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const solicitarInstalacion = async () => {
    if (!deferredEvent) return;
    await deferredEvent.prompt();
    await deferredEvent.userChoice;
    setDeferredEvent(null);
  };

  return {
    /** true solo cuando el navegador ofreció el prompt nativo (Chrome/Edge/Android). */
    puedeInstalar: !!deferredEvent && !instalada,
    /** iOS nunca dispara beforeinstallprompt — mostrar instrucciones manuales en vez del botón. */
    esIos: isIos() && !instalada,
    instalada,
    solicitarInstalacion,
  };
}
