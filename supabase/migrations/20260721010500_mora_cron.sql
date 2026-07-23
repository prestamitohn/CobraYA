-- CobraYA: actualización de mora + programación con pg_cron
--
-- Equivalente a CuotaService.ActualizarCuotasVencidas del .NET original, que ahí se
-- ejecutaba de forma "pull" cada vez que se abría el dashboard (sin scheduler). Acá se
-- programa como job diario con pg_cron y además puede invocarse bajo demanda vía RPC
-- desde el dashboard (mismo patrón, más robusto).
--
-- SECURITY DEFINER porque pg_cron ejecuta sin un JWT/tenant en contexto — la función
-- necesita poder actualizar cuotas de TODOS los tenants. No hay riesgo de fuga de
-- datos: solo cambia estado según fecha_vto, no expone ni modifica montos.

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
  return v_count;
end;
$$;

comment on function public.actualizar_cuotas_vencidas is 'Marca como vencida toda cuota pendiente cuya fecha_vto ya pasó. Se corre vía pg_cron diario y opcionalmente bajo demanda desde el dashboard.';

grant execute on function public.actualizar_cuotas_vencidas() to authenticated;

-- pg_cron viene preinstalado en los proyectos hospedados de Supabase. Si esta
-- extensión no está disponible en tu Postgres local (p. ej. `supabase db reset` sin
-- la imagen completa de Supabase), comenta este bloque y programa el job manualmente
-- desde el dashboard de Supabase (Database > Cron Jobs) una vez tengas el proyecto
-- enlazado.
create extension if not exists pg_cron with schema extensions;

select cron.schedule(
  'cobraya-actualizar-mora',
  '0 6 * * *', -- 06:00 UTC = 00:00 hora de Honduras (UTC-6)
  $$select public.actualizar_cuotas_vencidas();$$
);
