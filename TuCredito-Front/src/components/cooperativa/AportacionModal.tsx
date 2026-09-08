import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { registrarAportacion } from '../../services/cooperativaService';
import { getBorrowers } from '../../services/borrowerService';
import { useToast } from '../../context/ToastContext';
import { X, Save, User, Calendar, FileText } from 'lucide-react';
import { CurrencyInput } from '../ui/CurrencyInput';
import { TipoAportacion, getTipoAportacionLabel } from '../../types/cobraya';

interface AportacionModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Si se abre desde el detalle de un socio, viene preseleccionado y no se muestra el selector. */
  clienteIdFijo?: string;
  clienteNombreFijo?: string;
}

const TIPOS: TipoAportacion[] = ['obligatoria', 'extraordinaria', 'reserva', 'retiro'];

export function AportacionModal({ isOpen, onClose, clienteIdFijo, clienteNombreFijo }: AportacionModalProps) {
  const queryClient = useQueryClient();
  const { addToast } = useToast();

  const [clienteId, setClienteId] = useState('');
  const [tipo, setTipo] = useState<TipoAportacion>('obligatoria');
  const [monto, setMonto] = useState(0);
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const [observaciones, setObservaciones] = useState('');

  const { data: socios } = useQuery({ queryKey: ['borrowers'], queryFn: () => getBorrowers(), enabled: isOpen && !clienteIdFijo });

  useEffect(() => {
    if (isOpen) {
      setClienteId(clienteIdFijo ?? '');
      setTipo('obligatoria');
      setMonto(0);
      setFecha(new Date().toISOString().split('T')[0]);
      setObservaciones('');
    }
  }, [isOpen, clienteIdFijo]);

  const mutation = useMutation({
    mutationFn: () => registrarAportacion({ clienteId, tipo, monto: Number(monto), fecha, observaciones: observaciones || null }),
    onSuccess: () => {
      addToast('Aportación registrada correctamente', 'success');
      queryClient.invalidateQueries({ queryKey: ['saldosAportaciones'] });
      queryClient.invalidateQueries({ queryKey: ['aportacionesCliente', clienteId] });
      onClose();
    },
    onError: (error: any) => {
      addToast(error.message || 'Error al registrar la aportación', 'error');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clienteId || !monto) return;
    mutation.mutate();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-surface border border-border rounded-xl w-full max-w-md shadow-2xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-main">Registrar Aportación</h2>
          <button onClick={onClose} className="text-muted hover:text-main transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {clienteIdFijo ? (
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted">Socio</label>
              <p className="text-main font-medium">{clienteNombreFijo}</p>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted">Socio</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                <select
                  required
                  value={clienteId}
                  onChange={(e) => setClienteId(e.target.value)}
                  className="w-full bg-surfaceHighlight border border-border rounded-lg pl-10 pr-4 py-2 text-main focus:border-primary-500 focus:outline-none [&>option]:bg-surface"
                >
                  <option value="">Selecciona un socio</option>
                  {socios?.map((s) => (
                    <option key={s.id} value={s.id}>{s.nombre} {s.apellido ?? ''}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium text-muted">Tipo</label>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoAportacion)}
              className="w-full bg-surfaceHighlight border border-border rounded-lg px-4 py-2 text-main focus:border-primary-500 focus:outline-none [&>option]:bg-surface"
            >
              {TIPOS.map((t) => (
                <option key={t} value={t}>{getTipoAportacionLabel(t)}</option>
              ))}
            </select>
            {tipo === 'retiro' && (
              <p className="text-xs text-amber-500">El retiro se descuenta del saldo RETIRABLE del socio (obligatoria+extraordinaria); la reserva nunca se toma en cuenta y si no alcanza será rechazado.</p>
            )}
            {tipo === 'reserva' && (
              <p className="text-xs text-muted">Capital bloqueado — suma al saldo del socio pero nunca podrá retirarse.</p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-muted">Monto (L)</label>
            <CurrencyInput
              value={monto}
              onValueChange={setMonto}
              className="w-full bg-surfaceHighlight border border-border rounded-lg px-4 py-2 text-main focus:border-primary-500 focus:outline-none"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-muted">Fecha</label>
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

          <div className="space-y-2">
            <label className="text-sm font-medium text-muted">Observaciones (opcional)</label>
            <div className="relative">
              <FileText className="absolute left-3 top-3 h-4 w-4 text-muted" />
              <textarea
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                rows={2}
                className="w-full bg-surfaceHighlight border border-border rounded-lg pl-10 pr-4 py-2 text-main focus:border-primary-500 focus:outline-none resize-none"
                placeholder="Ej. Aporte extraordinario asamblea 2026"
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
              className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {mutation.isPending ? 'Guardando...' : 'Registrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
