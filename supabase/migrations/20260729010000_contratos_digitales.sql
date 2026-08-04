-- CobraYA: contrato digital de préstamo (firma en pantalla + PDF guardado en el
-- expediente del cliente/préstamo).
--
-- La tabla public.documentos ya existía (entidad_tipo/entidad_id genérico, pensada
-- justo para esto). Lo único que faltaba era dónde guardar el archivo: un bucket de
-- Storage privado (a diferencia de "logos", estos son documentos legales con datos del
-- cliente, no deben ser públicos). Igual que con el logo, la subida/lectura pasa por
-- una Edge Function con service_role — ya se verificó en este proyecto que la RLS
-- directa sobre storage.objects no resuelve auth.uid() (ver migración
-- 20260726020000_logo_storage_fix.sql), así que ni se intenta acá.

insert into storage.buckets (id, name, public)
values ('documentos', 'documentos', false)
on conflict (id) do nothing;

-- Sin policies sobre storage.objects para este bucket: como es privado y todo el
-- acceso pasa por la Edge Function (service_role), el default-deny de RLS es
-- exactamente lo que se quiere para cualquier acceso directo vía REST.
