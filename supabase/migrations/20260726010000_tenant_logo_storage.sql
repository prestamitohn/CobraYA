-- CobraYA: perfil de negocio completo — logo del tenant vía Supabase Storage
--
-- Agrega tenants.logo_url y crea el bucket público "logos" con políticas RLS sobre
-- storage.objects: cada tenant solo puede subir/reemplazar/borrar dentro de su propia
-- carpeta ({tenant_id}/...), y solo el owner. La lectura es pública (bucket public=true,
-- las URLs públicas de Storage bypassean RLS en el endpoint /object/public/), así que
-- no hace falta política de select para mostrar el logo sin autenticación.

alter table public.tenants add column logo_url text;

comment on column public.tenants.logo_url is 'URL pública del logo del negocio, subido al bucket de Storage "logos" bajo la carpeta {tenant_id}/.';

insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do nothing;

create policy logos_insert_owner on storage.objects
  for insert
  with check (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
    and public.current_rol() = 'owner'
  );

create policy logos_update_owner on storage.objects
  for update
  using (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
    and public.current_rol() = 'owner'
  );

create policy logos_delete_owner on storage.objects
  for delete
  using (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
    and public.current_rol() = 'owner'
  );
