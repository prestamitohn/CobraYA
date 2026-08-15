import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  calcularYGuardarExcedente,
  getExcedenteDetalle,
  getExcedentesPeriodos,
  previsualizarExcedente,
} from '../services/cooperativaService';
import { getMyTenant } from '../services/tenantService';
import { useToast } from '../context/ToastContext';
import { formatCurrency, formatDate } from '../utils/formatters';
import { ExcedenteDetalleSocio, ExcedentePeriodo } from '../types/cobraya';
import { TrendingUp, Calculator, Save, ChevronDown, ChevronUp, Download, Info } from 'lucide-react';

function primerDiaDelAnio(): string {
  return `${new Date().getFullYear()}-01-01`;
}

function hoy(): string {
  return new Date().toISOString().slice(0, 10);
}

function DetalleTable({
  detalle,
  onDescargarCertificado,
  descargando,
}: {
  detalle: ExcedenteDetalleSocio[];
  onDescargarCertificado?: (socio: ExcedenteDetalleSocio) => void;
  descargando?: string | null;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="bg-surfaceHighlight text-muted">
          <tr>
            <th className="px-4 py-2 font-medium">Socio</th>
            <th className="px-4 py-2 font-medium text-right">Interés Pagado</th>
            <th className="px-4 py-2 font-medium text-right">Proporción</th>
            <th className="px-4 py-2 font-medium text-right">Excedente</th>
            {onDescargarCertificado && <th className="px-4 py-2 font-medium text-right">Certificado</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {detalle.map((d) => (
            <tr key={d.clienteId} className="hover:bg-surfaceHighlight/50 transition-colors">
              <td className="px-4 py-2 text-main">{d.nombre} {d.apellido ?? ''}</td>
              <td className="px-4 py-2 text-muted text-right">{formatCurrency(d.interesPagado)}</td>
              <td className="px-4 py-2 text-muted text-right">{(d.proporcion * 100).toFixed(2)}%</td>
              <td className="px-4 py-2 text-main text-right font-medium">{formatCurrency(d.montoExcedente)}</td>
              {onDescargarCertificado && (
                <td className="px-4 py-2 text-right">
                  <button
                    onClick={() => onDescargarCertificado(d)}
                    disabled={descargando === d.clienteId}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-primary-500/10 text-primary-500 hover:bg-primary-500/20 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                  >
                    <Download className="h-3.5 w-3.5" />
                    {descargando === d.clienteId ? 'Generando...' : 'PDF'}
                  </button>
                </td>
              )}
            </tr>
          ))}
          {detalle.length === 0 && (
            <tr>
              <td colSpan={onDescargarCertificado ? 5 : 4} className="px-4 py-6 text-center text-muted">
                No hay socios con interés pagado en este período
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function PeriodoRow({ periodo }: { periodo: ExcedentePeriodo }) {
  const [expanded, setExpanded] = useState(false);
  const [descargando, setDescargando] = useState<string | null>(null);
  const { addToast } = useToast();

  const { data: detalle, isLoading } = useQuery({
    queryKey: ['excedenteDetalle', periodo.id],
    queryFn: () => getExcedenteDetalle(periodo.id),
    enabled: expanded,
  });

  const handleDescargar = async (socio: ExcedenteDetalleSocio) => {
    setDescargando(socio.clienteId);
    try {
      const [{ exportCertificadoExcedente }, tenant] = await Promise.all([
        import('../utils/pdfGenerator'),
        getMyTenant(),
      ]);
      await exportCertificadoExcedente(periodo, socio, {
        nombre: tenant?.nombre ?? 'CobraYA',
        logoUrl: tenant?.logoUrl,
        rtn: tenant?.rtn,
      });
    } catch (err: any) {
      addToast(err.message || 'Error al generar el certificado', 'error');
    } finally {
      setDescargando(null);
    }
  };

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-3 p-4 hover:bg-surfaceHighlight/50 transition-colors text-left"
      >
        <div className="min-w-0">
          <p className="text-main font-medium truncate">{formatDate(periodo.fechaDesde)} — {formatDate(periodo.fechaHasta)}</p>
          <p className="text-xs text-muted truncate">Cerrado el {formatDate(periodo.createdAt)} · Reserva {periodo.porcentajeReserva}%</p>
        </div>
        <div className="flex items-center gap-4 flex-shrink-0">
          <div className="text-right hidden sm:block">
            <p className="text-xs text-muted">Excedente distribuible</p>
            <p className="text-main font-semibold">{formatCurrency(periodo.excedenteDistribuible)}</p>
          </div>
          {expanded ? <ChevronUp className="h-4 w-4 text-muted" /> : <ChevronDown className="h-4 w-4 text-muted" />}
        </div>
      </button>
      {expanded && (
        <div className="border-t border-border">
          {isLoading ? (
            <div className="p-6 text-center text-muted text-sm">Cargando detalle...</div>
          ) : (
            <DetalleTable detalle={detalle ?? []} onDescargarCertificado={handleDescargar} descargando={descargando} />
          )}
        </div>
      )}
    </div>
  );
}

export function Excedentes() {
  const queryClient = useQueryClient();
  const { addToast } = useToast();

  const [fechaDesde, setFechaDesde] = useState(primerDiaDelAnio());
  const [fechaHasta, setFechaHasta] = useState(hoy());
  const [porcentajeReserva, setPorcentajeReserva] = useState(10);
  const [preview, setPreview] = useState<ExcedenteDetalleSocio[] | null>(null);

  const { data: periodos } = useQuery({ queryKey: ['excedentesPeriodos'], queryFn: getExcedentesPeriodos });

  const previewMutation = useMutation({
    mutationFn: () => previsualizarExcedente(fechaDesde, fechaHasta, porcentajeReserva),
    onSuccess: (data) => setPreview(data),
    onError: (error: any) => addToast(error.message || 'Error al calcular el excedente', 'error'),
  });

  const guardarMutation = useMutation({
    mutationFn: () => calcularYGuardarExcedente(fechaDesde, fechaHasta, porcentajeReserva),
    onSuccess: () => {
      addToast('Reparto de excedente guardado correctamente', 'success');
      setPreview(null);
      queryClient.invalidateQueries({ queryKey: ['excedentesPeriodos'] });
    },
    onError: (error: any) => addToast(error.message || 'Error al guardar el reparto', 'error'),
  });

  const ingresos = preview ? preview.reduce((acc, d) => acc + d.interesPagado, 0) : 0;
  const reserva = ingresos * (porcentajeReserva / 100);
  const distribuible = ingresos - reserva;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-main">Excedentes</h1>
        <p className="text-muted">Cálculo y reparto del excedente cooperativo, en proporción al interés pagado por cada socio</p>
      </div>

      <div className="glass-panel p-4 rounded-xl border border-border flex items-start gap-3">
        <Info className="h-5 w-5 text-primary-500 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-muted">
          Al cierre del período, la ley (Art. 44, Decreto 65-87) exige reservar al menos el 10% de los ingresos como Fondo de Reserva Legal.
          El resto (excedente distribuible) se reparte entre los socios en proporción al interés que cada uno pagó en sus préstamos durante el período — no según el capital aportado.
        </p>
      </div>

      <div className="glass-panel rounded-xl border border-border p-6 space-y-4">
        <h2 className="text-lg font-semibold text-main flex items-center gap-2">
          <Calculator className="h-5 w-5 text-primary-500" />
          Calcular nuevo período
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted">Desde</label>
            <input
              type="date"
              value={fechaDesde}
              onChange={(e) => { setFechaDesde(e.target.value); setPreview(null); }}
              className="w-full bg-surfaceHighlight border border-border rounded-lg px-3 py-2 text-main focus:border-primary-500 focus:outline-none"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted">Hasta</label>
            <input
              type="date"
              value={fechaHasta}
              onChange={(e) => { setFechaHasta(e.target.value); setPreview(null); }}
              className="w-full bg-surfaceHighlight border border-border rounded-lg px-3 py-2 text-main focus:border-primary-500 focus:outline-none"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted">Reserva legal (%, mínimo 10)</label>
            <input
              type="number"
              min={10}
              step={0.5}
              value={porcentajeReserva}
              onChange={(e) => { setPorcentajeReserva(Number(e.target.value)); setPreview(null); }}
              className="w-full bg-surfaceHighlight border border-border rounded-lg px-3 py-2 text-main focus:border-primary-500 focus:outline-none"
            />
          </div>
        </div>
        <div className="flex justify-end">
          <button
            onClick={() => previewMutation.mutate()}
            disabled={previewMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            <Calculator className="h-4 w-4" />
            {previewMutation.isPending ? 'Calculando...' : 'Previsualizar'}
          </button>
        </div>

        {preview && (
          <div className="space-y-4 pt-4 border-t border-border">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg bg-surfaceHighlight/50 min-w-0">
                <p className="text-xs text-muted truncate">Ingresos del período</p>
                <p className="text-lg font-bold text-main truncate">{formatCurrency(ingresos)}</p>
              </div>
              <div className="p-4 rounded-lg bg-surfaceHighlight/50 min-w-0">
                <p className="text-xs text-muted truncate">Reserva legal ({porcentajeReserva}%)</p>
                <p className="text-lg font-bold text-main truncate">{formatCurrency(reserva)}</p>
              </div>
              <div className="p-4 rounded-lg bg-primary-500/10 min-w-0">
                <p className="text-xs text-muted truncate">Excedente distribuible</p>
                <p className="text-lg font-bold text-primary-500 truncate">{formatCurrency(distribuible)}</p>
              </div>
            </div>

            <DetalleTable detalle={preview} />

            <div className="flex justify-end">
              <button
                onClick={() => guardarMutation.mutate()}
                disabled={guardarMutation.isPending || preview.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {guardarMutation.isPending ? 'Guardando...' : 'Confirmar y Guardar Reparto'}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-main flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary-500" />
          Historial de repartos
        </h2>
        {periodos?.length === 0 && (
          <div className="glass-panel rounded-xl border border-border p-8 text-center text-muted">
            Aún no hay ningún cierre de excedente guardado.
          </div>
        )}
        <div className="space-y-3">
          {periodos?.map((p) => <PeriodoRow key={p.id} periodo={p} />)}
        </div>
      </div>
    </div>
  );
}
