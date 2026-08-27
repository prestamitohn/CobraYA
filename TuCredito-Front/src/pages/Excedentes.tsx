import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  actualizarFondoExcedente,
  calcularYGuardarExcedente,
  crearFondoExcedente,
  eliminarFondoExcedente,
  getExcedenteDetalle,
  getExcedenteFondos,
  getExcedentesPeriodos,
  getFondosExcedente,
  previsualizarExcedente,
} from '../services/cooperativaService';
import { getMyTenant } from '../services/tenantService';
import { useToast } from '../context/ToastContext';
import { formatCurrency, formatDate } from '../utils/formatters';
import { ExcedenteDetalleSocio, ExcedentePeriodo, FondoExcedenteConfig, FondoExcedenteSnapshot } from '../types/cobraya';
import { TrendingUp, Calculator, Save, ChevronDown, ChevronUp, Download, Info, Settings2, Plus, Trash2, Lock } from 'lucide-react';

// Tailwind necesita ver la clase completa como string literal en el código para generarla
// (no puede resolver `sm:grid-cols-${n}` armado en runtime) — de ahí este mapa fijo.
const GRID_COLS_CLASS: Record<number, string> = {
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
  4: 'sm:grid-cols-4',
  5: 'sm:grid-cols-5',
  6: 'sm:grid-cols-6',
};

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

