import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getBorrowers } from '../services/borrowerService';
import { getProductosAhorro, getTodasCuentasAhorro } from '../services/cooperativaService';
import { ProductoAhorroModal } from '../components/cooperativa/ProductoAhorroModal';
import { MovimientoAhorroModal } from '../components/cooperativa/MovimientoAhorroModal';
import { Search, AlertCircle, PiggyBank, Plus, Pencil, Settings2, ChevronDown, ChevronUp } from 'lucide-react';
import { formatCurrency } from '../utils/formatters';
import { StatusBadge } from '../components/ui/StatusBadge';
import { CuentaAhorro, ProductoAhorro, getPeriodicidadLabel, getTipoProductoAhorroLabel } from '../types/cobraya';

export function Ahorros() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [productosExpanded, setProductosExpanded] = useState(true);
  const [productoModalOpen, setProductoModalOpen] = useState(false);
  const [productoEditando, setProductoEditando] = useState<ProductoAhorro | null>(null);
  const [cuentaSeleccionada, setCuentaSeleccionada] = useState<CuentaAhorro | null>(null);

  const { data: productos, isLoading: isLoadingProductos } = useQuery({ queryKey: ['productosAhorro'], queryFn: getProductosAhorro });
  const { data: cuentas, isLoading: isLoadingCuentas, error } = useQuery({ queryKey: ['todasCuentasAhorro'], queryFn: getTodasCuentasAhorro });
  const { data: socios } = useQuery({ queryKey: ['borrowers'], queryFn: () => getBorrowers() });

  const sociosPorId = useMemo(() => {
    const map: Record<string, { nombre: string; apellido?: string | null; documento: string }> = {};
    for (const s of socios ?? []) map[s.id] = s;
    return map;
  }, [socios]);

  const productosPorId = useMemo(() => {
    const map: Record<string, ProductoAhorro> = {};
    for (const p of productos ?? []) map[p.id] = p;
    return map;
  }, [productos]);

  const filteredCuentas = useMemo(() => {
    if (!cuentas) return cuentas;
    if (!searchTerm) return cuentas;
    const term = searchTerm.toLowerCase();
    return cuentas.filter((c) => {
      const socio = sociosPorId[c.clienteId];
      return (
        c.numeroCuenta.toLowerCase().includes(term) ||
        (socio && `${socio.nombre} ${socio.apellido ?? ''}`.toLowerCase().includes(term))
      );
    });
  }, [cuentas, searchTerm, sociosPorId]);

  const totalAhorrado = (cuentas ?? []).reduce((acc, c) => acc + c.saldo, 0);

  if (isLoadingProductos || isLoadingCuentas) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-red-400">
        <AlertCircle className="h-12 w-12 mb-4" />
        <p>Error al cargar los ahorros</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-main">Ahorros</h1>
        <p className="text-muted">Productos de ahorro y cuentas de los socios</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="glass-panel p-4 rounded-xl flex items-center gap-4">
          <div className="p-3 rounded-lg bg-primary-500/10 text-primary-500 flex-shrink-0">
            <PiggyBank className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <p className="text-sm text-muted truncate">Total Ahorrado</p>
            <p className="text-2xl font-bold text-main truncate">{formatCurrency(totalAhorrado)}</p>
          </div>
        </div>
      </div>

      <div className="glass-panel rounded-xl border border-border overflow-hidden">
        <button onClick={() => setProductosExpanded((v) => !v)} className="w-full flex items-center justify-between gap-3 p-4 hover:bg-surfaceHighlight/50 transition-colors text-left">
          <div className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-primary-500" />
            <p className="text-main font-medium">Productos ({productos?.length ?? 0})</p>
          </div>
          {productosExpanded ? <ChevronUp className="h-4 w-4 text-muted" /> : <ChevronDown className="h-4 w-4 text-muted" />}
        </button>
        {productosExpanded && (
          <div className="border-t border-border p-4 space-y-2">
            <div className="flex justify-end">
              <button
                onClick={() => { setProductoEditando(null); setProductoModalOpen(true); }}
                className="flex items-center gap-2 px-3 py-1.5 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <Plus className="h-4 w-4" /> Nuevo Producto
              </button>
            </div>
            {productos?.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-surfaceHighlight/50 flex-wrap">
                <div className="min-w-0">
                  <p className={`text-sm font-medium truncate ${p.activo ? 'text-main' : 'text-muted line-through'}`}>{p.nombre}</p>
                  <p className="text-xs text-muted">{getTipoProductoAhorroLabel(p.tipo)} · {p.tasaPasiva}% anual · Capitalización {getPeriodicidadLabel(p.periodicidadCapitalizacion).toLowerCase()}</p>
                </div>
                <button onClick={() => { setProductoEditando(p); setProductoModalOpen(true); }} className="text-muted hover:text-primary-500 transition-colors flex-shrink-0">
                  <Pencil className="h-4 w-4" />
                </button>
              </div>
            ))}
            {(productos?.length ?? 0) === 0 && <p className="text-sm text-muted text-center py-4">Sin productos de ahorro todavía</p>}
          </div>
        )}
      </div>

      <div className="glass-panel rounded-xl overflow-hidden border border-border">
        <div className="p-4 border-b border-border">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
            <input
              type="text"
              placeholder="Buscar por socio o número de cuenta..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-surface/50 border border-border rounded-lg pl-10 pr-4 py-2 text-sm text-main placeholder-muted focus:outline-none focus:border-primary-500 transition-colors"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-surfaceHighlight text-muted">
              <tr>
                <th className="px-6 py-3 font-medium">Socio</th>
                <th className="px-6 py-3 font-medium">Cuenta</th>
                <th className="px-6 py-3 font-medium">Producto</th>
                <th className="px-6 py-3 font-medium">Estado</th>
                <th className="px-6 py-3 font-medium text-right">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredCuentas?.map((c) => {
                const socio = sociosPorId[c.clienteId];
                const producto = productosPorId[c.productoId];
                return (
                  <tr key={c.id} className="hover:bg-surfaceHighlight/50 transition-colors cursor-pointer" onClick={() => setCuentaSeleccionada(c)}>
                    <td className="px-6 py-4">
                      <button
                        onClick={(e) => { e.stopPropagation(); if (socio) navigate(`/borrowers/${socio.documento}?tab=ahorros`); }}
                        className="text-primary-400 hover:text-primary-300 font-medium hover:underline text-left"
                      >
                        {socio ? `${socio.nombre} ${socio.apellido ?? ''}` : '—'}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-muted">{c.numeroCuenta}</td>
                    <td className="px-6 py-4 text-muted">{producto?.nombre ?? '—'}</td>
                    <td className="px-6 py-4">
                      <StatusBadge variant={c.estado === 'activa' ? 'success' : c.estado === 'vencida' ? 'error' : 'default'}>{c.estado}</StatusBadge>
                    </td>
                    <td className="px-6 py-4 text-main text-right font-medium">{formatCurrency(c.saldo)}</td>
                  </tr>
                );
              })}
              {filteredCuentas?.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-muted">No se encontraron cuentas de ahorro</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ProductoAhorroModal isOpen={productoModalOpen} onClose={() => setProductoModalOpen(false)} producto={productoEditando} />
      <MovimientoAhorroModal isOpen={!!cuentaSeleccionada} onClose={() => setCuentaSeleccionada(null)} cuenta={cuentaSeleccionada} />
    </div>
  );
}
