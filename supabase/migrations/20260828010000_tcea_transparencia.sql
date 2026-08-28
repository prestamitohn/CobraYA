-- CobraYA: transparencia de tasa efectiva (TCEA) en préstamos.
--
-- Problema real: el sistema "directo" (flat) cobra interés fijo sobre el capital
-- ORIGINAL en cada cuota, aunque el socio ya haya abonado parte de ese capital. La
-- tasa declarada ("12% anual") no refleja el costo real del crédito — la tasa
-- efectiva (derivada del flujo real de pagos vía TIR) suele ser mucho mayor,
-- especialmente en préstamos cortos con muchas cuotas.
--
-- Diseño: la TIR/TCEA se calcula UNA SOLA VEZ, en Postgres (Newton-Raphson con
-- respaldo por bisección), no en TypeScript/Deno — el motor de amortización ya vive
-- duplicado en dos lugares (front + Edge Function, ver comentario en
-- src/lib/amortizacion.ts) precisamente porque Postgres no podía calcular el
-- cronograma; para la TCEA sí puede (es una función pura sobre el array de cuotas
-- ya calculado), así que se evita una tercera copia. crear_prestamo() la calcula y
-- la guarda al momento de crear el préstamo; el front la vuelve a pedir en la
-- simulación previa (mismo RPC, sin persistir) para mostrarla antes del desembolso.

-- ---------------------------------------------------------------------------
-- calcular_tcea: TIR del flujo (desembolso positivo en t=0, cuotas negativas),
-- expresada como tasa periódica, nominal anual y efectiva anual (TCEA).
-- ---------------------------------------------------------------------------

create or replace function public.calcular_tcea(
  p_monto numeric,
  p_cuotas jsonb,           -- array de objetos con al menos {"monto": numeric}
  p_periodos_por_anio numeric
)
returns table (
  tasa_periodica       numeric,  -- % por período (el mismo período que frecuencia_cobro)
  tasa_nominal_anual   numeric,  -- % anual = tasa_periodica × periodos_por_año
  tcea                 numeric,  -- % anual efectivo = (1+tasa_periodica)^periodos_por_año − 1
  costo_total_credito  numeric   -- suma de cuotas − capital
)
language plpgsql
immutable
as $$
declare
  v_montos    numeric[];
  v_n         integer;
  v_total     numeric := 0;
  v_r         numeric;
  v_f         numeric;
  v_fprime    numeric;
  v_delta     numeric;
  v_i         integer;
  v_iter      integer;
  v_r_lo      numeric;
  v_r_hi      numeric;
  v_f_lo      numeric;
  v_f_mid     numeric;
  v_r_mid     numeric;
  v_convergio boolean := false;
begin
  if p_monto is null or p_monto <= 0 or p_cuotas is null or jsonb_array_length(p_cuotas) = 0 then
    return query select null::numeric, null::numeric, null::numeric, null::numeric;
    return;
  end if;

  select array(select (value ->> 'monto')::numeric from jsonb_array_elements(p_cuotas)) into v_montos;
  v_n := array_length(v_montos, 1);
  select sum(m) into v_total from unnest(v_montos) as m;

  -- Semilla inicial: interés total repartido en partes iguales sobre el capital,
  -- por cuota — punto de partida razonable para que Newton-Raphson converja rápido.
  v_r := greatest((v_total / p_monto - 1) / v_n, 0.0001);

  for v_iter in 1..100 loop
    v_f := -p_monto;
    v_fprime := 0;
    for v_i in 1..v_n loop
      v_f := v_f + v_montos[v_i] / power(1 + v_r, v_i);
      v_fprime := v_fprime - v_i * v_montos[v_i] / power(1 + v_r, v_i + 1);
    end loop;

    exit when v_fprime = 0;
    v_delta := v_f / v_fprime;
    v_r := v_r - v_delta;

    if v_r <= -0.999999 then
      v_r := -0.999999;
    end if;

    if abs(v_delta) < 0.0000000001 then
      v_convergio := true;
      exit;
    end if;
  end loop;

  -- Respaldo: si Newton-Raphson no convergió a algo razonable (puede divergir según
  -- la semilla), se resuelve por bisección en un rango amplio — más lento pero
  -- siempre estable, nunca debería fallar para un flujo de préstamo real.
  if not v_convergio or v_r is null or v_r <= -1 or v_r > 50 then
    v_r_lo := -0.99;
    v_r_hi := 50;
    for v_iter in 1..200 loop
      v_r_mid := (v_r_lo + v_r_hi) / 2;
      v_f_mid := -p_monto;
      v_f_lo := -p_monto;
      for v_i in 1..v_n loop
        v_f_mid := v_f_mid + v_montos[v_i] / power(1 + v_r_mid, v_i);
        v_f_lo := v_f_lo + v_montos[v_i] / power(1 + v_r_lo, v_i);
      end loop;
      if sign(v_f_mid) = sign(v_f_lo) then
        v_r_lo := v_r_mid;
      else
        v_r_hi := v_r_mid;
      end if;
    end loop;
    v_r := (v_r_lo + v_r_hi) / 2;
  end if;

  return query select
    round(v_r * 100, 6),
    round(v_r * p_periodos_por_anio * 100, 4),
    round((power(1 + v_r, p_periodos_por_anio) - 1) * 100, 4),
    round(v_total - p_monto, 2);
