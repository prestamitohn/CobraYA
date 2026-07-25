-- CobraYA: refinanciamiento — nuevo valor de enum, en su propia transacción/migración
-- (Postgres no permite usar un valor de enum recién agregado en la misma transacción
-- que lo crea).

alter type public.estado_prestamo add value 'refinanciado';
