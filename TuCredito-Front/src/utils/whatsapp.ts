/**
 * Enlace wa.me con mensaje prellenado — abre WhatsApp (app o web) con el texto listo,
 * el usuario solo tiene que darle "Enviar". No es un envío automático real: eso
 * requiere WhatsApp Business API con aprobación de Meta (proceso de negocio, no algo
 * que se pueda activar solo con código) — este es el patrón estándar y gratuito que
 * usan los negocios chicos para notificar por WhatsApp sin esa infraestructura.
 *
 * Honduras: números locales son 8 dígitos; wa.me necesita el número completo con
 * código de país (504) y sin signos.
 */
export function buildWhatsappLink(telefono: string | null | undefined, mensaje: string): string | null {
  if (!telefono) return null;
  const soloDigitos = telefono.replace(/\D/g, '');
  if (soloDigitos.length < 8) return null;
  const numeroConCodigo = soloDigitos.length === 8 ? `504${soloDigitos}` : soloDigitos;
  return `https://wa.me/${numeroConCodigo}?text=${encodeURIComponent(mensaje)}`;
}
