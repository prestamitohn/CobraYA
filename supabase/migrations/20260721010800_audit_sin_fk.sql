-- La migración anterior (ON DELETE SET NULL) no alcanzaba: el problema no es qué pasa
-- con las filas EXISTENTES de audit_logs al borrar un tenant, sino que el trigger de
-- auditoría hace un INSERT nuevo en audit_logs (por el propio DELETE en cascada de
-- clientes/prestamos/pagos) cuando la fila de tenants ya fue eliminada dentro de la
-- misma transacción — cualquier FK (cascade o set null) rechaza ese insert porque el
-- padre ya no existe en ese punto.
--
-- Fix definitivo: audit_logs es un registro histórico de solo-append: no debe tener
-- integridad referencial dura hacia tenants (patrón común para tablas de auditoría/log,
-- justamente para que sobrevivan sin bloquear ni ser bloqueadas por el ciclo de vida de
-- la entidad que auditan).

alter table public.audit_logs drop constraint audit_logs_tenant_id_fkey;