end;
$$;

comment on function public.calcular_tcea is 'TIR del flujo de un préstamo (desembolso vs. cuotas), expresada como tasa periódica/nominal anual/efectiva anual (TCEA). Función pura, sin acceso a datos — se puede llamar antes de crear el préstamo (simulación) o para recalcular auditoría.';

grant execute on function public.calcular_tcea(numeric, jsonb, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- prestamos: nuevos campos para la "segunda lectura" (tasa efectiva real)
-- ---------------------------------------------------------------------------

-- Sin precisión/escala fija en las tres tasas: un préstamo de frecuencia diaria con
-- una tasa periódica moderada puede anualizarse (^365) a un número enorme — eso es
-- matemáticamente correcto (así de caro es un microcrédito diario visto en términos
-- anuales), no un error, así que la columna no le puede poner techo arbitrario.
alter table public.prestamos
  add column tasa_periodica_implicita numeric,
  add column tasa_nominal_anual       numeric,
  add column tasa_efectiva_anual      numeric,
  add column costo_total_credito      numeric(14, 2);

comment on column public.prestamos.tasa_efectiva_anual is 'TCEA — costo real anualizado del crédito derivado del flujo de pagos (TIR), no la tasa declarada. Ver calcular_tcea().';

-- ---------------------------------------------------------------------------
-- crear_prestamo(): misma firma (sin nuevos parámetros) — ahora también calcula
-- y guarda la lectura de tasa efectiva justo antes de insertar el préstamo.
-- refinanciar_prestamo() llama a crear_prestamo() internamente, así que un
-- préstamo refinanciado también queda con su propia TCEA sin tocar esa función.
-- ---------------------------------------------------------------------------

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
  v_tenant_id          uuid := public.current_tenant_id();
  v_prestamo_id        uuid;
  v_fecha_fin          date;
  v_gasto_fecha        date;
  v_gasto_numero       integer := 1;
  v_gasto_paso         interval;
  v_gasto_por_cuota    numeric := coalesce(
    case when p_gasto_administrativo_frecuencia = 'por_cuota' then p_gasto_administrativo_monto else null end,
    0
  );
  v_periodos_por_anio  numeric;
  v_tcea               record;
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

  v_periodos_por_anio := case p_frecuencia_cobro
    when 'diario' then 365
    when 'semanal' then 52
    when 'quincenal' then 24
    when 'mensual' then 12
  end;

  select * into v_tcea from public.calcular_tcea(p_monto_otorgado, p_cuotas, v_periodos_por_anio);

  insert into public.prestamos (
    tenant_id, cliente_id, cobrador_id, monto_otorgado, saldo_restante, cantidad_cuotas,
    tasa_interes, sistema_amortizacion, frecuencia_cobro, estado,
    fecha_otorgamiento, fecha_primer_vto, fecha_fin_estimada, moneda,
    gasto_administrativo_monto, gasto_administrativo_frecuencia, multa_por_atraso_monto,
    refinanciado_de_id,
    tasa_periodica_implicita, tasa_nominal_anual, tasa_efectiva_anual, costo_total_credito
  ) values (
    v_tenant_id, p_cliente_id, p_cobrador_id, p_monto_otorgado, p_monto_otorgado, p_cantidad_cuotas,
    p_tasa_interes, p_sistema_amortizacion, p_frecuencia_cobro, 'activo',
    p_fecha_otorgamiento, p_fecha_primer_vto, v_fecha_fin, coalesce(p_moneda, 'HNL'),
    p_gasto_administrativo_monto, p_gasto_administrativo_frecuencia, p_multa_por_atraso_monto,
    p_refinanciado_de_id,
    v_tcea.tasa_periodica, v_tcea.tasa_nominal_anual, v_tcea.tcea, v_tcea.costo_total_credito
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
-- Backfill: préstamos ya existentes (creados antes de esta migración) también
-- quedan con su TCEA calculada a partir de las cuotas que ya tienen guardadas —
-- puramente aditivo (solo llena columnas nuevas en NULL), no cambia ningún monto.
-- ---------------------------------------------------------------------------

with datos as (
  select
    p.id as prestamo_id,
    p.monto_otorgado,
    case p.frecuencia_cobro
      when 'diario' then 365
      when 'semanal' then 52
      when 'quincenal' then 24
      when 'mensual' then 12
    end as periodos_por_anio,
    jsonb_agg(jsonb_build_object('monto', c.monto) order by c.nro_cuota) as cuotas_json
  from public.prestamos p
  join public.cuotas c on c.prestamo_id = p.id
  group by p.id, p.monto_otorgado, p.frecuencia_cobro
)
update public.prestamos p
set tasa_periodica_implicita = calc.tasa_periodica,
    tasa_nominal_anual = calc.tasa_nominal_anual,
    tasa_efectiva_anual = calc.tcea,
    costo_total_credito = calc.costo_total_credito
from datos d
cross join lateral public.calcular_tcea(d.monto_otorgado, d.cuotas_json, d.periodos_por_anio) as calc
where p.id = d.prestamo_id;
