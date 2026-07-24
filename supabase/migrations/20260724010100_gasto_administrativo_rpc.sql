-- crear_prestamo() cambia de firma (dos parámetros nuevos al final, con default null
-- para no romper nada) — Postgres no permite agregar parámetros a una función
-- existente vía CREATE OR REPLACE sin cambiar su firma, así que se recrea.

drop function public.crear_prestamo(
  uuid, numeric, integer, numeric, public.sistema_amortizacion, public.frecuencia_cobro,
  date, date, text, uuid, jsonb
);

create or replace function public.crear_prestamo(
  p_cliente_id                     uuid,
  p_monto_otorgado                 numeric,
  p_cantidad_cuotas                integer,
  p_tasa_interes                   numeric,
  p_sistema_amortizacion           public.sistema_amortizacion,
  p_frecuencia_cobro                public.frecuencia_cobro,
  p_fecha_otorgamiento              date,
  p_fecha_primer_vto                date,
  p_moneda                          text,
  p_cobrador_id                     uuid,
  p_cuotas                          jsonb, -- [{nro_cuota, monto, interes, capital, saldo_pendiente, fecha_vto}, ...]
  p_gasto_administrativo_monto      numeric default null,
  p_gasto_administrativo_frecuencia public.frecuencia_gasto_administrativo default null
)
returns uuid
language plpgsql
as $$
declare
  v_tenant_id       uuid := public.current_tenant_id();
  v_prestamo_id     uuid;
  v_fecha_fin       date;
  v_gasto_fecha     date;
  v_gasto_numero    integer := 1;
  v_gasto_paso      interval;
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

  if p_gasto_administrativo_monto is not null and p_gasto_administrativo_monto <= 0 then
    raise exception 'El monto del gasto administrativo debe ser mayor a cero';
  end if;

  select max((c ->> 'fecha_vto')::date) into v_fecha_fin
  from jsonb_array_elements(p_cuotas) as c;

  insert into public.prestamos (
    tenant_id, cliente_id, cobrador_id, monto_otorgado, saldo_restante, cantidad_cuotas,
    tasa_interes, sistema_amortizacion, frecuencia_cobro, estado,
    fecha_otorgamiento, fecha_primer_vto, fecha_fin_estimada, moneda,
    gasto_administrativo_monto, gasto_administrativo_frecuencia
  ) values (
    v_tenant_id, p_cliente_id, p_cobrador_id, p_monto_otorgado, p_monto_otorgado, p_cantidad_cuotas,
    p_tasa_interes, p_sistema_amortizacion, p_frecuencia_cobro, 'activo',
    p_fecha_otorgamiento, p_fecha_primer_vto, v_fecha_fin, coalesce(p_moneda, 'HNL'),
    p_gasto_administrativo_monto, p_gasto_administrativo_frecuencia
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

  -- Cronograma del gasto administrativo: propio, independiente de la frecuencia de
  -- cobro del préstamo, vigente desde el otorgamiento hasta la fecha fin estimada.
  if p_gasto_administrativo_monto is not null then
    v_gasto_paso := case p_gasto_administrativo_frecuencia
                      when 'semanal' then interval '7 days'
                      else interval '1 month'
                    end;
    v_gasto_fecha := p_fecha_otorgamiento + v_gasto_paso;

    while v_gasto_fecha <= v_fecha_fin loop
      insert into public.gastos_administrativos (
        tenant_id, prestamo_id, numero, monto, saldo_pendiente, fecha_vto, estado
      ) values (
        v_tenant_id, v_prestamo_id, v_gasto_numero, p_gasto_administrativo_monto,
        p_gasto_administrativo_monto, v_gasto_fecha, 'pendiente'
      );
      v_gasto_numero := v_gasto_numero + 1;
      v_gasto_fecha := v_gasto_fecha + v_gasto_paso;
    end loop;
  end if;

  return v_prestamo_id;
end;
$$;

comment on function public.crear_prestamo is 'Crea un préstamo, su cronograma de cuotas y (opcional) su cronograma de gastos administrativos, en una sola transacción. SECURITY INVOKER: se apoya en RLS para la autorización.';

grant execute on function public.crear_prestamo(
  uuid, numeric, integer, numeric, public.sistema_amortizacion, public.frecuencia_cobro,
  date, date, text, uuid, jsonb, numeric, public.frecuencia_gasto_administrativo
) to authenticated;

-- ---------------------------------------------------------------------------
-- registrar_pago_gasto_administrativo(): análogo a registrar_pago() pero para el
-- cronograma de gastos administrativos. No toca prestamos.saldo_restante ni el estado
-- del préstamo — es un cargo aparte del capital+interés, no participa en cuándo el
-- préstamo se da por finalizado.
-- ---------------------------------------------------------------------------

create or replace function public.registrar_pago_gasto_administrativo(
  p_gasto_administrativo_id  uuid,
  p_medio_pago_id            smallint,
  p_monto                    numeric,
  p_descuento                numeric default 0,
  p_recargo                  numeric default 0,
  p_observaciones            text default null,
  p_fecha_pago               date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id           uuid := public.current_tenant_id();
  v_rol                 public.rol_usuario := public.current_rol();
  v_gasto               public.gastos_administrativos%rowtype;
  v_prestamo            public.prestamos%rowtype;
  v_saldo_actual        numeric;
  v_monto_amortizado    numeric;
  v_nuevo_saldo         numeric;
  v_pago_id             uuid;
begin
  if v_tenant_id is null then
    raise exception 'Usuario sin tenant asignado';
  end if;

  select * into v_gasto from public.gastos_administrativos
   where id = p_gasto_administrativo_id and tenant_id = v_tenant_id
   for update;

  if not found then
    raise exception 'Gasto administrativo % no encontrado', p_gasto_administrativo_id;
  end if;

  select * into v_prestamo from public.prestamos where id = v_gasto.prestamo_id;

  if v_rol = 'collector' and v_prestamo.cobrador_id is distinct from auth.uid() then
    raise exception 'No autorizado para registrar pagos de este préstamo';
  end if;

  if v_gasto.estado = 'saldada' then
    raise exception 'El gasto administrativo ya está saldado';
  end if;

  if p_monto <= 0 then
    raise exception 'El monto del pago debe ser mayor a cero';
  end if;

  v_saldo_actual := coalesce(v_gasto.saldo_pendiente, v_gasto.monto);
  v_monto_amortizado := p_monto + p_descuento - p_recargo;

  if v_monto_amortizado <= 0 then
    raise exception 'El monto neto del pago (monto + descuento - recargo) debe ser mayor a cero';
  end if;

  if v_monto_amortizado > v_saldo_actual then
    raise exception 'El pago excede el saldo pendiente del gasto administrativo (saldo: %, neto: %)',
      v_saldo_actual, v_monto_amortizado;
  end if;

  v_nuevo_saldo := greatest(v_saldo_actual - v_monto_amortizado, 0);

  update public.gastos_administrativos
     set saldo_pendiente = v_nuevo_saldo,
         estado = case when v_nuevo_saldo <= 0 then 'saldada'::public.estado_cuota
                        else 'pendiente'::public.estado_cuota end
   where id = v_gasto.id;

  insert into public.pagos (
    tenant_id, gasto_administrativo_id, cobrador_id, fecha_pago, medio_pago_id,
    monto, descuento, recargo, saldo_snapshot, observaciones, estado
  ) values (
    v_tenant_id, v_gasto.id, auth.uid(), p_fecha_pago, p_medio_pago_id,
    p_monto, p_descuento, p_recargo, v_nuevo_saldo, p_observaciones, 'aprobado'
  ) returning id into v_pago_id;

  return v_pago_id;
end;
$$;

comment on function public.registrar_pago_gasto_administrativo is 'Registra un pago sobre un cargo de gasto administrativo. No afecta saldo_restante ni estado del préstamo (es un cobro aparte del capital+interés).';

grant execute on function public.registrar_pago_gasto_administrativo(uuid, smallint, numeric, numeric, numeric, text, date) to authenticated;

-- actualizar_cuotas_vencidas() ahora también vence los gastos administrativos —
-- mismo criterio (pendiente + fecha_vto pasada), mismo punto de entrada que ya llama
-- el front (dashboard) y pg_cron.
create or replace function public.actualizar_cuotas_vencidas()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.cuotas
     set estado = 'vencida'
   where estado = 'pendiente'
     and fecha_vto < current_date;

  get diagnostics v_count = row_count;

  update public.gastos_administrativos
     set estado = 'vencida'
   where estado = 'pendiente'
     and fecha_vto < current_date;

  return v_count;
end;
$$;
