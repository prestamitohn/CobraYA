import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aplicarMulta } from '../../services/multaService';
import { useToast } from '../../context/ToastContext';
import { X, AlertTriangle, Calendar, FileText, Save } from 'lucide-react';
import { CurrencyInput } from '../ui/CurrencyInput';

interface AplicarMultaModalProps {
  isOpen: boolean;
  onClose: () => void;
  cuotaId: string | null;
  nroCuota?: number;
  montoSugerido?: number | null;
}

export function AplicarMultaModal({ isOpen, onClose, cuotaId, nroCuota, montoSugerido }: AplicarMultaModalProps) {
  const queryClient = useQueryClient();
  const { addToast } = useToast();

  const [monto, setMonto] = useState(0);
  const [motivo, setMotivo] = useState('No pagó');
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    if (isOpen) {
      setMonto(montoSugerido ?? 0);
      setMotivo('No pagó');
      setFecha(new Date().toISOString().split('T')[0]);
    }
  }, [isOpen, montoSugerido]);

  const mutation = useMutation({
    mutationFn: () => aplicarMulta({ cuotaId: cuotaId!, monto: Number(monto), motivo, fechaIncumplimiento: fecha }),
    onSuccess: () => {
      addToast('Multa aplicada correctamente', 'success');
      queryClient.invalidateQueries({ queryKey: ['multas'] });
      onClose();
    },
    onError: (error: any) => {
      addToast(error.message || 'Error al aplicar la multa', 'error');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cuotaId || !monto) return;
    mutation.mutate();
  };

  if (!isOpen || !cuotaId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-surface border border-border rounded-xl w-full max-w-md shadow-2xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <h2 className="text-lg font-semibold text-main">Marcar No Pagó {nroCuota ? `- Cuota #${nroCuota}` : ''}</h2>
          </div>
          <button onClick={onClose} className="text-muted hover:text-main transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted">Monto de la Multa (L)</label>
            <CurrencyInput
              value={monto}
              onValueChange={setMonto}
              className="w-full bg-surfaceHighlight border border-border rounded-lg px-4 py-2 text-main focus:border-primary-500 focus:outline-none"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-muted">Motivo</label>
            <div className="relative">
              <FileText className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
              <input
                type="text"
                required
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                className="w-full bg-surfaceHighlight border border-border rounded-lg pl-10 pr-4 py-2 text-main focus:border-primary-500 focus:outline-none"
                placeholder="Ej. Cliente avisó que no paga esta semana"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-muted">Fecha de Incumplimiento</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
              <input
                type="date"
                required
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="w-full bg-surfaceHighlight border border-border rounded-lg pl-10 pr-4 py-2 text-main focus:border-primary-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-muted hover:text-main transition-colors">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {mutation.isPending ? 'Aplicando...' : 'Aplicar Multa'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
