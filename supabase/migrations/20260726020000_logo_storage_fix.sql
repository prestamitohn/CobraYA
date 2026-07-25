-- CobraYA: corrige el enfoque de subida de logo.
--
-- Storage RLS no resuelve auth.uid() correctamente en este proyecto — verificado
-- empíricamente subiendo un archivo autenticado como owner contra una policy trivial
-- `auth.uid() is not null`, que igual rechazó el insert. Por eso la subida/borrado de
-- logo ahora pasa por la Edge Function subir-logo (service_role, con su propia
-- verificación de que el caller es el owner del tenant vía RPC/tabla usuarios).
--
-- Se eliminan las policies de insert/update/delete sobre storage.objects: sin ellas,
-- RLS deniega por defecto a cualquier rol que no sea service_role (que igual bypassea
-- RLS), que es exactamente el comportamiento que queremos ahora que solo la Edge
-- Function escribe en este bucket. La lectura pública sigue funcionando igual, ya que
-- el bucket "logos" tiene public=true (las URLs públicas de Storage no pasan por RLS).

drop policy if exists logos_insert_owner on storage.objects;
drop policy if exists logos_update_owner on storage.objects;
drop policy if exists logos_delete_owner on storage.objects;
