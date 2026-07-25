-- BUG CRÍTICO encontrado al probar gasto_administrativo 'por_cuota': crear_prestamo()
-- sembraba cuotas.saldo_pendiente con el campo "saldo_pendiente" que manda la Edge
-- Function, que en realidad es SimulacionResultado.detalleCuotas[].saldoRestante — el
-- saldo restante del PRÉSTAMO COMPLETO después de esa cuota (útil para la tabla de
-- simulación en el front), no cuánto falta pagar de ESA cuota puntual.
--
-- Efecto real: un cliente que paga el monto exacto de su cuota queda con
-- saldo_pendiente > 0 y estado 'pendiente' — nunca se marca 'saldada' pagando lo que
-- realmente debía, porque el número de partida ya estaba inflado con deuda de cuotas
-- futuras.
--
-- Fix: saldo_pendiente se siembra desde el MISMO monto de la cuota (+ gasto
-- administrativo si aplica 'por_cuota'), no desde un campo separado del JSON — así
-- monto y saldo_pendiente nunca pueden desincronizarse por este motivo de nuevo.

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
  v_gasto_por_cuota numeric := coalesce(
    case when p_gasto_administrativo_frecuencia = 'por_cuota' then p_gasto_administrativo_monto else null end,
    0
  );
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
    (c ->> 'monto')::numeric + v_gasto_por_cuota,
    (c ->> 'interes')::numeric,
    (c ->> 'capital')::numeric,
    (c ->> 'monto')::numeric + v_gasto_por_cuota, -- = monto de ESTA cuota, no el saldo del préstamo
    (c ->> 'fecha_vto')::date,
    'pendiente'
  from jsonb_array_elements(p_cuotas) as c;

  if p_gasto_administrativo_monto is not null and p_gasto_administrativo_frecuencia <> 'por_cuota' then
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
