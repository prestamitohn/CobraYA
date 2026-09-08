-- CobraYA: cierre de grants por consistencia (2026-08-31, seguimiento de la migración
-- 20260831010000). Verificado post-deploy con has_function_privilege('anon', ...): las
-- 3 RPCs `security definer` de esa migración quedaron correctamente cerradas
-- (saldos_aportaciones, y las de 20260831020000_rpcs_reportes.sql), pero
-- dar_baja_socio/reactivar_socio siguieron con el EXECUTE por defecto de PUBLIC —
-- Postgres lo concede automáticamente en toda función nueva de `public`.
--
-- No es una vulnerabilidad real (ninguna de las dos es `security definer`: corren con
-- los permisos del invocador, así que un caller `anon` sin sesión hace `current_tenant_id()
-- is null` → excepción inmediata, y aunque no fuera así, la RLS de `clientes` no le
-- concede ninguna policy a `anon`). Se revoca de todas formas por consistencia con el
-- resto de RPCs sensibles del proyecto.

-- OJO: el EXECUTE por defecto lo tiene el rol PUBLIC, no `anon` directamente — revocar
-- solo "from anon" no quita nada (anon lo sigue teniendo vía PUBLIC). Hay que revocar
-- de PUBLIC y volver a conceder explícito a `authenticated`.
revoke execute on function public.dar_baja_socio(uuid, text, date) from public;
grant execute on function public.dar_baja_socio(uuid, text, date) to authenticated;

revoke execute on function public.reactivar_socio(uuid) from public;
grant execute on function public.reactivar_socio(uuid) to authenticated;
