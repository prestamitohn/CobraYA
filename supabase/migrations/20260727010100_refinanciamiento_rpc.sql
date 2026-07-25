-- CobraYA: refinanciamiento de préstamos
--
-- Refinanciar = tomar el saldo pendiente de un préstamo activo (+ un monto adicional
-- opcional) y convertirlo en el capital de un préstamo nuevo, con su propio
-- cronograma/tasa/frecuencia. El préstamo original pasa a estado 'refinanciado' y sus
-- cuotas todavía pendientes/vencidas pasan a 'reprogramada' (ya no se cobran por esa
-- vía — el dinero que representan ahora vive en el préstamo nuevo). El préstamo nuevo
-- queda enlazado al original vía refinanciado_de_id, para poder navegar en ambos
-- sentidos desde la UI y para que quede como historial de refinanciaciones filtrando
-- prestamos por estado = 'refinanciado' (no hace falta una tabla aparte).

alter table public.prestamos
  add column refinanciado_de_id      uuid references public.prestamos (id),
  add column motivo_refinanciamiento text;

comment on column public.prestamos.refinanciado_de_id is 'Si este préstamo nació de un refinanciamiento, apunta al préstamo original que reemplazó.';

create index idx_prestamos_refinanciado_de on public.prestamos (refinanciado_de_id);

-- ---------------------------------------------------------------------------
-- crear_prestamo(): agrega p_refinanciado_de_id al final (default null) — mismo
-- patrón ya usado para las extensiones anteriores (gasto administrativo, multa).
-- ---------------------------------------------------------------------------

