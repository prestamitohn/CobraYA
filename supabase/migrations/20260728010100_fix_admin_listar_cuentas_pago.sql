-- Fix: admin_listar_cuentas_pago() fallaba con "column reference id is ambiguous" —
-- el OUT parameter `id` de la función (plpgsql sí crea variables reales para los OUT
-- params, a diferencia de las funciones `language sql`) chocaba con la columna `id` de
-- platform_payment_accounts al no estar calificada con alias. Detectado en verificación
-- en vivo contra el proyecto real.

create or replace function public.admin_listar_cuentas_pago()
returns table (
  id                    uuid,
  tipo                  public.tipo_cuenta_pago,
  nombre_beneficiario   text,
  banco                 text,
  numero_cuenta         text,
  tipo_cuenta_bancaria  text,
  telefono              text,
  instrucciones         text,
  activo                boolean,
  orden                 integer,
  created_at            timestamptz
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
  select p.id, p.tipo, p.nombre_beneficiario, p.banco, p.numero_cuenta, p.tipo_cuenta_bancaria, p.telefono, p.instrucciones, p.activo, p.orden, p.created_at
  from public.platform_payment_accounts p
  order by p.orden, p.created_at;
end;
$$;

grant execute on function public.admin_listar_cuentas_pago() to authenticated;
