import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Bell, Clock, CalendarClock, AlertTriangle, FlagOff, ThumbsUp, ShieldAlert } from 'lucide-react';
import { getSmartAlerts, AlertaItem, TipoAlerta } from '../../services/alertsService';
import { formatCurrency } from '../../utils/formatters';

const ALERTA_CONFIG: Record<TipoAlerta, { titulo: string; icon: typeof Bell; color: string }> = {
  paga_hoy: { titulo: 'Paga Hoy', icon: Clock, color: 'text-primary-500 bg-primary-500/10' },
  vence_manana: { titulo: 'Vence Mañana', icon: CalendarClock, color: 'text-accent-goldDark bg-accent-gold/10' },
  en_mora: { titulo: 'En Mora', icon: AlertTriangle, color: 'text-red-500 bg-red-500/10' },
  finaliza_pronto: { titulo: 'Préstamo por Finalizar', icon: FlagOff, color: 'text-blue-500 bg-blue-500/10' },
  elegible_nuevo: { titulo: 'Elegible para Nuevo Préstamo', icon: ThumbsUp, color: 'text-emerald-500 bg-emerald-500/10' },
  no_elegible_refinanciamiento: { titulo: 'No Recomendado para Refinanciamiento', icon: ShieldAlert, color: 'text-red-500 bg-red-500/10' },
};

const ORDEN_TIPOS: TipoAlerta[] = ['en_mora', 'paga_hoy', 'vence_manana', 'finaliza_pronto', 'no_elegible_refinanciamiento', 'elegible_nuevo'];

function describirAlerta(a: AlertaItem): string {
  switch (a.tipo) {
    case 'paga_hoy': return `Cuota de ${formatCurrency(a.monto ?? 0)} vence hoy`;
    case 'vence_manana': return `Cuota de ${formatCurrency(a.monto ?? 0)} vence mañana`;
    case 'en_mora': return `${a.cantidad} cuota(s) vencida(s) por ${formatCurrency(a.monto ?? 0)}`;
    case 'finaliza_pronto': return `Le quedan ${a.cantidad} cuota(s) para finalizar`;
    case 'elegible_nuevo': return 'Buen historial de pago, sin préstamo activo';
    case 'no_elegible_refinanciamiento': return 'Historial de pago deficiente';
    default: return '';
  }
}

interface NotificationBellProps {
  enabled?: boolean;
}

export function NotificationBell({ enabled = true }: NotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const { data: alerts } = useQuery({
    queryKey: ['smartAlerts'],
    queryFn: getSmartAlerts,
    enabled,
    staleTime: 60_000,
  });

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!enabled) return null;

  const total = alerts?.length ?? 0;
  const grouped = ORDEN_TIPOS.map((tipo) => ({ tipo, items: (alerts ?? []).filter((a) => a.tipo === tipo) })).filter((g) => g.items.length > 0);

  const handleClickAlerta = (a: AlertaItem) => {
    setIsOpen(false);
    if (a.prestamoId) {
      navigate(`/loans/${a.prestamoId}`);
    } else if (a.clienteDocumento) {
      navigate(`/borrowers/${a.clienteDocumento}`);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setIsOpen((o) => !o)}
        className="relative rounded-full p-2 text-muted hover:text-main hover:bg-surfaceHighlight transition-colors"
        title="Alertas"
      >
        <Bell className="h-5 w-5" />
        {total > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {total > 9 ? '9+' : total}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 max-h-[28rem] overflow-y-auto bg-surface border border-border rounded-xl shadow-lg py-2 animate-in fade-in slide-in-from-top-2 z-50">
          <div className="px-4 py-2 border-b border-border">
            <p className="text-sm font-semibold text-main">Alertas Inteligentes</p>
          </div>

          {grouped.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted">
              Todo al día — no hay alertas pendientes.
            </div>
          ) : (
            grouped.map(({ tipo, items }) => {
              const config = ALERTA_CONFIG[tipo];
              const Icon = config.icon;
              return (
                <div key={tipo} className="py-1">
                  <p className="px-4 pt-2 pb-1 text-xs font-semibold text-muted uppercase tracking-wide">{config.titulo}</p>
                  {items.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => handleClickAlerta(a)}
                      className="w-full flex items-start gap-3 px-4 py-2 text-left hover:bg-surfaceHighlight transition-colors"
                    >
                      <div className={`p-1.5 rounded-lg flex-shrink-0 ${config.color}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-main truncate">{a.clienteNombre}</p>
                        <p className="text-xs text-muted">{describirAlerta(a)}</p>
                      </div>
                    </button>
                  ))}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
