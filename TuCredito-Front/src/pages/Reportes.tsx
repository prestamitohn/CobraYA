import { Fragment, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getReportePrestamos } from '../services/reportesService';
import { getResumenFondosCooperativa, getAportacionesByCliente } from '../services/cooperativaService';
import { getPayments } from '../services/paymentService';
import { getBorrowers } from '../services/borrowerService';
import { getMyTenant } from '../services/tenantService';
import { getEstadoPrestamoLabel, getTipoAportacionLabel } from '../types/cobraya';
import { formatCurrency, formatDate } from '../utils/formatters';
import { ExportMenu, ExportColumn } from '../components/ui/ExportMenu';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Search, ChevronDown, ChevronRight, FileBarChart, PiggyBank, Wallet2, Landmark, User } from 'lucide-react';
import type { Aportacion, ReportePrestamoRow } from '../types/cobraya';

type Tab = 'prestamos' | 'fondos' | 'aportaciones';

export function Reportes() {
  const { data: tenant } = useQuery({ queryKey: ['tenant'], queryFn: getMyTenant });
  const esCooperativa = tenant?.tipoTenant === 'cooperativa';
  const etiquetaMin = esCooperativa ? 'socio' : 'cliente';

  const [tab, setTab] = useState<Tab>('prestamos');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-main">Reportes</h1>
        <p className="text-muted">Historial de préstamos{esCooperativa ? ', fondos de aportaciones y estado de cuenta por socio' : ''}</p>
      </div>

      <div className="flex gap-2 border-b border-border overflow-x-auto">
        <TabButton active={tab === 'prestamos'} onClick={() => setTab('prestamos')} icon={FileBarChart}>Préstamos</TabButton>
        {esCooperativa && <TabButton active={tab === 'fondos'} onClick={() => setTab('fondos')} icon={Landmark}>Fondos</TabButton>}
        {esCooperativa && <TabButton active={tab === 'aportaciones'} onClick={() => setTab('aportaciones')} icon={PiggyBank}>Aportaciones por Socio</TabButton>}
      </div>

      {tab === 'prestamos' && <ReportePrestamosTab etiquetaMin={etiquetaMin} esCooperativa={!!esCooperativa} />}
      {tab === 'fondos' && esCooperativa && <ReporteFondosTab />}
      {tab === 'aportaciones' && esCooperativa && <ReporteAportacionesPorSocioTab />}
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, children }: { active: boolean; onClick: () => void; icon: typeof FileBarChart; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
        active ? 'border-primary-500 text-primary-500' : 'border-transparent text-muted hover:text-main'
      }`}
    >
      <Icon className="h-4 w-4" />
      {children}
    </button>
  );
}

function ReportePrestamosTab({ etiquetaMin, esCooperativa }: { etiquetaMin: string; esCooperativa: boolean }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: filas, isLoading } = useQuery({ queryKey: ['reportePrestamos'], queryFn: getReportePrestamos });
  const { data: pagos } = useQuery({ queryKey: ['payments'], queryFn: getPayments, enabled: !!expandedId });

  const filasFiltradas = useMemo(() => {
    if (!filas) return filas;
    if (!searchTerm) return filas;
    const term = searchTerm.toLowerCase();
    return filas.filter((f) =>
      `${f.clienteNombre} ${f.clienteApellido ?? ''}`.toLowerCase().includes(term) ||
      f.clienteDocumento.includes(term) ||
      (f.numeroSocio ?? '').toLowerCase().includes(term),
    );
  }, [filas, searchTerm]);

  const columnas: ExportColumn<ReportePrestamoRow>[] = [
    ...(esCooperativa ? [{ header: 'N° Socio', value: (f: ReportePrestamoRow) => f.numeroSocio ?? '' }] : []),
    { header: 'Nombre', value: (f) => `${f.clienteNombre} ${f.clienteApellido ?? ''}`.trim() },
    { header: 'Identidad', value: (f) => f.clienteDocumento },
    { header: 'Cuota Actual', value: (f) => f.montoCuotaActual ?? 0 },
    { header: 'Cuotas Pagadas', value: (f) => `${f.cuotasPagadas}/${f.cuotasTotales}` },
    { header: 'Total Pagado', value: (f) => f.totalPagado },
    { header: 'Saldo Pendiente', value: (f) => f.saldoPendiente },
    { header: 'Estado', value: (f) => getEstadoPrestamoLabel(f.estado) },
  ];

  if (isLoading) {
    return <div className="flex items-center justify-center py-16"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-500"></div></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <input
            type="text"
            placeholder={`Buscar por nombre, identidad${esCooperativa ? ' o N° socio' : ''}...`}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-surface/50 border border-border rounded-lg pl-10 pr-4 py-2 text-sm text-main placeholder-muted focus:outline-none focus:border-primary-500 transition-colors"
          />
        </div>
        <ExportMenu data={filasFiltradas} columns={columnas} filenameBase="ReportePrestamos" title="Reporte de Préstamos" />
      </div>

      <div className="glass-panel rounded-xl overflow-hidden border border-border">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-surfaceHighlight text-muted">
              <tr>
                <th className="px-4 py-3 font-medium w-8"></th>
                {esCooperativa && <th className="px-4 py-3 font-medium">N° Socio</th>}
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium text-right">Cuota Actual</th>
                <th className="px-4 py-3 font-medium text-center">Cuotas</th>
                <th className="px-4 py-3 font-medium text-right">Total Pagado</th>
                <th className="px-4 py-3 font-medium text-right">Saldo Pendiente</th>
                <th className="px-4 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filasFiltradas?.map((f) => (
                <Fragment key={f.prestamoId}>
                  <tr
                    onClick={() => setExpandedId(expandedId === f.prestamoId ? null : f.prestamoId)}
                    className="hover:bg-surfaceHighlight/50 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3 text-muted">
                      {expandedId === f.prestamoId ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </td>
                    {esCooperativa && <td className="px-4 py-3 text-muted">{f.numeroSocio ?? '-'}</td>}
                    <td className="px-4 py-3 text-main font-medium">{f.clienteNombre} {f.clienteApellido ?? ''}</td>
                    <td className="px-4 py-3 text-right text-main">{f.montoCuotaActual != null ? formatCurrency(f.montoCuotaActual) : '-'}</td>
                    <td className="px-4 py-3 text-center text-muted">{f.cuotasPagadas}/{f.cuotasTotales}</td>
                    <td className="px-4 py-3 text-right text-main">{formatCurrency(f.totalPagado)}</td>
                    <td className="px-4 py-3 text-right text-main font-medium">{formatCurrency(f.saldoPendiente)}</td>
                    <td className="px-4 py-3"><StatusBadge variant={f.estado === 'activo' ? 'success' : f.estado === 'finalizado' ? 'default' : 'warning'}>{getEstadoPrestamoLabel(f.estado)}</StatusBadge></td>
                  </tr>
                  {expandedId === f.prestamoId && (
                    <tr>
                      <td colSpan={esCooperativa ? 8 : 7} className="px-4 py-3 bg-surfaceHighlight/20">
                        <p className="text-xs font-medium text-muted mb-2">Detalle de pagos</p>
                        <div className="space-y-1">
                          {pagos?.filter((p) => p.prestamoId === f.prestamoId).map((p) => (
                            <div key={p.id} className="flex items-center justify-between text-xs text-muted px-2 py-1 rounded hover:bg-surfaceHighlight/50">
                              <span>{formatDate(p.fechaPago)} — {p.concepto} ({p.medioPago})</span>
                              <span className="text-main font-medium">{formatCurrency(p.monto)}</span>
                            </div>
                          ))}
                          {pagos && pagos.filter((p) => p.prestamoId === f.prestamoId).length === 0 && (
                            <p className="text-xs text-muted">Sin pagos registrados todavía.</p>
                          )}
                          {!pagos && <p className="text-xs text-muted">Cargando pagos...</p>}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {filasFiltradas?.length === 0 && (
                <tr><td colSpan={esCooperativa ? 8 : 7} className="px-4 py-8 text-center text-muted">No se encontraron préstamos para este {etiquetaMin}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ReporteFondosTab() {
  const { data: resumen, isLoading } = useQuery({ queryKey: ['resumenFondosCooperativa'], queryFn: getResumenFondosCooperativa });

  if (isLoading) {
    return <div className="flex items-center justify-center py-16"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-500"></div></div>;
  }

  if (!resumen) {
    return <p className="text-muted py-8 text-center">No se pudo calcular el resumen de fondos.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <FondoCard icon={PiggyBank} label="Capital Social Total" value={resumen.capitalAportacionesTotal} />
        <FondoCard icon={PiggyBank} label="En Reserva (no retirable)" value={resumen.capitalAportacionesReserva} muted />
        <FondoCard icon={PiggyBank} label="Retirable" value={resumen.capitalAportacionesRetirable} muted />
        <FondoCard icon={Wallet2} label="Ahorros Captados" value={resumen.ahorrosCaptados} />
        <FondoCard icon={Landmark} label="Colocado en Préstamos (pendiente de cobro)" value={resumen.capitalPendienteCobro} />
        <FondoCard icon={Landmark} label="Disponible en Aportaciones" value={resumen.disponibleAportaciones} highlight />
      </div>

      <div className="glass-panel rounded-xl border border-border p-5 space-y-2">
        <p className="text-sm font-semibold text-main">¿Cómo se calcula el disponible?</p>
        <p className="text-sm text-muted">
          {formatCurrency(resumen.capitalAportacionesTotal)} en aportaciones − {formatCurrency(resumen.capitalPendienteCobro)} ya colocados en préstamos que aún no se han cobrado
          = <span className="text-main font-medium">{formatCurrency(resumen.disponibleAportaciones)}</span> realmente disponibles.
        </p>
        <p className="text-xs text-muted pt-2 border-t border-border">
          Los ahorros ({formatCurrency(resumen.ahorrosCaptados)}) son una bolsa de fondos separada — no se mezclan en este cálculo porque hoy no hay ningún registro de con qué fondo se otorgó cada préstamo.
        </p>
      </div>
    </div>
  );
}

function FondoCard({ icon: Icon, label, value, muted, highlight }: { icon: typeof PiggyBank; label: string; value: number; muted?: boolean; highlight?: boolean }) {
  return (
    <div className={`glass-panel p-4 rounded-xl border ${highlight ? 'border-primary-500/40' : 'border-border'}`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`h-4 w-4 ${muted ? 'text-muted' : 'text-primary-500'}`} />
        <p className="text-sm text-muted truncate">{label}</p>
      </div>
      <p className={`text-xl font-bold truncate ${highlight ? 'text-primary-500' : 'text-main'}`}>{formatCurrency(value)}</p>
    </div>
  );
}

function ReporteAportacionesPorSocioTab() {
  const [clienteId, setClienteId] = useState('');
  const { data: socios } = useQuery({ queryKey: ['borrowers'], queryFn: () => getBorrowers() });
  const { data: aportaciones, isLoading } = useQuery({
    queryKey: ['aportacionesCliente', clienteId],
    queryFn: () => getAportacionesByCliente(clienteId),
    enabled: !!clienteId,
  });

  const grupos = useMemo(() => {
    if (!aportaciones) return [];
    const porMes = new Map<string, Aportacion[]>();
    for (const a of aportaciones) {
      const mes = a.fecha.slice(0, 7); // yyyy-mm
      porMes.set(mes, [...(porMes.get(mes) ?? []), a]);
    }
    return Array.from(porMes.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [aportaciones]);

  const saldoAcumulado = useMemo(() => {
    if (!aportaciones) return 0;
    return aportaciones.reduce((acc, a) => acc + (a.tipo === 'retiro' ? -a.monto : a.monto), 0);
  }, [aportaciones]);

  const columnas: ExportColumn<Aportacion>[] = [
    { header: 'Fecha', value: (a) => formatDate(a.fecha) },
    { header: 'Tipo', value: (a) => getTipoAportacionLabel(a.tipo) },
    { header: 'Monto', value: (a) => a.monto },
    { header: 'Observaciones', value: (a) => a.observaciones ?? '' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative max-w-md flex-1">
          <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <select
            value={clienteId}
            onChange={(e) => setClienteId(e.target.value)}
            className="w-full bg-surface/50 border border-border rounded-lg pl-10 pr-4 py-2 text-sm text-main focus:outline-none focus:border-primary-500 [&>option]:bg-surface"
          >
            <option value="">Selecciona un socio</option>
            {socios?.map((s) => <option key={s.id} value={s.id}>{s.nombre} {s.apellido ?? ''}{s.numeroSocio ? ` (N° ${s.numeroSocio})` : ''}</option>)}
          </select>
        </div>
        {clienteId && aportaciones && (
          <ExportMenu data={aportaciones} columns={columnas} filenameBase="EstadoCuentaAportaciones" title="Estado de Cuenta de Aportaciones" />
        )}
      </div>

      {!clienteId && <p className="text-muted text-center py-12">Elegí un socio para ver su historial de aportaciones.</p>}

      {clienteId && isLoading && (
        <div className="flex items-center justify-center py-16"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-500"></div></div>
      )}

      {clienteId && aportaciones && (
        <div className="space-y-4">
          <div className="glass-panel p-4 rounded-xl border border-border flex items-center justify-between">
            <span className="text-sm text-muted">Saldo acumulado a la fecha</span>
            <span className="text-xl font-bold text-main">{formatCurrency(saldoAcumulado)}</span>
          </div>

          {grupos.map(([mes, items]) => (
            <div key={mes} className="glass-panel rounded-xl border border-border overflow-hidden">
              <div className="px-4 py-2 bg-surfaceHighlight text-sm font-medium text-main">
                {new Date(`${mes}-01T00:00:00Z`).toLocaleDateString('es-HN', { month: 'long', year: 'numeric', timeZone: 'UTC' })}
              </div>
              <div className="divide-y divide-border">
                {items.map((a) => (
                  <div key={a.id} className="px-4 py-2.5 flex items-center justify-between text-sm">
                    <div>
                      <span className="text-main">{formatDate(a.fecha)}</span>
                      <span className="text-muted ml-2">{getTipoAportacionLabel(a.tipo)}</span>
                      {a.observaciones && <span className="text-muted ml-2">— {a.observaciones}</span>}
                    </div>
                    <span className={`font-medium ${a.tipo === 'retiro' ? 'text-red-400' : 'text-main'}`}>
                      {a.tipo === 'retiro' ? '- ' : ''}{formatCurrency(a.monto)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {grupos.length === 0 && <p className="text-muted text-center py-8">Este socio no tiene aportaciones registradas.</p>}
        </div>
      )}
    </div>
  );
}
