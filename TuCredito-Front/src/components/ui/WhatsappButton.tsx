import { MessageCircle } from 'lucide-react';
import { buildWhatsappLink } from '../../utils/whatsapp';

interface WhatsappButtonProps {
  telefono: string | null | undefined;
  mensaje: string;
  label?: string;
  className?: string;
}

/** Botón que abre WhatsApp con un mensaje prellenado para notificar al socio/cliente
 * (abono, pago, depósito, etc.). Ver utils/whatsapp.ts sobre el alcance real (abre
 * WhatsApp, no envía solo). Se deshabilita si el registro no tiene teléfono. */
export function WhatsappButton({ telefono, mensaje, label = 'WhatsApp', className }: WhatsappButtonProps) {
  const link = buildWhatsappLink(telefono, mensaje);

  const baseClass = className ?? 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors';

  if (!link) {
    return (
      <span
        title="Sin teléfono registrado"
        className={`${baseClass} bg-surfaceHighlight text-muted cursor-not-allowed opacity-60`}
      >
        <MessageCircle className="h-3.5 w-3.5" />
        {label}
      </span>
    );
  }

  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      title="Enviar notificación por WhatsApp"
      className={`${baseClass} bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20`}
    >
      <MessageCircle className="h-3.5 w-3.5" />
      {label}
    </a>
  );
}
