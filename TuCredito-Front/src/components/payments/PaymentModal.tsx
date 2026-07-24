import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { registrarPago, getMediosPago } from '../../services/paymentService';
import { registrarPagoGastoAdministrativo } from '../../services/gastoAdministrativoService';
import { useToast } from '../../context/ToastContext';
import { X, Banknote, Calendar, CreditCard, Percent, Save, Zap } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';
import { CurrencyInput } from '../ui/CurrencyInput';

/** Forma mínima común entre Cuota y GastoAdministrativo, lo único que este modal necesita. */
export interface PagableItem {
  id: string;
  numero: number;
  monto: number;
  saldoPendiente: number | null;
}

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: PagableItem | null;
  kind?: 'cuota' | 'gasto';
  isAdvance?: boolean;
}

export function PaymentModal({ isOpen, onClose, item, kind = 'cuota', isAdvance = false }: PaymentModalProps) {
  const queryClient = useQueryClient();
  const { addToast } = useToast();

  const { data: mediosPago } = useQuery({ queryKey: ['mediosPago'], queryFn: getMediosPago });

  const [monto, setMonto] = useState(0);
  const [fechaPago, setFechaPago] = useState(new Date().toISOString().split('T')[0]);
  const [medioPagoId, setMedioPagoId] = useState<number>(1);
  const [descuento, setDescuento] = useState(0);
  const [recargo, setRecargo] = useState(0);

  useEffect(() => {
    if (item) {
      setMonto(item.saldoPendiente ?? item.monto);
      setFechaPago(new Date().toISOString().split('T')[0]);
      setDescuento(0);
      setRecargo(0);
    }
  }, [item]);

  useEffect(() => {
    if (mediosPago && mediosPago.length > 0 && !mediosPago.some((m) => m.id === medioPagoId)) {
      setMedioPagoId(mediosPago[0].id);
    }
  }, [mediosPago, medioPagoId]);

  const mutation = useMutation({
    mutationFn: () => kind === 'gasto'
      ? registrarPagoGastoAdministrativo({
          gastoAdministrativoId: item!.id,
          medioPagoId,
          monto: Number(monto),
          descuento: Number(descuento || 0),
          recargo: Number(recargo || 0),
          fechaPago,
        })
      : registrarPago({
          cuotaId: item!.id,
          medioPagoId,
          monto: Number(monto),
          descuento: Number(descuento || 0),
          recargo: Number(recargo || 0),
          fechaPago,
        }),
    onSuccess: () => {
      addToast(isAdvance ? 'Pago anticipado registrado correctamente' : 'Pago registrado exitosamente', 'success');
      queryClient.invalidateQueries({ queryKey: ['installments'] });
      queryClient.invalidateQueries({ queryKey: ['gastosAdministrativos'] });
      queryClient.invalidateQueries({ queryKey: ['loan'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['loans'] });
      onClose();
    },
    onError: (error: any) => {
      addToast(error.message || 'Error al registrar el pago', 'error');
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!item || !monto) return;
    mutation.mutate();
  };

  if (!isOpen || !item) return null;

  const titulo = kind === 'gasto' ? `Gasto Administrativo #${item.numero}` : `Cuota #${item.numero}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-surface border border-border rounded-xl w-full max-w-md shadow-2xl animate-in zoom-in-95">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            {isAdvance && <Zap className="h-5 w-5 text-yellow-500" />}
            <h2 className="text-lg font-semibold text-main">
              {isAdvance ? 'Pago Anticipado' : 'Registrar Pago'} - {titulo}
            </h2>
          </div>
          <button onClick={onClose} className="text-muted hover:text-main transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {isAdvance && (
            <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-sm text-yellow-500 mb-4">
              Estás adelantando la última cuota pendiente. Esto ayuda a reducir el plazo de tu préstamo.
            </div>
          )}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted">Monto a Pagar (L)</label>
            <div className="relative">
              <Banknote className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
              <CurrencyInput
                value={monto}
                onValueChange={setMonto}
                className="w-full bg-surfaceHighlight border border-border rounded-lg pl-10 pr-4 py-2 text-main focus:border-primary-500 focus:outline-none"
              />
            </div>
            <p className="text-xs text-muted">
              Saldo pendiente: {formatCurrency(item.saldoPendiente ?? item.monto)}
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-muted">Fecha de Pago</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
              <input
                type="date"
                required
                value={fechaPago}
                onChange={(e) => setFechaPago(e.target.value)}
                className="w-full bg-surfaceHighlight border border-border rounded-lg pl-10 pr-4 py-2 text-main focus:border-primary-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-muted">Medio de Pago</label>
            <div className="relative">
              <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
              <select
                value={medioPagoId}
                onChange={(e) => setMedioPagoId(Number(e.target.value))}
                className="w-full bg-surfaceHighlight border border-border rounded-lg pl-10 pr-4 py-2 text-main focus:border-primary-500 focus:outline-none appearance-none capitalize"
              >
                {mediosPago?.map((m) => (
                  <option key={m.id} value={m.id} className="capitalize">{m.nombre}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted">Descuento</label>
              <div className="relative">
                <Percent className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                <input
                  type="number"
                  step="0.01"
                  value={descuento}
                  onChange={(e) => setDescuento(Number(e.target.value))}
                  className="w-full bg-surfaceHighlight border border-border rounded-lg pl-10 pr-4 py-2 text-main focus:border-primary-500 focus:outline-none"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted">Recargo</label>
              <div className="relative">
                <Percent className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                <input
                  type="number"
                  step="0.01"
                  value={recargo}
                  onChange={(e) => setRecargo(Number(e.target.value))}
                  className="w-full bg-surfaceHighlight border border-border rounded-lg pl-10 pr-4 py-2 text-main focus:border-primary-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-muted hover:text-main transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {mutation.isPending ? 'Registrando...' : 'Registrar Pago'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
