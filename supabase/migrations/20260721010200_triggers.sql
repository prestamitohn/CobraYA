-- CobraYA: triggers de updated_at y de auditoría (reemplazan al AuditInterceptor de EF Core)

-- ---------------------------------------------------------------------------
-- updated_at genérico
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_tenants_updated_at
  before update on public.tenants
  for each row execute function public.set_updated_at();

create trigger trg_usuarios_updated_at
  before update on public.usuarios
  for each row execute function public.set_updated_at();

create trigger trg_clientes_updated_at
  before update on public.clientes
  for each row execute function public.set_updated_at();

create trigger trg_garantes_updated_at
  before update on public.garantes
  for each row execute function public.set_updated_at();

create trigger trg_prestamos_updated_at
  before update on public.prestamos
  for each row execute function public.set_updated_at();

create trigger trg_cuotas_updated_at
  before update on public.cuotas
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Auditoría (equivalente a AuditInterceptor.cs, que solo cubría
-- Prestamo/Pago/Prestatario/Garante)
-- ---------------------------------------------------------------------------

create or replace function public.audit_trigger_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_entity_id text;
  v_changes jsonb;
begin
  if TG_OP = 'DELETE' then
    v_tenant_id := OLD.tenant_id;
    v_entity_id := OLD.id::text;
    v_changes := to_jsonb(OLD);
  elsif TG_OP = 'UPDATE' then
    v_tenant_id := NEW.tenant_id;
    v_entity_id := NEW.id::text;
    v_changes := jsonb_build_object('before', to_jsonb(OLD), 'after', to_jsonb(NEW));
  else
    v_tenant_id := NEW.tenant_id;
    v_entity_id := NEW.id::text;
    v_changes := to_jsonb(NEW);
  end if;

  insert into public.audit_logs (tenant_id, entity_name, action, entity_id, changes, user_id)
  values (v_tenant_id, TG_TABLE_NAME, TG_OP, v_entity_id, v_changes, auth.uid());

  if TG_OP = 'DELETE' then
    return OLD;
  end if;
  return NEW;
end;
$$;

comment on function public.audit_trigger_fn() is 'security definer: inserta en audit_logs saltándose su propia RLS (que es solo-lectura para authenticated).';

create trigger trg_audit_prestamos
  after insert or update or delete on public.prestamos
  for each row execute function public.audit_trigger_fn();

create trigger trg_audit_pagos
  after insert or update or delete on public.pagos
  for each row execute function public.audit_trigger_fn();

create trigger trg_audit_clientes
  after insert or update or delete on public.clientes
  for each row execute function public.audit_trigger_fn();

create trigger trg_audit_garantes
  after insert or update or delete on public.garantes
  for each row execute function public.audit_trigger_fn();
