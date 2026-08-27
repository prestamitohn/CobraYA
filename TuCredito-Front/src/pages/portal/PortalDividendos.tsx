import { useQuery } from '@tanstack/react-query';
import { getExcedentesPeriodos, getExcedenteDetalle, getMiExcedenteEstimado, getMiPerfilSocio } from '../../services/cooperativaService';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { TrendingUp, Clock } from 'lucide-react';

function primerDiaDelAnio(): string {
  return `${new Date().getFullYear()}-01-01`;
}

function hoy(): string {
  return new Date().toISOString().slice(0, 10);
}

function HistorialRow({ periodoId, clienteId, fechaDesde, fechaHasta, createdAt }: { periodoId: string; clienteId: string; fechaDesde: string; fechaHasta: string; createdAt: string }) {
  const { data: detalle } = useQuery({ queryKey: ['excedenteDetalle', periodoId], queryFn: () => getExcedenteDetalle(periodoId) });
  const miDetalle = detalle?.find((d) => d.clienteId === clienteId);

  if (!miDetalle) return null;

  return (
    <div className="glass-panel p-4 rounded-xl border border-border flex items-center justify-between gap-3 flex-wrap">
      <div className="min-w-0">
        <p className="text-main font-medium truncate">{formatDate(fechaDesde)} — {formatDate(fechaHasta)}</p>
        <p className="text-xs text-muted truncate">Cerrado el {formatDate(createdAt)}</p>
      </div>
      <p className="text-lg font-bold text-primary-500 flex-shrink-0">{formatCurrency(miDetalle.montoExcedente)}</p>
    </div>
  );
}

export function PortalDividendos() {
  const { data: perfil } = useQuery({ queryKey: ['miPerfilSocio'], queryFn: getMiPerfilSocio });
  const { data: periodos, isLoading } = useQuery({ queryKey: ['excedentesPeriodos'], queryFn: getExcedentesPeriodos });
  const { data: estimado } = useQuery({
    queryKey: ['miExcedenteEstimado'],
    queryFn: () => getMiExcedenteEstimado(primerDiaDelAnio(), hoy()),
  });

  if (isLoading || !perfil) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-main">Dividendos</h1>
        <p className="text-muted">Excedente que te ha correspondido en cada cierre — y una estimación provisional del ejercicio en curso</p>
      </div>

      <div className="glass-panel p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 flex items-center gap-4">
        <div className="p-3 rounded-lg bg-amber-500/10 text-amber-500 flex-shrink-0"><Clock className="h-6 w-6" /></div>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted flex items-center gap-2">
            Estimado del ejercicio {new Date().getFullYear()}
            <span className="text-[10px] font-medium uppercase tracking-wide bg-amber-500/20 text-amber-600 rounded px-1.5 py-0.5">Provisional</span>
          </p>
          <p className="text-2xl font-bold text-main">{formatCurrency(estimado?.montoExcedente ?? 0)}</p>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-main flex items-center gap-2"><TrendingUp className="h-5 w-5 text-primary-500" /> Historial de cierres</h2>
        {periodos?.map((p) => (
          <HistorialRow key={p.id} periodoId={p.id} clienteId={perfil.clienteId} fechaDesde={p.fechaDesde} fechaHasta={p.fechaHasta} createdAt={p.createdAt} />
        ))}
        {(periodos?.length ?? 0) === 0 && (
          <div className="glass-panel rounded-xl border border-border p-8 text-center text-muted">Aún no hay ningún cierre de excedente en tu cooperativa</div>
        )}
      </div>
    </div>
  );
}
