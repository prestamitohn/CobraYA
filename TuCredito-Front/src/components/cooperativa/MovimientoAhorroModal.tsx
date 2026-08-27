import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getMovimientosByCuenta, registrarMovimientoAhorro } from '../../services/cooperativaService';
import { getMyTenant } from '../../services/tenantService';
import { useToast } from '../../context/ToastContext';
import { X, Save, ArrowDownCircle, ArrowUpCircle, Receipt, Loader2 } from 'lucide-react';
import { CurrencyInput } from '../ui/CurrencyInput';
import { WhatsappButton } from '../ui/WhatsappButton';
import { CuentaAhorro, Movimiento, getTipoMovimientoLabel } from '../../types/cobraya';
import { formatCurrency, formatDate } from '../../utils/formatters';

interface ClienteBasico {
  nombre: string;
  apellido?: string | null;
  documento: string;
  telefono?: string | null;
}

interface MovimientoAhorroModalProps {
  isOpen: boolean;
  onClose: () => void;
  cuenta: CuentaAhorro | null;
  /** Necesario para el recibo/WhatsApp por movimiento — si no se pasa, esas acciones quedan ocultas. */
  cliente?: ClienteBasico | null;
}

export function MovimientoAhorroModal({ isOpen, onClose, cuenta, cliente }: MovimientoAhorroModalProps) {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [tipo, setTipo] = useState<'deposito' | 'retiro'>('deposito');
  const [monto, setMonto] = useState(0);
  const [descripcion, setDescripcion] = useState('');
  const [generandoReciboId, setGenerandoReciboId] = useState<string | null>(null);

  const { data: movimientos } = useQuery({
    queryKey: ['movimientosCuenta', cuenta?.id],
    queryFn: () => getMovimientosByCuenta(cuenta!.id),
    enabled: isOpen && !!cuenta,
  });

  const { data: tenant } = useQuery({ queryKey: ['tenant'], queryFn: getMyTenant, enabled: isOpen });

  useEffect(() => {
    if (isOpen) {
      setTipo('deposito');
      setMonto(0);
      setDescripcion('');
    }
  }, [isOpen, cuenta?.id]);

  const mutation = useMutation({
    mutationFn: () => registrarMovimientoAhorro(cuenta!.id, tipo, monto, descripcion || null),
    onSuccess: () => {
      addToast('Movimiento registrado correctamente', 'success');
      queryClient.invalidateQueries({ queryKey: ['movimientosCuenta', cuenta?.id] });
      queryClient.invalidateQueries({ queryKey: ['cuentasAhorroCliente'] });
      queryClient.invalidateQueries({ queryKey: ['todasCuentasAhorro'] });
      setMonto(0);
      setDescripcion('');
    },
    onError: (error: any) => addToast(error.message || 'Error al registrar el movimiento', 'error'),
  });

  const handleDescargarRecibo = async (m: Movimiento) => {
    if (!cliente || !cuenta) return;
    setGenerandoReciboId(m.id);
    try {
      const { exportReciboMovimientoAhorro } = await import('../../utils/pdfGenerator');
      await exportReciboMovimientoAhorro(
        {
          id: m.id,
          tipoLabel: getTipoMovimientoLabel(m.tipo),
          monto: m.monto,
          fecha: m.fecha,
          descripcion: m.descripcion,
          saldoResultante: m.saldoResultante,
          numeroCuenta: cuenta.numeroCuenta,
          clienteNombre: `${cliente.nombre} ${cliente.apellido ?? ''}`.trim(),
          clienteDocumento: cliente.documento,
        },
        { nombre: tenant?.nombre || 'CobraYA', logoUrl: tenant?.logoUrl, rtn: tenant?.rtn },
      );
    } finally {
      setGenerandoReciboId(null);
    }
  };

  const mensajeWhatsapp = (m: Movimiento) =>
    `Hola ${cliente?.nombre}, registramos un ${getTipoMovimientoLabel(m.tipo).toLowerCase()} de ${formatCurrency(Math.abs(m.monto))} en tu cuenta de ahorro ${cuenta?.numeroCuenta}. Saldo actual: ${formatCurrency(m.saldoResultante)}. — ${tenant?.nombre || 'CobraYA'}`;

  if (!isOpen || !cuenta) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-surface border border-border rounded-xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold text-main">Cuenta {cuenta.numeroCuenta}</h2>
            <p className="text-sm text-muted">Saldo actual: <span className="text-main font-medium">{formatCurrency(cuenta.saldo)}</span></p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-main transition-colors"><X className="h-5 w-5" /></button>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); if (monto > 0) mutation.mutate(); }} className="p-6 space-y-4 border-b border-border">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setTipo('deposito')}
              className={`flex items-center justify-center gap-2 py-2 rounded-lg border text-sm font-medium transition-colors ${tipo === 'deposito' ? 'border-emerald-500 bg-emerald-500/10 text-emerald-500' : 'border-border text-muted'}`}
            >
              <ArrowDownCircle className="h-4 w-4" /> Depósito
            </button>
            <button
              type="button"
              onClick={() => setTipo('retiro')}
              className={`flex items-center justify-center gap-2 py-2 rounded-lg border text-sm font-medium transition-colors ${tipo === 'retiro' ? 'border-red-500 bg-red-500/10 text-red-500' : 'border-border text-muted'}`}
            >
              <ArrowUpCircle className="h-4 w-4" /> Retiro
            </button>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted">Monto (L)</label>
            <CurrencyInput value={monto} onValueChange={setMonto} className="w-full bg-surfaceHighlight border border-border rounded-lg px-4 py-2 text-main focus:border-primary-500 focus:outline-none" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted">Descripción (opcional)</label>
            <input
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              className="w-full bg-surfaceHighlight border border-border rounded-lg px-4 py-2 text-main focus:border-primary-500 focus:outline-none"
            />
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={mutation.isPending || monto <= 0}
              className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {mutation.isPending ? 'Guardando...' : 'Registrar'}
            </button>
          </div>
        </form>

        <div className="p-4">
          <h3 className="text-sm font-semibold text-muted mb-2">Movimientos</h3>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {movimientos?.map((m) => (
              <div key={m.id} className="py-2 border-b border-border/50 text-sm space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-main truncate">{getTipoMovimientoLabel(m.tipo)}{m.descripcion ? ` — ${m.descripcion}` : ''}</p>
                    <p className="text-xs text-muted">{formatDate(m.fecha)}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`font-medium ${m.monto < 0 ? 'text-red-400' : 'text-main'}`}>{m.monto < 0 ? '' : '+'}{formatCurrency(m.monto)}</p>
                    <p className="text-xs text-muted">saldo: {formatCurrency(m.saldoResultante)}</p>
                  </div>
                </div>
                {cliente && (
                  <div className="flex items-center justify-end gap-2 flex-wrap">
                    <button
                      onClick={() => handleDescargarRecibo(m)}
                      disabled={generandoReciboId === m.id}
                      title="Descargar recibo"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-primary-500/10 text-primary-500 hover:bg-primary-500/20 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                    >
                      {generandoReciboId === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Receipt className="h-3.5 w-3.5" />}
                      Recibo
                    </button>
                    <WhatsappButton telefono={cliente.telefono} mensaje={mensajeWhatsapp(m)} />
                  </div>
                )}
              </div>
            ))}
            {(movimientos?.length ?? 0) === 0 && <p className="text-sm text-muted text-center py-4">Sin movimientos todavía</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
