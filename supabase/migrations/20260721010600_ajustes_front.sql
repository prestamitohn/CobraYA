-- CobraYA: ajustes menores para simplificar las inserciones directas desde el front.
--
-- clientes/garantes/documentos se insertan directo desde supabase-js (a diferencia de
-- prestamos/cuotas/pagos, que siempre pasan por crear_prestamo()/registrar_pago()).
-- Con tenant_id DEFAULT current_tenant_id(), el front no necesita resolver ni enviar
-- el tenant_id en cada insert — Postgres lo completa solo, y sigue estando forzado por
-- la policy RLS (WITH CHECK tenant_id = current_tenant_id()) de todas formas.

alter table public.clientes alter column tenant_id set default public.current_tenant_id();
alter table public.garantes alter column tenant_id set default public.current_tenant_id();
alter table public.documentos alter column tenant_id set default public.current_tenant_id();

alter table public.garantes add column correo text;
