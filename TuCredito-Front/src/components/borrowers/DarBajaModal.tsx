import { useState } from 'react';
import { X, UserX, AlertTriangle } from 'lucide-react';

interface DarBajaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (motivo: string) => void;
  nombre: string;
  etiqueta: string;
  isLoading: boolean;
}

/** Baja definitiva de un socio/cliente — a diferencia del toggle de Activo/Inactivo (reversible sin motivo,
 * pensado para suspensiones temporales), esto registra fecha+motivo y se usa cuando alguien se retira
 * de verdad. No borra ningún dato: preserva préstamos, aportaciones y ahorros históricos. */
export function DarBajaModal({ isOpen, onClose, onConfirm, nombre, etiqueta, isLoading }: DarBajaModalProps) {
  const [motivo, setMotivo] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!motivo.trim()) return;
    onConfirm(motivo.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-surface border border-border rounded-xl w-full max-w-md shadow-2xl animate-in zoom-in-95">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-main flex items-center gap-2">
            <UserX className="h-5 w-5 text-red-400" />
            Dar de baja a {etiqueta.toLowerCase()}
          </h2>
          <button onClick={onClose} className="text-muted hover:text-main transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="flex items-start gap-2 text-sm text-amber-500 bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <p>
              Esta es una baja <strong>definitiva</strong> de <strong>{nombre}</strong> — se conserva todo su
              historial (préstamos, aportaciones, ahorros), pero deja de aparecer entre los {etiqueta.toLowerCase()}s activos.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-muted">Motivo *</label>
            <textarea
              required
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              className="w-full bg-surfaceHighlight border border-border rounded-lg px-3 py-2 text-main focus:border-primary-500 focus:outline-none resize-none"
              placeholder="Ej. Renuncia voluntaria, traslado, incumplimiento reiterado..."
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-muted hover:text-main transition-colors">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isLoading || !motivo.trim()}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {isLoading ? 'Procesando...' : 'Confirmar baja'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
