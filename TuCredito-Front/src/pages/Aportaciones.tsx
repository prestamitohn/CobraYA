import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getBorrowers } from '../services/borrowerService';
import { getSaldosAportaciones } from '../services/cooperativaService';
import { AportacionModal } from '../components/cooperativa/AportacionModal';
import { Search, AlertCircle, PiggyBank, Plus } from 'lucide-react';
import { formatCurrency } from '../utils/formatters';

export function Aportaciones() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { data: socios, isLoading, error } = useQuery({ queryKey: ['borrowers'], queryFn: () => getBorrowers() });
  const { data: saldos } = useQuery({ queryKey: ['saldosAportaciones'], queryFn: getSaldosAportaciones });

  const filteredSocios = useMemo(() => {
    if (!socios) return socios;
    if (!searchTerm) return socios;
    const term = searchTerm.toLowerCase();
    return socios.filter((s) => `${s.nombre} ${s.apellido ?? ''}`.toLowerCase().includes(term) || s.documento.includes(term));
  }, [socios, searchTerm]);

  const totalAportado = useMemo(() => {
    if (!saldos) return 0;
    return Object.values(saldos).reduce((acc, v) => acc + v, 0);
  }, [saldos]);

  if (isLoading) {
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
        <p>Error al cargar los socios</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-y-3">
        <div>
          <h1 className="text-2xl font-bold text-main">Aportaciones</h1>
          <p className="text-muted">Capital social aportado por cada socio (obligatorias, extraordinarias y retiros)</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="h-4 w-4" />
          Registrar Aportación
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="glass-panel p-4 rounded-xl flex items-center gap-4">
          <div className="p-3 rounded-lg bg-primary-500/10 text-primary-500 flex-shrink-0">
            <PiggyBank className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <p className="text-sm text-muted truncate">Capital Social Total</p>
            <p className="text-2xl font-bold text-main truncate">{formatCurrency(totalAportado)}</p>
          </div>
        </div>
      </div>

      <div className="glass-panel rounded-xl overflow-hidden border border-border">
        <div className="p-4 border-b border-border">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
            <input
              type="text"
              placeholder="Buscar socio por nombre o identidad..."
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
                <th className="px-6 py-3 font-medium">Identidad</th>
                <th className="px-6 py-3 font-medium text-right">Saldo de Aportaciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredSocios?.map((socio) => (
                <tr key={socio.id} className="hover:bg-surfaceHighlight/50 transition-colors">
                  <td className="px-6 py-4">
                    <button
                      onClick={() => navigate(`/borrowers/${socio.documento}`)}
                      className="text-primary-400 hover:text-primary-300 font-medium hover:underline text-left"
                    >
                      {socio.nombre} {socio.apellido ?? ''}
                    </button>
                  </td>
                  <td className="px-6 py-4 text-muted">{socio.documento}</td>
                  <td className="px-6 py-4 text-main text-right font-medium">{formatCurrency(saldos?.[socio.id] ?? 0)}</td>
                </tr>
              ))}
              {filteredSocios?.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-6 py-8 text-center text-muted">
                    No se encontraron socios
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AportacionModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
  );
}