function FondosPanel({ fondos }: { fondos: FondoExcedenteConfig[] }) {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [nombre, setNombre] = useState('');
  const [porcentaje, setPorcentaje] = useState(0);

  const crearMutation = useMutation({
    mutationFn: () => crearFondoExcedente(nombre, porcentaje, fondos.length),
    onSuccess: () => {
      addToast('Fondo agregado', 'success');
      setNombre('');
      setPorcentaje(0);
      queryClient.invalidateQueries({ queryKey: ['fondosExcedente'] });
    },
    onError: (error: any) => addToast(error.message || 'Error al agregar el fondo', 'error'),
  });

  const toggleMutation = useMutation({
    mutationFn: (f: FondoExcedenteConfig) => actualizarFondoExcedente(f.id, f.nombre, f.porcentaje, f.orden, !f.activo),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['fondosExcedente'] }),
    onError: (error: any) => addToast(error.message || 'Error al actualizar el fondo', 'error'),
  });

  const eliminarMutation = useMutation({
    mutationFn: (id: string) => eliminarFondoExcedente(id),
    onSuccess: () => {
      addToast('Fondo eliminado', 'success');
      queryClient.invalidateQueries({ queryKey: ['fondosExcedente'] });
    },
    onError: (error: any) => addToast(error.message || 'Error al eliminar el fondo', 'error'),
  });

  return (
    <div className="glass-panel rounded-xl border border-border overflow-hidden">
      <button onClick={() => setExpanded((v) => !v)} className="w-full flex items-center justify-between gap-3 p-4 hover:bg-surfaceHighlight/50 transition-colors text-left">
        <div className="flex items-center gap-2 min-w-0">
          <Settings2 className="h-5 w-5 text-primary-500 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-main font-medium">Fondos de excedente</p>
            <p className="text-xs text-muted truncate">{fondos.filter((f) => f.activo).length} fondo(s) activo(s) — se deducen de los ingresos antes de repartir</p>
          </div>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-muted flex-shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted flex-shrink-0" />}
      </button>
      {expanded && (
        <div className="border-t border-border p-4 space-y-4">
          <div className="space-y-2">
            {fondos.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-surfaceHighlight/50 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  {f.esReservaLegal && <Lock className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />}
                  <span className={`text-sm font-medium truncate ${f.activo ? 'text-main' : 'text-muted line-through'}`}>{f.nombre}</span>
                  <span className="text-sm text-muted flex-shrink-0">{f.porcentaje}%</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {!f.esReservaLegal && (
                    <>
                      <button
                        onClick={() => toggleMutation.mutate(f)}
                        className="text-xs font-medium text-primary-500 hover:underline"
                      >
                        {f.activo ? 'Desactivar' : 'Activar'}
                      </button>
                      <button
                        onClick={() => eliminarMutation.mutate(f.id)}
                        className="text-muted hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                  {f.esReservaLegal && <span className="text-xs text-muted">Obligatorio, mínimo 10%</span>}
                </div>
              </div>
            ))}
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); if (nombre && porcentaje > 0) crearMutation.mutate(); }}
            className="flex items-end gap-3 flex-wrap pt-2 border-t border-border"
          >
            <div className="flex-1 min-w-[160px] space-y-1">
              <label className="text-xs text-muted">Nombre del fondo</label>
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej. Contribución Social"
                className="w-full bg-surfaceHighlight border border-border rounded-lg px-3 py-2 text-sm text-main focus:border-primary-500 focus:outline-none"
              />
            </div>
            <div className="w-28 space-y-1">
              <label className="text-xs text-muted">Porcentaje</label>
              <input
                type="number"
                min={0.01}
                step={0.5}
                value={porcentaje || ''}
                onChange={(e) => setPorcentaje(Number(e.target.value))}
                className="w-full bg-surfaceHighlight border border-border rounded-lg px-3 py-2 text-sm text-main focus:border-primary-500 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={crearMutation.isPending || !nombre || porcentaje <= 0}
              className="flex items-center gap-1.5 px-3 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              Agregar
            </button>
          </form>
        </div>
      )}
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

  const { data: fondosSnapshot } = useQuery({
    queryKey: ['excedenteFondos', periodo.id],
    queryFn: () => getExcedenteFondos(periodo.id),
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
      }, fondosSnapshot ?? []);
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
          <p className="text-xs text-muted truncate">Cerrado el {formatDate(periodo.createdAt)}</p>
        </div>
        <div className="flex items-center gap-4 flex-shrink-0">
          <div className="text-right hidden sm:block">
            <p className="text-xs text-muted">Excedente neto</p>
            <p className="text-main font-semibold">{formatCurrency(periodo.excedenteNeto)}</p>
          </div>
          {expanded ? <ChevronUp className="h-4 w-4 text-muted" /> : <ChevronDown className="h-4 w-4 text-muted" />}
        </div>
      </button>
      {expanded && (
        <div className="border-t border-border">
          {fondosSnapshot && fondosSnapshot.length > 0 && (
            <div className="p-4 bg-surfaceHighlight/30 flex flex-wrap gap-4 border-b border-border">
              {fondosSnapshot.map((f: FondoExcedenteSnapshot) => (
                <div key={f.nombre} className="text-sm">
                  <span className="text-muted">{f.nombre} ({f.porcentaje}%): </span>
                  <span className="text-main font-medium">{formatCurrency(f.monto)}</span>
                </div>
              ))}
            </div>
          )}
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
  const [preview, setPreview] = useState<ExcedenteDetalleSocio[] | null>(null);

  const { data: periodos } = useQuery({ queryKey: ['excedentesPeriodos'], queryFn: getExcedentesPeriodos });
  const { data: fondos } = useQuery({ queryKey: ['fondosExcedente'], queryFn: getFondosExcedente });

  const previewMutation = useMutation({
    mutationFn: () => previsualizarExcedente(fechaDesde, fechaHasta),
    onSuccess: (data) => setPreview(data),
    onError: (error: any) => addToast(error.message || 'Error al calcular el excedente', 'error'),
  });

  const guardarMutation = useMutation({
    mutationFn: () => calcularYGuardarExcedente(fechaDesde, fechaHasta),
    onSuccess: () => {
      addToast('Reparto de excedente guardado correctamente', 'success');
      setPreview(null);
      queryClient.invalidateQueries({ queryKey: ['excedentesPeriodos'] });
    },
    onError: (error: any) => addToast(error.message || 'Error al guardar el reparto', 'error'),
  });

  useEffect(() => setPreview(null), [fechaDesde, fechaHasta]);

  const ingresos = preview ? preview.reduce((acc, d) => acc + d.interesPagado, 0) : 0;
  const fondosActivos = useMemo(() => (fondos ?? []).filter((f) => f.activo), [fondos]);
  const totalFondos = fondosActivos.reduce((acc, f) => acc + Math.round(ingresos * f.porcentaje) / 100, 0);
  const distribuible = ingresos - totalFondos;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-main">Excedentes</h1>
        <p className="text-muted">Cálculo y reparto del excedente cooperativo, en proporción al interés pagado por cada socio</p>
      </div>

      <div className="glass-panel p-4 rounded-xl border border-border flex items-start gap-3">
        <Info className="h-5 w-5 text-primary-500 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-muted">
          Al cierre del período se deducen los fondos configurados abajo (la Reserva Legal ≥10% es obligatoria, Art. 44 Decreto 65-87; puedes agregar otros como Contribución Social, Educación, etc.).
          El excedente neto se reparte entre los socios en proporción al interés que cada uno pagó en sus préstamos durante el período — no según el capital aportado.
        </p>
      </div>

      {fondos && <FondosPanel fondos={fondos} />}

      <div className="glass-panel rounded-xl border border-border p-6 space-y-4">
        <h2 className="text-lg font-semibold text-main flex items-center gap-2">
          <Calculator className="h-5 w-5 text-primary-500" />
          Calcular nuevo período
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted">Desde</label>
            <input
              type="date"
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)}
              className="w-full bg-surfaceHighlight border border-border rounded-lg px-3 py-2 text-main focus:border-primary-500 focus:outline-none"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted">Hasta</label>
            <input
              type="date"
              value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)}
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
            <div className={`grid grid-cols-1 gap-4 ${GRID_COLS_CLASS[Math.min(2 + fondosActivos.length, 6)] ?? 'sm:grid-cols-4'}`}>
              <div className="p-4 rounded-lg bg-surfaceHighlight/50 min-w-0">
                <p className="text-xs text-muted truncate">Ingresos del período</p>
                <p className="text-lg font-bold text-main truncate">{formatCurrency(ingresos)}</p>
              </div>
              {fondosActivos.map((f) => (
                <div key={f.id} className="p-4 rounded-lg bg-surfaceHighlight/50 min-w-0">
                  <p className="text-xs text-muted truncate">{f.nombre} ({f.porcentaje}%)</p>
                  <p className="text-lg font-bold text-main truncate">{formatCurrency(Math.round(ingresos * f.porcentaje) / 100)}</p>
                </div>
              ))}
              <div className="p-4 rounded-lg bg-primary-500/10 min-w-0">
                <p className="text-xs text-muted truncate">Excedente neto</p>
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
