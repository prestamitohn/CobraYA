-- CobraYA: clasificación de clientes (Excelente/Bueno/Regular/Malo)
--
-- Calcula el score de cada cliente en base a su historial real de cuotas (pagadas a
-- tiempo vs tarde vs vencidas sin pagar) y sus multas activas. Se expone como función
-- (no vista) para documentar la fórmula con claridad; se invoca una vez por carga de
-- página, no necesita optimizarse como vista materializada.
--
-- security invoker: corre con los privilegios del usuario que llama, así que las RLS
-- de prestamos/cuotas/pagos/multas se aplican normalmente (un cobrador solo ve la
-- clasificación de los clientes de los préstamos que tiene asignados).

create type public.clasificacion_cliente as enum ('excelente', 'bueno', 'regular', 'malo');

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
  no_recomendado_refinanciamiento  boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  with base as (
    select
      p.cliente_id,
      cu.id as cuota_id,
      cu.fecha_vto,
      cu.estado
    from public.prestamos p
    join public.cuotas cu on cu.prestamo_id = p.id
    where p.estado <> 'eliminado'
  ),
  ultimo_pago as (
    select cuota_id, max(fecha_pago) as fecha_pago
    from public.pagos
    group by cuota_id
  ),
  metricas as (
    select
      b.cliente_id,
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
    from base b
    left join ultimo_pago up on up.cuota_id = b.cuota_id
    group by b.cliente_id
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
      end as clasificacion
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
    cl.clasificacion,
    (cl.clasificacion = 'malo') as no_recomendado_refinanciamiento
  from clasificado cl
$$;

comment on function public.obtener_clasificacion_clientes() is
  'Clasificación Excelente/Bueno/Regular/Malo por cliente en base a cuotas pagadas a tiempo vs tarde vs vencidas sin pagar y multas activas. Clientes sin historial (ninguna cuota vencida todavía) se clasifican como Bueno por defecto.';

grant execute on function public.obtener_clasificacion_clientes() to authenticated;
