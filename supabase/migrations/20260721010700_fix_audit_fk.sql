-- Bug encontrado al probar el borrado de un tenant end-to-end: ON DELETE CASCADE en
-- audit_logs.tenant_id hace que la fila del tenant se elimine ANTES que las filas de
-- clientes/prestamos/pagos (por el orden interno de la acción referencial de FK), así
-- que cuando el trigger de auditoría de esas tablas intenta insertar en audit_logs
-- (todavía dentro de la misma transacción de cascada), el tenant_id referenciado ya no
-- existe y la FK falla.
--
-- Además, semánticamente el rastro de auditoría no debería desaparecer solo porque se
-- eliminó el tenant (útil para disputas/soporte) — se conserva con tenant_id en null.

alter table public.audit_logs alter column tenant_id drop not null;
alter table public.audit_logs drop constraint audit_logs_tenant_id_fkey;
alter table public.audit_logs
  add constraint audit_logs_tenant_id_fkey
  foreign key (tenant_id) references public.tenants (id) on delete set null;
