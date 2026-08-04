-- CobraYA: notifica por push a todos los superadmins cuando se registra un tenant
-- nuevo (autoregistro normal o alta manual vía admin-crear-tenant — ambos caminos
-- terminan insertando una fila en public.tenants, así que basta un trigger ahí).

create or replace function public.notificar_nuevo_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url := 'https://lmmnjmucukbmyvacndst.supabase.co/functions/v1/enviar-notificaciones-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxtbW5qbXVjdWtibXl2YWNuZHN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2NzMwMjEsImV4cCI6MjEwMDI0OTAyMX0.--J3qt2KmrBR62d9jSf9xhEAgwjjEPdDGuZnHFtq1Xg',
      'x-cron-secret', 'f50625ed08d0603553972b80ec83e7247c9e5f33330272ac16aef952c2a258c1'
    ),
    body := jsonb_build_object('action', 'nuevo_tenant', 'nombreNegocio', new.nombre)
  );
  return new;
end;
$$;

comment on function public.notificar_nuevo_tenant is 'Avisa por push a los superadmins con notificaciones activas cuando se crea un tenant nuevo.';

create trigger trg_notificar_nuevo_tenant
  after insert on public.tenants
  for each row execute function public.notificar_nuevo_tenant();