drop function public.crear_prestamo(
  uuid, numeric, integer, numeric, public.sistema_amortizacion, public.frecuencia_cobro,
  date, date, text, uuid, jsonb, numeric, public.frecuencia_gasto_administrativo, numeric
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
  p_cuotas                          jsonb,
  p_gasto_administrativo_monto      numeric default null,
  p_gasto_administrativo_frecuencia public.frecuencia_gasto_administrativo default null,
  p_multa_por_atraso_monto          numeric default null,
  p_refinanciado_de_id              uuid default null
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

  if p_multa_por_atraso_monto is not null and p_multa_por_atraso_monto <= 0 then
    raise exception 'El monto de la multa por atraso debe ser mayor a cero';
  end if;

  if p_refinanciado_de_id is not null and not exists (
    select 1 from public.prestamos where id = p_refinanciado_de_id and tenant_id = v_tenant_id
  ) then
    raise exception 'El préstamo original a refinanciar no pertenece a este tenant';
  end if;

  select max((c ->> 'fecha_vto')::date) into v_fecha_fin
  from jsonb_array_elements(p_cuotas) as c;

  insert into public.prestamos (
    tenant_id, cliente_id, cobrador_id, monto_otorgado, saldo_restante, cantidad_cuotas,
    tasa_interes, sistema_amortizacion, frecuencia_cobro, estado,
    fecha_otorgamiento, fecha_primer_vto, fecha_fin_estimada, moneda,
    gasto_administrativo_monto, gasto_administrativo_frecuencia, multa_por_atraso_monto,
    refinanciado_de_id
  ) values (
    v_tenant_id, p_cliente_id, p_cobrador_id, p_monto_otorgado, p_monto_otorgado, p_cantidad_cuotas,
    p_tasa_interes, p_sistema_amortizacion, p_frecuencia_cobro, 'activo',
    p_fecha_otorgamiento, p_fecha_primer_vto, v_fecha_fin, coalesce(p_moneda, 'HNL'),
    p_gasto_administrativo_monto, p_gasto_administrativo_frecuencia, p_multa_por_atraso_monto,
    p_refinanciado_de_id
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
    (c ->> 'monto')::numeric + v_gasto_por_cuota,
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

grant execute on function public.crear_prestamo(
  uuid, numeric, integer, numeric, public.sistema_amortizacion, public.frecuencia_cobro,
  date, date, text, uuid, jsonb, numeric, public.frecuencia_gasto_administrativo, numeric, uuid
) to authenticated;

-- ---------------------------------------------------------------------------
-- refinanciar_prestamo(): cierra el préstamo original y crea el nuevo, atómicamente.
-- ---------------------------------------------------------------------------

create or replace function public.refinanciar_prestamo(
  p_prestamo_original_id           uuid,
  p_monto_adicional                numeric,
  p_cantidad_cuotas                integer,
  p_tasa_interes                   numeric,
  p_sistema_amortizacion           public.sistema_amortizacion,
  p_frecuencia_cobro                public.frecuencia_cobro,
  p_fecha_otorgamiento              date,
  p_fecha_primer_vto                date,
  p_cuotas                          jsonb,
  p_moneda                          text default null,
  p_cobrador_id                     uuid default null,
  p_gasto_administrativo_monto      numeric default null,
  p_gasto_administrativo_frecuencia public.frecuencia_gasto_administrativo default null,
  p_multa_por_atraso_monto          numeric default null,
  p_motivo                          text default null
)
returns uuid
language plpgsql
as $$
declare
  v_tenant_id    uuid := public.current_tenant_id();
  v_original     public.prestamos%rowtype;
  v_monto_nuevo  numeric;
  v_nuevo_id     uuid;
begin
  if v_tenant_id is null then
    raise exception 'Usuario sin tenant asignado';
  end if;

  if public.current_rol() <> 'owner' then
    raise exception 'Solo el dueño del negocio puede refinanciar préstamos';
  end if;

  select * into v_original
  from public.prestamos
  where id = p_prestamo_original_id and tenant_id = v_tenant_id
  for update;

  if not found then
    raise exception 'Préstamo original no encontrado';
  end if;

  if v_original.estado <> 'activo' then
    raise exception 'Solo se pueden refinanciar préstamos activos';
  end if;

  if coalesce(p_monto_adicional, 0) < 0 then
    raise exception 'El monto adicional no puede ser negativo';
  end if;

  v_monto_nuevo := v_original.saldo_restante + coalesce(p_monto_adicional, 0);

  if v_monto_nuevo <= 0 then
    raise exception 'El monto a refinanciar debe ser mayor a cero (el préstamo original no tiene saldo pendiente)';
  end if;

  update public.cuotas
  set estado = 'reprogramada'
  where prestamo_id = v_original.id and estado in ('pendiente', 'vencida');

  update public.prestamos
  set estado = 'refinanciado',
      motivo_refinanciamiento = p_motivo,
      updated_at = now()
  where id = v_original.id;

  v_nuevo_id := public.crear_prestamo(
    p_cliente_id                     => v_original.cliente_id,
    p_monto_otorgado                 => v_monto_nuevo,
    p_cantidad_cuotas                => p_cantidad_cuotas,
    p_tasa_interes                   => p_tasa_interes,
    p_sistema_amortizacion           => p_sistema_amortizacion,
    p_frecuencia_cobro                => p_frecuencia_cobro,
    p_fecha_otorgamiento              => p_fecha_otorgamiento,
    p_fecha_primer_vto                => p_fecha_primer_vto,
    p_moneda                          => coalesce(p_moneda, v_original.moneda),
    p_cobrador_id                     => coalesce(p_cobrador_id, v_original.cobrador_id),
    p_cuotas                          => p_cuotas,
    p_gasto_administrativo_monto      => p_gasto_administrativo_monto,
    p_gasto_administrativo_frecuencia => p_gasto_administrativo_frecuencia,
    p_multa_por_atraso_monto          => p_multa_por_atraso_monto,
    p_refinanciado_de_id              => v_original.id
  );

  return v_nuevo_id;
end;
$$;

comment on function public.refinanciar_prestamo is 'Cierra un préstamo activo (estado=refinanciado, cuotas pendientes/vencidas -> reprogramada) y crea uno nuevo con el saldo pendiente + monto adicional como capital, enlazado vía refinanciado_de_id.';

grant execute on function public.refinanciar_prestamo(
  uuid, numeric, integer, numeric, public.sistema_amortizacion, public.frecuencia_cobro,
  date, date, jsonb, text, uuid, numeric, public.frecuencia_gasto_administrativo, numeric, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- obtener_clasificacion_clientes(): las cuotas 'reprogramada' (superadas por un
-- refinanciamiento, no impagas) ya no deben contar en el historial de cumplimiento.
-- Solo cambia el filtro del CTE base; la firma/columnas de salida no cambian.
-- ---------------------------------------------------------------------------

create or replace function public.obtener_clasificacion_clientes()
returns table (
  cliente_id                       uuid,
  total_cuotas_vencidas_hist       integer,
  cuotas_pagadas_a_tiempo          integer,
  cuotas_pagadas_tarde             integer,
  cuotas_vencidas_actuales         integer,
  multas_activas                   integer,
  porcentaje_cumplimiento          numeric,
  clasificacion                    public.clasificacion_cliente,
  no_recomendado_refinanciamiento  boolean,
  es_manual                        boolean,
  clasificacion_manual_motivo      text
)
language sql
stable
security invoker
set search_path = public
as $$
  with clientes_visibles as (
    select id as cliente_id, clasificacion_manual, clasificacion_manual_motivo
    from public.clientes
  ),
  base as (
    select
      p.cliente_id,
      cu.id as cuota_id,
      cu.fecha_vto,
      cu.estado
    from public.prestamos p
    join public.cuotas cu on cu.prestamo_id = p.id
    where p.estado <> 'eliminado' and cu.estado <> 'reprogramada'
  ),
  ultimo_pago as (
    select cuota_id, max(fecha_pago) as fecha_pago
    from public.pagos
    group by cuota_id
  ),
  metricas as (
    select
      cv.cliente_id,
      count(*) filter (where b.fecha_vto <= current_date) as total_cuotas_vencidas_hist,
      count(*) filter (
        where b.fecha_vto <= current_date and b.estado = 'saldada'
          and coalesce(up.fecha_pago, b.fecha_vto) <= b.fecha_vto
      ) as cuotas_pagadas_a_tiempo,
      count(*) filter (
        where b.fecha_vto <= current_date and b.estado = 'saldada'
          and up.fecha_pago > b.fecha_vto
      ) as cuotas_pagadas_tarde,
      count(*) filter (where b.estado = 'vencida') as cuotas_vencidas_actuales
    from clientes_visibles cv
    left join base b on b.cliente_id = cv.cliente_id
    left join ultimo_pago up on up.cuota_id = b.cuota_id
    group by cv.cliente_id
  ),
  multas_por_cliente as (
    select p.cliente_id, count(*) as multas_activas
    from public.multas m
    join public.prestamos p on p.id = m.prestamo_id
    where m.estado <> 'saldada'
    group by p.cliente_id
  ),
  completo as (
    select
      m.cliente_id,
      m.total_cuotas_vencidas_hist,
      m.cuotas_pagadas_a_tiempo,
      m.cuotas_pagadas_tarde,
      m.cuotas_vencidas_actuales,
      coalesce(mp.multas_activas, 0) as multas_activas,
      case when m.total_cuotas_vencidas_hist = 0 then 100
           else round(m.cuotas_pagadas_a_tiempo::numeric / m.total_cuotas_vencidas_hist * 100, 1)
      end as porcentaje_cumplimiento
    from metricas m
    left join multas_por_cliente mp on mp.cliente_id = m.cliente_id
  ),
  clasificado as (
    select
      c.*,
      case
        when c.total_cuotas_vencidas_hist = 0 then 'bueno'::public.clasificacion_cliente
        when c.porcentaje_cumplimiento >= 90 and c.cuotas_vencidas_actuales = 0 and c.multas_activas = 0
          then 'excelente'::public.clasificacion_cliente
        when c.porcentaje_cumplimiento >= 75 and c.cuotas_vencidas_actuales <= 1
          then 'bueno'::public.clasificacion_cliente
        when c.porcentaje_cumplimiento >= 50 and c.cuotas_vencidas_actuales <= 2 and c.multas_activas <= 1
          then 'regular'::public.clasificacion_cliente
        else 'malo'::public.clasificacion_cliente
      end as clasificacion_auto
    from completo c
  )
  select
    cl.cliente_id,
    cl.total_cuotas_vencidas_hist,
    cl.cuotas_pagadas_a_tiempo,
    cl.cuotas_pagadas_tarde,
    cl.cuotas_vencidas_actuales,
    cl.multas_activas,
    cl.porcentaje_cumplimiento,
    coalesce(cv.clasificacion_manual, cl.clasificacion_auto) as clasificacion,
    (coalesce(cv.clasificacion_manual, cl.clasificacion_auto) = 'malo') as no_recomendado_refinanciamiento,
    (cv.clasificacion_manual is not null) as es_manual,
    cv.clasificacion_manual_motivo
  from clasificado cl
  join clientes_visibles cv on cv.cliente_id = cl.cliente_id
$$;

grant execute on function public.obtener_clasificacion_clientes() to authenticated;
