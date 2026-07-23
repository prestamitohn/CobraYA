-- CobraYA: funciones de negocio transaccionales
--
-- crear_prestamo(): SECURITY INVOKER — corre con los permisos del usuario que llama,
-- así que las policies RLS de prestamos/cuotas (prestamos_owner_all, cuotas_owner_all)
-- ya bastan para autorizar el insert; la función solo aporta atomicidad (préstamo +
-- cronograma completo en una sola transacción) y mensajes de error más claros.
--
-- registrar_pago(): SECURITY DEFINER — a diferencia de crear_prestamo, el cobrador de
-- campo NO tiene policy de insert/update sobre pagos/cuotas/prestamos (solo select de
-- lo que tiene asignado), así que esta función necesita saltarse RLS. Por eso hace ella
-- misma la validación de autorización (tenant + "si es collector, el préstamo debe
-- estar asignado a este usuario") que en las otras tablas hace RLS directamente.
-- Reproduce PagoService.NewPago del .NET original: monto_amortizado = monto+descuento-
-- recargo, no puede exceder el saldo pendiente de la cuota, y actualiza en cascada el
-- estado de la cuota y del préstamo (saldada/pendiente, activo/finalizado).

create or replace function public.crear_prestamo(
  p_cliente_id           uuid,
  p_monto_otorgado       numeric,
  p_cantidad_cuotas      integer,
  p_tasa_interes         numeric,
  p_sistema_amortizacion public.sistema_amortizacion,
  p_frecuencia_cobro     public.frecuencia_cobro,
  p_fecha_otorgamiento   date,
  p_fecha_primer_vto     date,
  p_moneda               text,
  p_cobrador_id          uuid,
  p_cuotas               jsonb -- [{nro_cuota, monto, interes, capital, saldo_pendiente, fecha_vto}, ...]
)
returns uuid
language plpgsql
as $$
declare
  v_tenant_id     uuid := public.current_tenant_id();
  v_prestamo_id   uuid;
  v_fecha_fin     date;
begin
  if v_tenant_id is null then
    raise exception 'Usuario sin tenant asignado';
  end if;

  if public.current_rol() <> 'owner' then
    raise exception 'Solo el dueño del negocio puede crear préstamos';
  end if;

  if not exists (
    select 1 from public.clientes where id = p_cliente_id and tenant_id = v_tenant_id
  ) then
    raise exception 'El cliente no pertenece a este tenant';
  end if;

  if p_fecha_primer_vto <= p_fecha_otorgamiento then
    raise exception 'La fecha del primer vencimiento debe ser posterior al otorgamiento';
  end if;

  if jsonb_array_length(p_cuotas) <> p_cantidad_cuotas then
    raise exception 'La cantidad de cuotas del cronograma (%) no coincide con cantidad_cuotas (%)',
      jsonb_array_length(p_cuotas), p_cantidad_cuotas;
  end if;

  select max((c ->> 'fecha_vto')::date) into v_fecha_fin
  from jsonb_array_elements(p_cuotas) as c;

  insert into public.prestamos (
    tenant_id, cliente_id, cobrador_id, monto_otorgado, saldo_restante, cantidad_cuotas,
    tasa_interes, sistema_amortizacion, frecuencia_cobro, estado,
    fecha_otorgamiento, fecha_primer_vto, fecha_fin_estimada, moneda
  ) values (
    v_tenant_id, p_cliente_id, p_cobrador_id, p_monto_otorgado, p_monto_otorgado, p_cantidad_cuotas,
    p_tasa_interes, p_sistema_amortizacion, p_frecuencia_cobro, 'activo',
    p_fecha_otorgamiento, p_fecha_primer_vto, v_fecha_fin, coalesce(p_moneda, 'HNL')
  ) returning id into v_prestamo_id;

  insert into public.cuotas (
    tenant_id, prestamo_id, nro_cuota, monto, interes, capital, saldo_pendiente, fecha_vto, estado
  )
  select
    v_tenant_id,
    v_prestamo_id,
    (c ->> 'nro_cuota')::integer,
    (c ->> 'monto')::numeric,
    (c ->> 'interes')::numeric,
    (c ->> 'capital')::numeric,
    (c ->> 'saldo_pendiente')::numeric,
    (c ->> 'fecha_vto')::date,
    'pendiente'
  from jsonb_array_elements(p_cuotas) as c;

  return v_prestamo_id;
end;
$$;

comment on function public.crear_prestamo is 'Crea un préstamo y su cronograma de cuotas (calculado por el front/Edge Function con supabase/functions/_shared/amortizacion.ts) en una sola transacción. SECURITY INVOKER: se apoya en RLS para la autorización.';

grant execute on function public.crear_prestamo(
  uuid, numeric, integer, numeric, public.sistema_amortizacion, public.frecuencia_cobro,
  date, date, text, uuid, jsonb
) to authenticated;

-- ---------------------------------------------------------------------------

create or replace function public.registrar_pago(
  p_cuota_id        uuid,
  p_medio_pago_id   smallint,
  p_monto           numeric,
  p_descuento       numeric default 0,
  p_recargo         numeric default 0,
  p_observaciones   text default null,
  p_fecha_pago      date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id           uuid := public.current_tenant_id();
  v_rol                 public.rol_usuario := public.current_rol();
  v_cuota               public.cuotas%rowtype;
  v_prestamo            public.prestamos%rowtype;
  v_saldo_actual_cuota  numeric;
  v_monto_amortizado    numeric;
  v_nuevo_saldo_cuota   numeric;
  v_nuevo_saldo_prestamo numeric;
  v_todas_saldadas      boolean;
  v_pago_id             uuid;
begin
  if v_tenant_id is null then
    raise exception 'Usuario sin tenant asignado';
  end if;

  select * into v_cuota from public.cuotas
   where id = p_cuota_id and tenant_id = v_tenant_id
   for update;

  if not found then
    raise exception 'Cuota % no encontrada', p_cuota_id;
  end if;

  select * into v_prestamo from public.prestamos where id = v_cuota.prestamo_id for update;

  if v_rol = 'collector' and v_prestamo.cobrador_id is distinct from auth.uid() then
    raise exception 'No autorizado para registrar pagos de este préstamo';
  end if;

  if v_cuota.estado = 'saldada' then
    raise exception 'La cuota ya está saldada';
  end if;

  if v_prestamo.estado = 'eliminado' then
    raise exception 'El préstamo está eliminado';
  end if;

  if p_monto <= 0 then
    raise exception 'El monto del pago debe ser mayor a cero';
  end if;

  v_saldo_actual_cuota := coalesce(v_cuota.saldo_pendiente, v_cuota.monto);
  v_monto_amortizado := p_monto + p_descuento - p_recargo;

  if v_monto_amortizado <= 0 then
    raise exception 'El monto neto del pago (monto + descuento - recargo) debe ser mayor a cero';
  end if;

  if v_monto_amortizado > v_saldo_actual_cuota then
    raise exception 'El pago excede el saldo pendiente de la cuota (saldo: %, neto: %)',
      v_saldo_actual_cuota, v_monto_amortizado;
  end if;

  v_nuevo_saldo_cuota := greatest(v_saldo_actual_cuota - v_monto_amortizado, 0);

  update public.cuotas
     set saldo_pendiente = v_nuevo_saldo_cuota,
         estado = case when v_nuevo_saldo_cuota <= 0 then 'saldada'::public.estado_cuota
                        else 'pendiente'::public.estado_cuota end
   where id = v_cuota.id;

  select not exists (
    select 1 from public.cuotas where prestamo_id = v_prestamo.id and estado <> 'saldada'
  ) into v_todas_saldadas;

  v_nuevo_saldo_prestamo := greatest(v_prestamo.saldo_restante - v_monto_amortizado, 0);

  update public.prestamos
     set saldo_restante = v_nuevo_saldo_prestamo,
         estado = case
                    when v_todas_saldadas then 'finalizado'::public.estado_prestamo
                    when v_prestamo.estado = 'finalizado' then 'activo'::public.estado_prestamo
                    else v_prestamo.estado
                  end
   where id = v_prestamo.id;

  insert into public.pagos (
    tenant_id, cuota_id, cobrador_id, fecha_pago, medio_pago_id,
    monto, descuento, recargo, saldo_snapshot, observaciones, estado
  ) values (
    v_tenant_id, v_cuota.id, auth.uid(), p_fecha_pago, p_medio_pago_id,
    p_monto, p_descuento, p_recargo, v_nuevo_saldo_cuota, p_observaciones, 'aprobado'
  ) returning id into v_pago_id;

  return v_pago_id;
end;
$$;

comment on function public.registrar_pago is 'Registra un pago (parcial o total) sobre una cuota y actualiza en cascada cuota+préstamo. SECURITY DEFINER: el cobrador no tiene permisos RLS directos de escritura, la autorización la hace esta función (tenant + asignación de cobrador_id).';

grant execute on function public.registrar_pago(uuid, smallint, numeric, numeric, numeric, text, date) to authenticated;
