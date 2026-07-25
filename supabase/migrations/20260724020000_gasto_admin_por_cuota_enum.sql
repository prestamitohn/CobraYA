-- Tercer modo de gasto administrativo: "por_cuota" — en vez de un cronograma propio
-- (semanal/mensual), el monto se suma directo a cada cuota normal del préstamo (ej.
-- interés semanal L1,080 + servicio administrativo L60 = L1,140 esa cuota). Sigue el
-- calendario de la cuota, no tiene fecha_vto propia.
--
-- ALTER TYPE ... ADD VALUE va en su propia migración/transacción: Postgres no permite
-- usar un valor de enum recién agregado en la misma transacción en la que se agrega.
alter type public.frecuencia_gasto_administrativo add value 'por_cuota';
