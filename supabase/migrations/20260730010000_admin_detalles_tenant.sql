-- CobraYA: el panel de superadmin necesita más detalle por tenant — nombre y correo
-- del dueño (usuarios.rol = 'owner'), para poder contactarlo (ej. confirmar un pago
-- manual). Cambia el tipo de retorno, así que hay que recrear la función.

drop function public.admin_list_tenants();

create or replace function public.admin_list_tenants()
returns table (
  id                    uuid,
  nombre                text,
  rtn                   text,
  moneda                text,
  estado_suscripcion    public.estado_suscripcion,
  fecha_inicio          date,
  created_at            timestamptz,
  propietario_nombre    text,
  propietario_correo    text,
  cantidad_usuarios     bigint,
  cantidad_clientes     bigint,
  cantidad_prestamos    bigint,
  monto_otorgado_total  numeric
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_superadmin() then
    raise exception 'No autorizado';
  end if;

  return query
  select
    t.id, t.nombre, t.rtn, t.moneda, t.estado_suscripcion, t.fecha_inicio, t.created_at,
    (select u.nombre from public.usuarios u where u.tenant_id = t.id and u.rol = 'owner' order by u.created_at limit 1),
    (select u.correo from public.usuarios u where u.tenant_id = t.id and u.rol = 'owner' order by u.created_at limit 1),
    (select count(*) from public.usuarios u where u.tenant_id = t.id),
    (select count(*) from public.clientes c where c.tenant_id = t.id),
    (select count(*) from public.prestamos p where p.tenant_id = t.id and p.estado <> 'eliminado'),
    (select coalesce(sum(p.monto_otorgado), 0) from public.prestamos p where p.tenant_id = t.id and p.estado <> 'eliminado')
  from public.tenants t
  order by t.created_at desc;
end;
$$;

comment on function public.admin_list_tenants is 'Lista todos los tenants de la plataforma con conteos básicos y datos de contacto del dueño, solo para superadmin.';

grant execute on function public.admin_list_tenants() to authenticated;
