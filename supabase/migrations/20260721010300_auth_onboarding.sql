-- CobraYA: onboarding automático auth.users -> tenants/usuarios
--
-- Dos flujos posibles, distinguidos por raw_user_meta_data:
--   1) Autoregistro de un prestamista nuevo (Register.tsx): el front llama
--      supabase.auth.signUp({ email, password, options: { data: {
--        nombre_negocio, nombre_usuario } } }).
--      Este trigger crea el tenant y el usuario como 'owner'.
--   2) Alta de un cobrador invitado por el owner (fuera del MVP inicial, vía Admin
--      API desde una Edge Function con service_role): el metadata trae
--      { tenant_id, nombre_usuario }. Este trigger NO crea un tenant nuevo, solo
--      vincula al usuario como 'collector' del tenant existente.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id       uuid;
  v_nombre_negocio  text;
  v_nombre_usuario  text;
  v_invited_tenant  text;
  v_rol             public.rol_usuario;
begin
  v_nombre_negocio := new.raw_user_meta_data ->> 'nombre_negocio';
  v_nombre_usuario := coalesce(new.raw_user_meta_data ->> 'nombre_usuario', split_part(new.email, '@', 1));
  v_invited_tenant := new.raw_user_meta_data ->> 'tenant_id';

  if v_invited_tenant is not null then
    v_tenant_id := v_invited_tenant::uuid;
    v_rol := 'collector';
  else
    insert into public.tenants (nombre)
    values (coalesce(v_nombre_negocio, v_nombre_usuario || ' - CobraYA'))
    returning id into v_tenant_id;
    v_rol := 'owner';
  end if;

  insert into public.usuarios (id, tenant_id, rol, nombre, correo)
  values (new.id, v_tenant_id, v_rol, v_nombre_usuario, new.email);

  return new;
end;
$$;

comment on function public.handle_new_user() is 'Trigger de auth.users: crea tenant+usuario(owner) en autoregistro, o vincula usuario(collector) a un tenant existente cuando fue invitado con tenant_id en el metadata.';

create trigger trg_handle_new_user
  after insert on auth.users
  for each row execute function public.handle_new_user();
