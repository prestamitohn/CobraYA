import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { actualizarProductoAhorro, crearProductoAhorro } from '../../services/cooperativaService';
import { useToast } from '../../context/ToastContext';
import { X, Save } from 'lucide-react';
import { PeriodicidadCapitalizacion, ProductoAhorro, TipoProductoAhorro, getPeriodicidadLabel, getTipoProductoAhorroLabel } from '../../types/cobraya';

interface ProductoAhorroModalProps {
  isOpen: boolean;
  onClose: () => void;
  producto?: ProductoAhorro | null;
}

const TIPOS: TipoProductoAhorro[] = ['a_la_vista', 'programado', 'plazo_fijo'];
const PERIODICIDADES: PeriodicidadCapitalizacion[] = ['diaria', 'mensual', 'trimestral', 'anual'];

export function ProductoAhorroModal({ isOpen, onClose, producto }: ProductoAhorroModalProps) {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const isEditing = !!producto;

  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<TipoProductoAhorro>('a_la_vista');
  const [tasaPasiva, setTasaPasiva] = useState(0);
  const [periodicidad, setPeriodicidad] = useState<PeriodicidadCapitalizacion>('mensual');
  const [permiteRetiroLibre, setPermiteRetiroLibre] = useState(true);
  const [penalidad, setPenalidad] = useState<number | ''>('');
  const [plazoDias, setPlazoDias] = useState<number | ''>('');
  const [activo, setActivo] = useState(true);

  useEffect(() => {
    if (isOpen) {
      setNombre(producto?.nombre ?? '');
      setTipo(producto?.tipo ?? 'a_la_vista');
      setTasaPasiva(producto?.tasaPasiva ?? 0);
      setPeriodicidad(producto?.periodicidadCapitalizacion ?? 'mensual');
      setPermiteRetiroLibre(producto?.permiteRetiroLibre ?? true);
      setPenalidad(producto?.penalidadRetiroAnticipado ?? '');
      setPlazoDias(producto?.plazoDias ?? '');
      setActivo(producto?.activo ?? true);
    }
  }, [isOpen, producto]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (isEditing) {
        await actualizarProductoAhorro(producto!.id, {
          nombre,
          tasaPasiva,
          permiteRetiroLibre,
          penalidadRetiroAnticipado: penalidad === '' ? null : Number(penalidad),
          activo,
        });
      } else {
        await crearProductoAhorro({
          nombre,
          tipo,
          tasaPasiva,
          periodicidad,
          permiteRetiroLibre,
          penalidadRetiroAnticipado: penalidad === '' ? null : Number(penalidad),
          plazoDias: plazoDias === '' ? null : Number(plazoDias),
        });
      }
    },
    onSuccess: () => {
      addToast(isEditing ? 'Producto actualizado' : 'Producto creado', 'success');
      queryClient.invalidateQueries({ queryKey: ['productosAhorro'] });
      onClose();
    },
    onError: (error: any) => addToast(error.message || 'Error al guardar el producto', 'error'),
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-surface border border-border rounded-xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-main">{isEditing ? 'Editar' : 'Nuevo'} Producto de Ahorro</h2>
          <button onClick={onClose} className="text-muted hover:text-main transition-colors"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }} className="p-6 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted">Nombre</label>
            <input required value={nombre} onChange={(e) => setNombre(e.target.value)}
              className="w-full bg-surfaceHighlight border border-border rounded-lg px-4 py-2 text-main focus:border-primary-500 focus:outline-none" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted">Tipo</label>
            <select disabled={isEditing} value={tipo} onChange={(e) => setTipo(e.target.value as TipoProductoAhorro)}
              className="w-full bg-surfaceHighlight border border-border rounded-lg px-4 py-2 text-main focus:border-primary-500 focus:outline-none disabled:opacity-60 [&>option]:bg-surface">
              {TIPOS.map((t) => <option key={t} value={t}>{getTipoProductoAhorroLabel(t)}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted">Tasa anual (%)</label>
              <input type="number" step={0.01} min={0} required value={tasaPasiva} onChange={(e) => setTasaPasiva(Number(e.target.value))}
                className="w-full bg-surfaceHighlight border border-border rounded-lg px-4 py-2 text-main focus:border-primary-500 focus:outline-none" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted">Capitalización</label>
              <select disabled={isEditing} value={periodicidad} onChange={(e) => setPeriodicidad(e.target.value as PeriodicidadCapitalizacion)}
                className="w-full bg-surfaceHighlight border border-border rounded-lg px-4 py-2 text-main focus:border-primary-500 focus:outline-none disabled:opacity-60 [&>option]:bg-surface">
                {PERIODICIDADES.map((p) => <option key={p} value={p}>{getPeriodicidadLabel(p)}</option>)}
              </select>
            </div>
          </div>
          {tipo === 'plazo_fijo' && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted">Plazo (días)</label>
              <input type="number" min={1} disabled={isEditing} required value={plazoDias} onChange={(e) => setPlazoDias(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full bg-surfaceHighlight border border-border rounded-lg px-4 py-2 text-main focus:border-primary-500 focus:outline-none disabled:opacity-60" />
            </div>
          )}
          <div className="flex items-center gap-2">
            <input type="checkbox" id="permiteRetiroLibre" checked={permiteRetiroLibre} onChange={(e) => setPermiteRetiroLibre(e.target.checked)} className="h-4 w-4" />
            <label htmlFor="permiteRetiroLibre" className="text-sm text-muted">Permite retiro libre (antes del vencimiento, si aplica)</label>
          </div>
          {!permiteRetiroLibre && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted">Penalidad por retiro anticipado (%, opcional)</label>
              <input type="number" step={0.01} min={0} value={penalidad} onChange={(e) => setPenalidad(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full bg-surfaceHighlight border border-border rounded-lg px-4 py-2 text-main focus:border-primary-500 focus:outline-none" />
            </div>
          )}
          {isEditing && (
            <div className="flex items-center gap-2">
              <input type="checkbox" id="activo" checked={activo} onChange={(e) => setActivo(e.target.checked)} className="h-4 w-4" />
              <label htmlFor="activo" className="text-sm text-muted">Activo (visible para abrir nuevas cuentas)</label>
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-muted hover:text-main">Cancelar</button>
            <button type="submit" disabled={mutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">
              <Save className="h-4 w-4" />
              {mutation.isPending ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
