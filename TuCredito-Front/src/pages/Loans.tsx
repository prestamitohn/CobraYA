import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getLoansByFilter, deleteLoan } from '../services/loanService';
import { getClasificacionesClientes } from '../services/clasificacionService';
import { Plus, Search, Filter, ArrowUpRight, AlertCircle, X, Trash2, Info, Edit2, Save } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { EstadoPrestamo, ClasificacionCliente, getEstadoPrestamoLabel, getClasificacionLabel } from '../types/cobraya';
import { ConfirmationModal } from '../components/ui/ConfirmationModal';
import { useToast } from '../context/ToastContext';
import { useLoanAliases } from '../hooks/useLoanAliases';
import { formatCurrency, formatDate } from '../utils/formatters';
import { ExportMenu, ExportColumn } from '../components/ui/ExportMenu';
import type { Prestamo } from '../types/cobraya';

const LOAN_EXPORT_COLUMNS: ExportColumn<Prestamo>[] = [
  { header: 'Cliente', value: (l) => l.cliente ? `${l.cliente.nombre} ${l.cliente.apellido ?? ''}`.trim() : 'N/A' },
  { header: 'Identidad', value: (l) => l.cliente?.documento ?? '' },
  { header: 'Monto', value: (l) => l.montoOtorgado },
  { header: 'Tasa (%)', value: (l) => l.tasaInteres },
  { header: 'Frecuencia', value: (l) => l.frecuenciaCobro },
  { header: 'Sistema', value: (l) => l.sistemaAmortizacion },
  { header: 'Fecha Otorgamiento', value: (l) => formatDate(l.fechaOtorgamiento) },
  { header: 'Estado', value: (l) => getEstadoPrestamoLabel(l.estado) },
];

