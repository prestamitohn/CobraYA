-- Recalcula saldo_pendiente y estado de TODAS las cuotas existentes desde la fuente de
-- verdad real: monto de la cuota menos la suma de pagos netos ya aplicados (pagos es
-- el ledger correcto — nunca dependió del campo con el bug). Corrige los préstamos de
-- prueba ya creados con la función vieja, incluidos los que ya tienen pagos parciales
-- registrados. Dos statements (en vez de un LEFT JOIN dentro de UPDATE...FROM) para
-- que el caso "sin pagos todavía" quede explícito y fácil de verificar.

-- Cuotas sin ningún pago registrado: saldo_pendiente = su propio monto.
update public.cuotas c
set
  saldo_pendiente = c.monto,
  estado = case
    when c.fecha_vto < current_date then 'vencida'::public.estado_cuota
    else 'pendiente'::public.estado_cuota
  end
where not exists (select 1 from public.pagos p where p.cuota_id = c.id);

-- Cuotas con uno o más pagos: saldo_pendiente = monto - neto pagado (nunca negativo).
with pagos_por_cuota as (
  select cuota_id, sum(monto + descuento - recargo) as neto
  from public.pagos
  where cuota_id is not null
  group by cuota_id
)
update public.cuotas c
set
  saldo_pendiente = greatest(c.monto - p.neto, 0),
  estado = case
    when greatest(c.monto - p.neto, 0) <= 0 then 'saldada'::public.estado_cuota
    when c.fecha_vto < current_date then 'vencida'::public.estado_cuota
    else 'pendiente'::public.estado_cuota
  end
from pagos_por_cuota p
where p.cuota_id = c.id;
