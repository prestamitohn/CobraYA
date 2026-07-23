import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getPayments } from '../services/paymentService';
import { useNavigate } from 'react-router-dom';
import { Search, AlertCircle, CheckCircle2, Plus } from 'lucide-react';
import { formatCurrency, formatDate } from '../utils/formatters';
import { StatusBadge } from '../components/ui/StatusBadge';

import { PaymentModal } from '../components/payments/PaymentModal';
import { NewPaymentModal } from '../components/payments/NewPaymentModal';
import { Cuota } from '../types/cobraya';

export function Payments() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [isNewPaymentModalOpen, setIsNewPaymentModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedInstallment, setSelectedInstallment] = useState<Cuota | null>(null);

  const { data: payments, isLoading, error } = useQuery({
    queryKey: ['payments'],
    queryFn: getPayments,
  });

  const filteredPayments = useMemo(() => {
    if (!payments) return payments;
    if (!searchTerm) return payments;
    const term = searchTerm.toLowerCase();
    return payments.filter((p) => p.clienteNombre.toLowerCase().includes(term));
  }, [payments, searchTerm]);

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
        <p>Error al cargar los pagos</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-main">Pagos</h1>
          <p className="text-muted">Historial de transacciones y pagos recibidos</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setIsNewPaymentModalOpen(true)}
            className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg transition-colors shadow-lg shadow-primary-500/20"
          >
            <Plus className="h-5 w-5" />
            <span className="hidden sm:inline">Registrar Pago</span>
          </button>
        </div>
      </div>

      <div className="glass-panel rounded-xl overflow-hidden border border-border">
        <div className="p-4 border-b border-border space-y-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
            <input
              type="text"
              placeholder="Buscar por nombre del cliente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-surface/50 border border-border rounded-lg pl-10 pr-4 py-2 text-sm text-main placeholder-muted focus:outline-none focus:border-primary-500 transition-colors"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-surfaceHighlight text-muted">
              <tr>
                <th className="px-6 py-3 font-medium">Cliente</th>
                <th className="px-6 py-3 font-medium">Cuota</th>
                <th className="px-6 py-3 font-medium">Monto</th>
                <th className="px-6 py-3 font-medium">Fecha</th>
                <th className="px-6 py-3 font-medium">Medio de Pago</th>
                <th className="px-6 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredPayments?.map((payment) => (
                <tr key={payment.id} className="hover:bg-surfaceHighlight/50 transition-colors">
                  <td className="px-6 py-4">
                    <button
                      onClick={() => payment.clienteId && navigate(`/borrowers/${payment.clienteId}`)}
                      className="text-primary-400 hover:text-primary-300 font-medium hover:underline text-left"
                      disabled={!payment.clienteId}
                    >
                      {payment.clienteNombre}
                    </button>
                  </td>
                  <td className="px-6 py-4 text-muted">
                    {payment.nroCuota.toString().padStart(2, '0')}/{payment.cantidadCuotas || '-'}
                  </td>
                  <td className="px-6 py-4 text-main font-semibold">{formatCurrency(payment.monto || 0)}</td>
                  <td className="px-6 py-4 text-muted">{formatDate(payment.fechaPago)}</td>
                  <td className="px-6 py-4 text-muted capitalize">{payment.medioPago}</td>
                  <td className="px-6 py-4">
                     <StatusBadge variant={payment.estado === 'aprobado' ? 'success' : 'default'}>
                        <CheckCircle2 className="h-3 w-3" />
                        {payment.estado}
                     </StatusBadge>
                  </td>
                </tr>
              ))}
              {filteredPayments?.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-muted">
                    No se encontraron pagos
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <NewPaymentModal
        isOpen={isNewPaymentModalOpen}
        onClose={() => setIsNewPaymentModalOpen(false)}
        onInstallmentSelect={(installment) => {
          setSelectedInstallment(installment);
          setIsNewPaymentModalOpen(false);
          setIsPaymentModalOpen(true);
        }}
      />

      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => {
          setIsPaymentModalOpen(false);
          setSelectedInstallment(null);
        }}
        installment={selectedInstallment}
      />
    </div>
  );
}