export function Loans() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const { getAlias, setAlias } = useLoanAliases();
  const [showFilters, setShowFilters] = useState(false);
  const [editingAliasId, setEditingAliasId] = useState<string | null>(null);
  const [editingAliasValue, setEditingAliasValue] = useState('');

  const [filters, setFilters] = useState<{
    nombre: string;
    estado: EstadoPrestamo | '';
    fechaDesde: string;
    fechaHasta: string;
    montoMin: string;
    montoMax: string;
    clasificacion: ClasificacionCliente | '';
  }>({
    nombre: '',
    estado: '',
    fechaDesde: '',
    fechaHasta: '',
    montoMin: '',
    montoMax: '',
    clasificacion: '',
  });

  useEffect(() => {
    const statusParam = searchParams.get('status');
    if (statusParam) {
      setFilters(prev => ({ ...prev, estado: statusParam as EstadoPrestamo }));
      setShowFilters(true);
    }
  }, [searchParams]);
  const [nameInput, setNameInput] = useState('');
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; id?: string }>({ isOpen: false });

  const { data: loans, isLoading, error } = useQuery({
    queryKey: ['loans', filters],
    queryFn: () => getLoansByFilter({
      nombre: filters.nombre || undefined,
      estado: filters.estado || undefined,
      fechaDesde: filters.fechaDesde || undefined,
      fechaHasta: filters.fechaHasta || undefined,
      montoMin: filters.montoMin ? Number(filters.montoMin) : undefined,
      montoMax: filters.montoMax ? Number(filters.montoMax) : undefined,
    }),
  });

  const { data: clasificaciones } = useQuery({
    queryKey: ['clasificaciones'],
    queryFn: getClasificacionesClientes,
  });
  const clasificacionPorCliente = new Map(clasificaciones?.map((c) => [c.clienteId, c]));

  const filteredLoans = filters.clasificacion
    ? loans?.filter((loan) => clasificacionPorCliente.get(loan.clienteId)?.clasificacion === filters.clasificacion)
    : loans;

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteLoan(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loans'] });
      addToast('Préstamo eliminado correctamente', 'success');
      setConfirmModal({ ...confirmModal, isOpen: false });
    },
    onError: () => {
      addToast('Error al eliminar el préstamo', 'error');
    }
  });

  const handleStartEditAlias = (loanId: string, currentAlias: string) => {
    setEditingAliasId(loanId);
    setEditingAliasValue(currentAlias);
  };

  const handleSaveAlias = (loanId: string) => {
    setAlias(loanId, editingAliasValue.trim());
    if (editingAliasValue.trim()) addToast('Alias guardado', 'success');
    setEditingAliasId(null);
  };

  const handleDelete = (id: string) => {
    setConfirmModal({ isOpen: true, id });
  };

  const onConfirmAction = () => {
    if (confirmModal.id) {
      deleteMutation.mutate(confirmModal.id);
    }
  };

  const handleFilterChange = (key: keyof typeof filters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters({ nombre: '', estado: '', fechaDesde: '', fechaHasta: '', montoMin: '', montoMax: '', clasificacion: '' });
    setNameInput('');
  };

  const hasAdvancedFilters = !!(filters.fechaDesde || filters.fechaHasta || filters.montoMin || filters.montoMax || filters.clasificacion);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-red-400">
        <AlertCircle className="h-12 w-12 mb-4" />
        <p>Error al cargar los préstamos</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-main">Préstamos</h1>
          <p className="text-muted">Gestiona y visualiza todos los préstamos activos</p>
        </div>
        <div className="flex gap-2">
            <ExportMenu data={filteredLoans} columns={LOAN_EXPORT_COLUMNS} filenameBase="Prestamos" title="Reporte de Préstamos" />
            <Link
            to="/loans/create"
            className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg transition-colors shadow-lg shadow-primary-500/20"
            >
            <Plus className="h-5 w-5" />
            Nuevo Préstamo
            </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="glass-panel p-4 rounded-xl flex items-center gap-4">
          <div className="p-3 rounded-lg bg-primary-500/10 text-primary-500">
            <ArrowUpRight className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm text-muted">Total Préstamos</p>
            <p className="text-2xl font-bold text-main">{filteredLoans?.length || 0}</p>
          </div>
        </div>
      </div>

      {searchParams.get('view') === 'history' && (
        <div className="bg-primary-500/10 border border-primary-500/20 rounded-xl p-4 flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
          <Info className="h-5 w-5 text-primary-600 dark:text-primary-400 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-medium text-primary-800 dark:text-primary-300">Total Prestado Histórico</h3>
            <p className="text-sm text-primary-700 dark:text-primary-200 mt-1">
              Esta lista representa todos los préstamos otorgados históricamente. La suma total de los montos otorgados aquí corresponde al KPI "Total Prestado Histórico".
            </p>
          </div>
        </div>
      )}

      {filters.estado === 'activo' && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 flex items-start gap-3">
          <Info className="h-5 w-5 text-blue-400 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-medium text-blue-400">Préstamos con Capital Pendiente</h3>
            <p className="text-sm text-blue-400/80 mt-1">
              Estos son los préstamos que actualmente se encuentran activos y tienen cuotas pendientes de pago.
              El "Capital Pendiente" es la suma de los saldos restantes de estos préstamos.
            </p>
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })}
        onConfirm={onConfirmAction}
        title="Eliminar Préstamo - ¡Acción Peligrosa!"
        message="¡Atención! Si desea archivar el préstamo, debe marcar todas sus cuotas como pagadas. Solo elimine el préstamo si fue creado por error con datos incorrectos. Esta acción es irreversible."
        confirmText="Eliminar definitivamente"
        cancelText="Cancelar"
        variant="danger"
        isLoading={deleteMutation.isPending}
      />
      <div className="glass-panel rounded-xl overflow-hidden border border-border">
        <div className="p-4 border-b border-border flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
              <input
                type="text"
                placeholder="Buscar por nombre, identidad o teléfono..."
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleFilterChange('nombre', nameInput);
                  }
                }}
                className="w-full bg-surface/50 border border-border rounded-lg pl-10 pr-4 py-2 text-sm text-main placeholder-muted focus:outline-none focus:border-primary-500 transition-colors"
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm transition-colors ${showFilters || hasAdvancedFilters ? 'bg-primary-500/10 border-primary-500 text-primary-500' : 'border-border text-muted hover:bg-surfaceHighlight'}`}
            >
              <Filter className="h-4 w-4" />
              Filtros
            </button>
          </div>

          {showFilters && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-4 border-t border-border animate-in fade-in slide-in-from-top-2">
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Estado</label>
                <select
                  value={filters.estado}
                  onChange={(e) => handleFilterChange('estado', e.target.value)}
                  className="w-full bg-surface/50 border border-border rounded-lg px-3 py-2 text-sm text-main focus:outline-none focus:border-primary-500 [&>option]:bg-surface"
                >
                  <option value="">Todos</option>
                  <option value="activo">Activo</option>
                  <option value="finalizado">Finalizado</option>
                  <option value="eliminado">Eliminado</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Clasificación del Cliente</label>
                <select
                  value={filters.clasificacion}
                  onChange={(e) => handleFilterChange('clasificacion', e.target.value)}
                  className="w-full bg-surface/50 border border-border rounded-lg px-3 py-2 text-sm text-main focus:outline-none focus:border-primary-500 [&>option]:bg-surface"
                >
                  <option value="">Todas</option>
                  <option value="excelente">{getClasificacionLabel('excelente')}</option>
                  <option value="bueno">{getClasificacionLabel('bueno')}</option>
                  <option value="regular">{getClasificacionLabel('regular')}</option>
                  <option value="malo">{getClasificacionLabel('malo')}</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Otorgado Desde</label>
                <input
                  type="date"
                  value={filters.fechaDesde}
                  onChange={(e) => handleFilterChange('fechaDesde', e.target.value)}
                  className="w-full bg-surface/50 border border-border rounded-lg px-3 py-2 text-sm text-main focus:outline-none focus:border-primary-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Otorgado Hasta</label>
                <input
                  type="date"
                  value={filters.fechaHasta}
                  onChange={(e) => handleFilterChange('fechaHasta', e.target.value)}
                  className="w-full bg-surface/50 border border-border rounded-lg px-3 py-2 text-sm text-main focus:outline-none focus:border-primary-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Monto Mínimo (L)</label>
                <input
                  type="number"
                  min="0"
                  value={filters.montoMin}
                  onChange={(e) => handleFilterChange('montoMin', e.target.value)}
                  className="w-full bg-surface/50 border border-border rounded-lg px-3 py-2 text-sm text-main focus:outline-none focus:border-primary-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Monto Máximo (L)</label>
                <input
                  type="number"
                  min="0"
                  value={filters.montoMax}
                  onChange={(e) => handleFilterChange('montoMax', e.target.value)}
                  className="w-full bg-surface/50 border border-border rounded-lg px-3 py-2 text-sm text-main focus:outline-none focus:border-primary-500"
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={clearFilters}
                  className="flex items-center justify-center gap-2 px-3 py-2 border border-red-500/20 text-red-400 rounded-lg text-sm hover:bg-red-500/10 transition-colors w-full"
                >
                  <X className="h-4 w-4" />
                  Limpiar Filtros
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          {isLoading ? (
             <div className="flex items-center justify-center h-64">
               <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
             </div>
          ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-surfaceHighlight text-muted">
              <tr>
                <th className="px-6 py-3 font-medium">Alias</th>
                <th className="px-6 py-3 font-medium">Cliente</th>
                <th className="px-6 py-3 font-medium">Monto</th>
                <th className="px-6 py-3 font-medium">Tasa</th>
                <th className="px-6 py-3 font-medium">Frecuencia</th>
                <th className="px-6 py-3 font-medium">Fecha</th>
                <th className="px-6 py-3 font-medium">Estado</th>
                <th className="px-6 py-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredLoans?.map((loan) => (
                <tr key={loan.id} className="hover:bg-surfaceHighlight/50 transition-colors">
                  <td className="px-6 py-4 text-muted italic">
                    {editingAliasId === loan.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editingAliasValue}
                          onChange={(e) => setEditingAliasValue(e.target.value)}
                          className="w-24 bg-surface/50 border border-border rounded px-2 py-1 text-xs text-main"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveAlias(loan.id);
                            if (e.key === 'Escape') setEditingAliasId(null);
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <button
                          onClick={(e) => { e.stopPropagation(); handleSaveAlias(loan.id); }}
                          className="text-green-500 hover:bg-green-500/10 p-1 rounded"
                        >
                          <Save className="h-3 w-3" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditingAliasId(null); }}
                          className="text-red-500 hover:bg-red-500/10 p-1 rounded"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 group cursor-pointer" onClick={() => handleStartEditAlias(loan.id, getAlias(loan.id))}>
                        <span>{getAlias(loan.id) || '-'}</span>
                        <Edit2 className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-primary-500" />
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => loan.cliente && navigate(`/borrowers/${loan.cliente.documento}`)}
                      className="text-primary-400 hover:text-primary-300 font-medium hover:underline text-left"
                    >
                      {loan.cliente ? `${loan.cliente.nombre} ${loan.cliente.apellido ?? ''}` : 'N/A'}
                    </button>
                  </td>
                  <td className="px-6 py-4 text-main">{formatCurrency(loan.montoOtorgado)}</td>
                  <td className="px-6 py-4 text-muted">{loan.tasaInteres}%</td>
                  <td className="px-6 py-4 text-muted capitalize">{loan.frecuenciaCobro}</td>
                  <td className="px-6 py-4 text-muted">{formatDate(loan.fechaOtorgamiento)}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                      ${loan.estado === 'activo' ? 'bg-green-500/10 text-green-500' :
                        loan.estado === 'finalizado' ? 'bg-blue-500/10 text-blue-500' :
                        'bg-red-500/10 text-red-500'}`}>
                      {getEstadoPrestamoLabel(loan.estado)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <Link
                        to={`/loans/${loan.id}`}
                        className="text-primary-400 hover:text-primary-300 font-medium hover:underline"
                        title="Ver detalles"
                      >
                        Ver detalles
                      </Link>
                      {(loan.estado === 'activo' || loan.estado === 'finalizado') && (
                        <button
                          onClick={() => handleDelete(loan.id)}
                          className="text-red-400 hover:text-red-300 hover:bg-red-400/10 p-1.5 rounded-lg transition-colors"
                          title="Eliminar Préstamo"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredLoans?.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-muted">
                    No se encontraron préstamos con los filtros seleccionados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          )}
        </div>
      </div>
    </div>
  );
}
