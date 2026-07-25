import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getAllMultas, MultaConCliente } from '../services/multaService';
import { Search, AlertCircle, ShieldAlert, CreditCard } from 'lucide-react';
import { formatCurrency, formatDate } from '../utils/formatters';
import { StatusBadge } from '../components/ui/StatusBadge';
import { getEstadoCuotaLabel, EstadoCuota } from '../types/cobraya';
import { PaymentModal, PagableItem } from '../components/payments/PaymentModal';
import { ExportMenu, ExportColumn } from '../components/ui/ExportMenu';

const MULTA_EXPORT_COLUMNS: ExportColumn<MultaConCliente>[] = [
  { header: 'Cliente', value: (m) => m.clienteNombre },
  { header: 'Identidad', value: (m) => m.clienteDocumento ?? '' },
  { header: 'Cuota', value: (m) => m.nroCuota ?? '-' },
  { header: 'Motivo', value: (m) => m.motivo },
  { header: 'Fecha Incumplimiento', value: (m) => formatDate(m.fechaIncumplimiento) },
  { header: 'Monto', value: (m) => m.monto },
  { header: 'Saldo', value: (m) => m.saldoPendiente },
  { header: 'Estado', value: (m) => getEstadoCuotaLabel(m.estado) },
  { header: 'Origen', value: (m) => m.aplicadaAutomaticamente ? 'Automática' : 'Manual' },
];

export function Multas() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [estadoFilter, setEstadoFilter] = useState<EstadoCuota | ''>('');
  const [selectedMulta, setSelectedMulta] = useState<PagableItem | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

  const { data: multas, isLoading, error } = useQuery({ queryKey: ['allMultas'], queryFn: getAllMultas });

  const filteredMultas = useMemo(() => {
    if (!multas) return multas;
    return multas.filter((m) => {
      if (estadoFilter && m.estado !== estadoFilter) return false;
      if (searchTerm && !m.clienteNombre.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      return true;
    });
  }, [multas, searchTerm, estadoFilter]);

  const totalPendiente = filteredMultas?.filter((m) => m.estado !== 'saldada').reduce((acc, m) => acc + m.saldoPendiente, 0) ?? 0;

  const openPayment = (multa: MultaConCliente) => {
    setSelectedMulta({ id: multa.id, numero: 0, monto: multa.monto, saldoPendiente: multa.saldoPendiente });
    setIsPaymentModalOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-red-400">
        <AlertCircle className="h-12 w-12 mb-4" />
        <p>Error al cargar las multas</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-main">Multas</h1>
          <p className="text-muted">Historial de multas por atraso, automáticas y manuales</p>
        </div>
        <div className="flex gap-2">
          <ExportMenu data={filteredMultas} columns={MULTA_EXPORT_COLUMNS} filenameBase="Multas" title="Reporte de Multas" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="glass-panel p-4 rounded-xl flex items-center gap-4">
          <div className="p-3 rounded-lg bg-red-500/10 text-red-500">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm text-muted">Multas Pendientes</p>
            <p className="text-2xl font-bold text-main">{formatCurrency(totalPendiente)}</p>
          </div>
        </div>
      </div>

      <div className="glass-panel rounded-xl overflow-hidden border border-border">
        <div className="p-4 border-b border-border flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
              <input
                type="text"
                placeholder="Buscar por cliente..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-surface/50 border border-border rounded-lg pl-10 pr-4 py-2 text-sm text-main placeholder-muted focus:outline-none focus:border-primary-500 transition-colors"
              />
            </div>
            <select
              value={estadoFilter}
              onChange={(e) => setEstadoFilter(e.target.value as EstadoCuota | '')}
              className="bg-surface/50 border border-border rounded-lg px-3 py-2 text-sm text-main focus:outline-none focus:border-primary-500 [&>option]:bg-surface"
            >
              <option value="">Todos los estados</option>
              <option value="pendiente">Pendiente</option>
              <option value="saldada">Saldada</option>
              <option value="vencida">Vencida</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-surfaceHighlight text-muted">
              <tr>
                <th className="px-6 py-3 font-medium">Cliente</th>
                <th className="px-6 py-3 font-medium">Motivo</th>
                <th className="px-6 py-3 font-medium">Fecha Incumplimiento</th>
                <th className="px-6 py-3 font-medium">Monto</th>
                <th className="px-6 py-3 font-medium">Saldo</th>
                <th className="px-6 py-3 font-medium">Estado</th>
                <th className="px-6 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredMultas?.map((multa) => (
                <tr key={multa.id} className="hover:bg-surfaceHighlight/50 transition-colors">
                  <td className="px-6 py-4">
                    <button
                      onClick={() => multa.clienteDocumento && navigate(`/borrowers/${multa.clienteDocumento}`)}
                      className="text-primary-400 hover:text-primary-300 font-medium hover:underline text-left"
                      disabled={!multa.clienteDocumento}
                    >
                      {multa.clienteNombre}
                    </button>
                  </td>
                  <td className="px-6 py-4 text-muted">{multa.motivo}</td>
                  <td className="px-6 py-4 text-muted">{formatDate(multa.fechaIncumplimiento)}</td>
                  <td className="px-6 py-4 text-main">{formatCurrency(multa.monto)}</td>
                  <td className="px-6 py-4 text-main">{formatCurrency(multa.saldoPendiente)}</td>
                  <td className="px-6 py-4">
                    <StatusBadge variant={
                      multa.estado === 'saldada' ? 'success' :
                      multa.estado === 'pendiente' ? 'warning' :
                      'error'
                    }>
                      {getEstadoCuotaLabel(multa.estado)}
                    </StatusBadge>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {multa.estado !== 'saldada' && (
                      <button
                        onClick={() => openPayment(multa)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-500/10 text-primary-500 hover:bg-primary-500/20 rounded-lg text-xs font-medium transition-colors"
                      >
                        <CreditCard className="h-3.5 w-3.5" />
                        Pagar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {filteredMultas?.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-muted">
                    No se encontraron multas
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => {
          setIsPaymentModalOpen(false);
          setSelectedMulta(null);
        }}
        item={selectedMulta}
        kind="multa"
      />
    </div>
  );
}
