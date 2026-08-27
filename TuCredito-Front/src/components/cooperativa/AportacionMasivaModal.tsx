import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getBorrowers } from '../../services/borrowerService';
import { registrarAportacion } from '../../services/cooperativaService';
import { useToast } from '../../context/ToastContext';
import { X, Save, Wand2, CheckCircle2, XCircle } from 'lucide-react';
import { CurrencyInput } from '../ui/CurrencyInput';
import { TipoAportacion, getTipoAportacionLabel } from '../../types/cobraya';
import { formatCurrency } from '../../utils/formatters';

interface AportacionMasivaModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface FilaSocio {
  clienteId: string;
  nombre: string;
  incluido: boolean;
  monto: number;
  motivoExclusion: string;
}

const TIPOS: TipoAportacion[] = ['obligatoria', 'extraordinaria'];

type ResultadoFila = { clienteId: string; nombre: string; ok: boolean; error?: string };

export function AportacionMasivaModal({ isOpen, onClose }: AportacionMasivaModalProps) {
  const queryClient = useQueryClient();
  const { addToast } = useToast();

  const { data: socios } = useQuery({ queryKey: ['borrowers'], queryFn: () => getBorrowers(), enabled: isOpen });

  const [tipo, setTipo] = useState<TipoAportacion>('obligatoria');
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const [montoBase, setMontoBase] = useState(0);
  const [filas, setFilas] = useState<FilaSocio[]>([]);
  const [resultados, setResultados] = useState<ResultadoFila[] | null>(null);

  useEffect(() => {
    if (isOpen && socios) {
      setFilas(
        socios
          .filter((s) => s.activo)
          .map((s) => ({
            clienteId: s.id,
            nombre: `${s.nombre} ${s.apellido ?? ''}`.trim(),
            incluido: true,
            monto: 0,
            motivoExclusion: '',
          })),
      );
      setMontoBase(0);
      setFecha(new Date().toISOString().split('T')[0]);
      setTipo('obligatoria');
      setResultados(null);
    }
  }, [isOpen, socios]);

  const aplicarMontoBase = () => {
    setFilas((prev) => prev.map((f) => (f.incluido ? { ...f, monto: montoBase } : f)));
  };

  const incluidos = useMemo(() => filas.filter((f) => f.incluido && f.monto > 0), [filas]);
  const excluidos = useMemo(() => filas.filter((f) => !f.incluido), [filas]);
  const totalAAplicar = incluidos.reduce((acc, f) => acc + f.monto, 0);

  const mutation = useMutation({
    mutationFn: async () => {
      const settled = await Promise.allSettled(
        incluidos.map((f) => registrarAportacion({ clienteId: f.clienteId, tipo, monto: f.monto, fecha })),
      );
      return settled.map((r, i): ResultadoFila => ({
        clienteId: incluidos[i].clienteId,
        nombre: incluidos[i].nombre,
        ok: r.status === 'fulfilled',
        error: r.status === 'rejected' ? (r.reason?.message || 'Error desconocido') : undefined,
      }));
    },
    onSuccess: (data) => {
      setResultados(data);
      const exitosos = data.filter((r) => r.ok).length;
      queryClient.invalidateQueries({ queryKey: ['saldosAportaciones'] });
      queryClient.invalidateQueries({ queryKey: ['aportacionesCliente'] });
      if (exitosos === data.length) {
        addToast(`${exitosos} aportación(es) registrada(s) correctamente`, 'success');
      } else {
        addToast(`${exitosos} de ${data.length} registradas — revisa los errores abajo`, 'error');
      }
    },
    onError: (error: any) => addToast(error.message || 'Error al registrar las aportaciones', 'error'),
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-surface border border-border rounded-xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-main">Aportación Masiva</h2>
          <button onClick={onClose} className="text-muted hover:text-main transition-colors"><X className="h-5 w-5" /></button>
        </div>

        {resultados ? (
          <div className="p-6 space-y-4">
            <h3 className="text-sm font-semibold text-muted">Resultado</h3>
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {resultados.map((r) => (
                <div key={r.clienteId} className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm ${r.ok ? 'bg-emerald-500/5' : 'bg-red-500/5'}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    {r.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" /> : <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />}
                    <span className="text-main truncate">{r.nombre}</span>
                  </div>
                  {r.error && <span className="text-xs text-red-400 flex-shrink-0">{r.error}</span>}
                </div>
              ))}
            </div>
            {excluidos.length > 0 && (
              <div className="pt-3 border-t border-border">
                <p className="text-xs text-muted mb-2">Excluidos de esta tanda (no se les registró nada):</p>
                <div className="space-y-1">
                  {excluidos.map((f) => (
                    <p key={f.clienteId} className="text-xs text-muted">
                      • {f.nombre}{f.motivoExclusion ? ` — ${f.motivoExclusion}` : ''}
                    </p>
                  ))}
                </div>
              </div>
            )}
            <div className="flex justify-end pt-4 border-t border-border">
              <button onClick={onClose} className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium transition-colors">
                Cerrar
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="p-6 space-y-4 border-b border-border">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-muted">Tipo</label>
                  <select
                    value={tipo}
                    onChange={(e) => setTipo(e.target.value as TipoAportacion)}
                    className="w-full bg-surfaceHighlight border border-border rounded-lg px-3 py-2 text-main focus:border-primary-500 focus:outline-none [&>option]:bg-surface"
                  >
                    {TIPOS.map((t) => <option key={t} value={t}>{getTipoAportacionLabel(t)}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-muted">Fecha</label>
                  <input
                    type="date"
                    value={fecha}
                    onChange={(e) => setFecha(e.target.value)}
                    className="w-full bg-surfaceHighlight border border-border rounded-lg px-3 py-2 text-main focus:border-primary-500 focus:outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-muted">Monto base (L)</label>
                  <CurrencyInput value={montoBase} onValueChange={setMontoBase} className="w-full bg-surfaceHighlight border border-border rounded-lg px-3 py-2 text-main focus:border-primary-500 focus:outline-none" />
                </div>
              </div>
              <button
                type="button"
                onClick={aplicarMontoBase}
                disabled={montoBase <= 0}
                className="flex items-center gap-2 px-3 py-1.5 bg-surfaceHighlight border border-border hover:border-primary-500 text-main rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                <Wand2 className="h-4 w-4" />
                Aplicar monto base a todos los incluidos
              </button>
              <p className="text-xs text-muted">
                Ajusta el monto de cada fila si algún socio aporta un valor distinto (ej. L1,000 a unos y L500 a otros), o desmárcalo para excluirlo de esta tanda.
              </p>
            </div>

            <div className="p-4 space-y-2 max-h-96 overflow-y-auto">
              {filas.map((f, i) => (
                <div key={f.clienteId} className="flex items-center gap-3 p-2 rounded-lg hover:bg-surfaceHighlight/50 flex-wrap">
                  <input
                    type="checkbox"
                    checked={f.incluido}
                    onChange={(e) => setFilas((prev) => prev.map((x, j) => (j === i ? { ...x, incluido: e.target.checked } : x)))}
                    className="h-4 w-4 flex-shrink-0"
                  />
                  <span className={`flex-1 min-w-[140px] text-sm truncate ${f.incluido ? 'text-main' : 'text-muted line-through'}`}>{f.nombre}</span>
                  {f.incluido ? (
                    <div className="w-32 flex-shrink-0">
                      <CurrencyInput
                        value={f.monto}
                        onValueChange={(v) => setFilas((prev) => prev.map((x, j) => (j === i ? { ...x, monto: v } : x)))}
                        className="w-full bg-surfaceHighlight border border-border rounded-lg px-2 py-1 text-sm text-main focus:border-primary-500 focus:outline-none"
                      />
                    </div>
                  ) : (
                    <input
                      value={f.motivoExclusion}
                      onChange={(e) => setFilas((prev) => prev.map((x, j) => (j === i ? { ...x, motivoExclusion: e.target.value } : x)))}
                      placeholder="Motivo (opcional, no se guarda)"
                      className="flex-1 min-w-[160px] bg-surfaceHighlight border border-border rounded-lg px-2 py-1 text-sm text-main focus:border-primary-500 focus:outline-none"
                    />
                  )}
                </div>
              ))}
              {filas.length === 0 && <p className="text-sm text-muted text-center py-6">No hay socios activos</p>}
            </div>

            <div className="p-4 border-t border-border flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm text-muted">
                <span className="text-main font-medium">{incluidos.length}</span> socio(s) incluido(s) · Total: <span className="text-main font-medium">{formatCurrency(totalAAplicar)}</span>
                {excluidos.length > 0 && <> · {excluidos.length} excluido(s)</>}
              </p>
              <button
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending || incluidos.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {mutation.isPending ? 'Registrando...' : `Registrar ${incluidos.length} aportación(es)`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
