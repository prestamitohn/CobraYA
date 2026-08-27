import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { abrirCuentaAhorro, getProductosAhorro } from '../../services/cooperativaService';
import { useToast } from '../../context/ToastContext';
import { X, Save, PiggyBank } from 'lucide-react';
import { CurrencyInput } from '../ui/CurrencyInput';
import { getTipoProductoAhorroLabel } from '../../types/cobraya';

interface AbrirCuentaAhorroModalProps {
  isOpen: boolean;
  onClose: () => void;
  clienteId: string;
}

export function AbrirCuentaAhorroModal({ isOpen, onClose, clienteId }: AbrirCuentaAhorroModalProps) {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [productoId, setProductoId] = useState('');
  const [montoInicial, setMontoInicial] = useState(0);

  const { data: productos } = useQuery({ queryKey: ['productosAhorro'], queryFn: getProductosAhorro, enabled: isOpen });
  const productosActivos = (productos ?? []).filter((p) => p.activo);

  useEffect(() => {
    if (isOpen) {
      setProductoId('');
      setMontoInicial(0);
    }
  }, [isOpen]);

  const mutation = useMutation({
    mutationFn: () => abrirCuentaAhorro(clienteId, productoId, montoInicial),
    onSuccess: () => {
      addToast('Cuenta de ahorro abierta correctamente', 'success');
      queryClient.invalidateQueries({ queryKey: ['cuentasAhorroCliente', clienteId] });
      onClose();
    },
    onError: (error: any) => addToast(error.message || 'Error al abrir la cuenta', 'error'),
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-surface border border-border rounded-xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-main flex items-center gap-2"><PiggyBank className="h-5 w-5 text-primary-500" /> Abrir Cuenta de Ahorro</h2>
          <button onClick={onClose} className="text-muted hover:text-main transition-colors"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); if (productoId) mutation.mutate(); }} className="p-6 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted">Producto</label>
            <select
              required
              value={productoId}
              onChange={(e) => setProductoId(e.target.value)}
              className="w-full bg-surfaceHighlight border border-border rounded-lg px-4 py-2 text-main focus:border-primary-500 focus:outline-none [&>option]:bg-surface"
            >
              <option value="">Selecciona un producto</option>
              {productosActivos.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre} — {getTipoProductoAhorroLabel(p.tipo)} ({p.tasaPasiva}% anual)</option>
              ))}
            </select>
            {productosActivos.length === 0 && (
              <p className="text-xs text-amber-500">No hay productos de ahorro activos — créalos primero en Ahorros → Productos.</p>
            )}
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted">Depósito inicial (L, opcional)</label>
            <CurrencyInput
              value={montoInicial}
              onValueChange={setMontoInicial}
              className="w-full bg-surfaceHighlight border border-border rounded-lg px-4 py-2 text-main focus:border-primary-500 focus:outline-none"
            />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-muted hover:text-main transition-colors">Cancelar</button>
            <button
              type="submit"
              disabled={mutation.isPending || !productoId}
              className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {mutation.isPending ? 'Abriendo...' : 'Abrir Cuenta'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
