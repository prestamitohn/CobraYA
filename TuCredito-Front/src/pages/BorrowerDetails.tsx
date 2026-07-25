import { useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getBorrowerByDocumento, updateBorrower } from '../services/borrowerService';
import { getLoans } from '../services/loanService';
import { getClasificacionesClientes } from '../services/clasificacionService';
import { ArrowLeft, User, Users, Edit, Save, X, ShieldAlert, TrendingUp } from 'lucide-react';
import { getEstadoPrestamoLabel, getClasificacionLabel, getClasificacionColorClass } from '../types/cobraya';
import { StatusBadge } from '../components/ui/StatusBadge';
import { formatCurrency } from '../utils/formatters';
import { useToast } from '../context/ToastContext';

export function BorrowerDetails() {
  const { documento } = useParams<{ documento: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { addToast } = useToast();

  const validTabs = ['info', 'loans'];
  const tabParam = searchParams.get('tab');
  const initialTab = validTabs.includes(tabParam || '') ? (tabParam as 'info' | 'loans') : 'info';
  const [activeTab, setActiveTab] = useState<'info' | 'loans'>(initialTab);

  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<{ correo?: string; telefono?: string; domicilio?: string }>({});

  const { data: borrower, isLoading: isLoadingBorrower } = useQuery({
    queryKey: ['borrower', documento],
    queryFn: () => getBorrowerByDocumento(documento!),
    enabled: !!documento,
  });

  const { data: loans } = useQuery({
    queryKey: ['loans'],
    queryFn: getLoans,
  });

  const { data: clasificaciones } = useQuery({
    queryKey: ['clasificaciones'],
    queryFn: getClasificacionesClientes,
  });

  const borrowerLoans = loans?.filter((l) => l.clienteId === borrower?.id) || [];
  const clasificacion = clasificaciones?.find((c) => c.clienteId === borrower?.id);

  const updateMutation = useMutation({
    mutationFn: (data: { correo?: string; telefono?: string; domicilio?: string }) =>
      updateBorrower(borrower!.id, { nombre: borrower!.nombre, apellido: borrower!.apellido || undefined, ...data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['borrower', documento] });
      queryClient.invalidateQueries({ queryKey: ['borrowers'] });
      setIsEditing(false);
      addToast('Cliente actualizado correctamente', 'success');
    },
    onError: () => {
      addToast('Error al actualizar el cliente', 'error');
    }
  });

  const startEdit = () => {
    if (borrower) {
      setEditForm({
        telefono: borrower.telefono || '',
        domicilio: borrower.domicilio || '',
        correo: borrower.correo || '',
      });
      setIsEditing(true);
    }
  };

  const saveEdit = () => updateMutation.mutate(editForm);

  if (isLoadingBorrower) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (!borrower) return <div>Cliente no encontrado</div>;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/borrowers')} className="p-2 hover:bg-surfaceHighlight rounded-full text-muted hover:text-main">
          <ArrowLeft className="h-6 w-6" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-main">{borrower.nombre} {borrower.apellido}</h1>
          <p className="text-muted">Identidad: {borrower.documento}</p>
        </div>
      </div>

      <div className="flex border-b border-border">
        <button
          onClick={() => setActiveTab('info')}
          className={`px-4 py-2 border-b-2 transition-colors ${activeTab === 'info' ? 'border-primary-500 text-primary-500' : 'border-transparent text-muted hover:text-main'}`}
        >
          Información
        </button>
        <button
          onClick={() => setActiveTab('loans')}
          className={`px-4 py-2 border-b-2 transition-colors ${activeTab === 'loans' ? 'border-primary-500 text-primary-500' : 'border-transparent text-muted hover:text-main'}`}
        >
          Préstamos ({borrowerLoans.length})
        </button>
      </div>

      <div className="mt-6">
        {activeTab === 'info' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {clasificacion && (
              <div className="md:col-span-2 glass-panel p-6 rounded-xl border border-border space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h3 className="font-semibold text-lg text-main flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-primary-500" /> Clasificación de Comportamiento de Pago
                  </h3>
                  <span className={`px-3 py-1 rounded-lg text-sm font-semibold border ${getClasificacionColorClass(clasificacion.clasificacion)}`}>
                    {getClasificacionLabel(clasificacion.clasificacion)}
                  </span>
                </div>

                {clasificacion.noRecomendadoRefinanciamiento && (
                  <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/5 border border-red-500/20 rounded-lg px-3 py-2">
                    <ShieldAlert className="h-4 w-4 flex-shrink-0" />
                    Cliente no recomendado para refinanciamiento
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-muted block">% Cumplimiento</span>
                    <span className="text-main font-medium text-lg">{clasificacion.porcentajeCumplimiento}%</span>
                  </div>
                  <div>
                    <span className="text-muted block">Cuotas a Tiempo</span>
                    <span className="text-main font-medium text-lg">{clasificacion.cuotasPagadasATiempo}</span>
                  </div>
                  <div>
                    <span className="text-muted block">Cuotas Tardías</span>
                    <span className="text-main font-medium text-lg">{clasificacion.cuotasPagadasTarde}</span>
                  </div>
                  <div>
                    <span className="text-muted block">Vencidas / Multas Activas</span>
                    <span className="text-main font-medium text-lg">{clasificacion.cuotasVencidasActuales} / {clasificacion.multasActivas}</span>
                  </div>
                </div>
              </div>
            )}

            <div className="glass-panel p-6 rounded-xl border border-border space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-lg text-main flex items-center gap-2">
                  <User className="h-5 w-5 text-primary-500" /> Datos Personales
                </h3>
                {!isEditing ? (
                  <button
                    onClick={startEdit}
                    className="p-1.5 hover:bg-surfaceHighlight rounded-lg text-muted hover:text-primary-500 transition-colors"
                  >
                    <Edit className="h-4 w-4" />
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsEditing(false)}
                      className="p-1.5 hover:bg-red-500/10 rounded-lg text-muted hover:text-red-500 transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                    <button
                      onClick={saveEdit}
                      disabled={updateMutation.isPending}
                      className="p-1.5 hover:bg-green-500/10 rounded-lg text-muted hover:text-green-500 transition-colors"
                    >
                      <Save className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>

              {!isEditing ? (
                <div className="space-y-2 text-sm">
                  <p><span className="text-muted">Email:</span> {borrower.correo}</p>
                  <p><span className="text-muted">Teléfono:</span> {borrower.telefono}</p>
                  <p><span className="text-muted">Dirección:</span> {borrower.domicilio}</p>
                  <p><span className="text-muted">Estado:</span>
                    <span className={`ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${borrower.activo ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                      {borrower.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-muted mb-1">Email</label>
                    <input
                      type="email"
                      value={editForm.correo || ''}
                      onChange={e => setEditForm(prev => ({ ...prev, correo: e.target.value }))}
                      className="w-full bg-surface/50 border border-border rounded-lg px-3 py-2 text-sm text-main focus:outline-none focus:border-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted mb-1">Teléfono</label>
                    <input
                      type="text"
                      value={editForm.telefono || ''}
                      onChange={e => setEditForm(prev => ({ ...prev, telefono: e.target.value }))}
                      className="w-full bg-surface/50 border border-border rounded-lg px-3 py-2 text-sm text-main focus:outline-none focus:border-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted mb-1">Dirección</label>
                    <input
                      type="text"
                      value={editForm.domicilio || ''}
                      onChange={e => setEditForm(prev => ({ ...prev, domicilio: e.target.value }))}
                      className="w-full bg-surface/50 border border-border rounded-lg px-3 py-2 text-sm text-main focus:outline-none focus:border-primary-500"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="glass-panel p-6 rounded-xl border border-border space-y-4">
               <h3 className="font-semibold text-lg text-main flex items-center gap-2">
                 <Users className="h-5 w-5 text-primary-500" /> Datos del Garante
               </h3>
               {borrower.garante ? (
                 <div className="space-y-2 text-sm">
                   <p><span className="text-muted">Nombre:</span> {borrower.garante.nombre} {borrower.garante.apellido}</p>
                   <p><span className="text-muted">Identidad:</span> {borrower.garante.documento}</p>
                   {borrower.garante.telefono && <p><span className="text-muted">Teléfono:</span> {borrower.garante.telefono}</p>}
                   {borrower.garante.domicilio && <p><span className="text-muted">Dirección:</span> {borrower.garante.domicilio}</p>}
                 </div>
               ) : (
                 <div className="flex flex-col items-center justify-center py-4 text-muted">
                   <p className="italic">No hay garante asignado</p>
                 </div>
               )}
             </div>
          </div>
        )}

        {activeTab === 'loans' && (
           <div className="glass-panel rounded-xl overflow-hidden border border-border">
             <table className="w-full text-left text-sm">
               <thead className="bg-surfaceHighlight text-muted">
                 <tr>
                   <th className="px-6 py-3 font-medium">Monto</th>
                   <th className="px-6 py-3 font-medium">Estado</th>
                   <th className="px-6 py-3 font-medium">Acciones</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-border">
                 {borrowerLoans.map(loan => (
                   <tr key={loan.id} className="hover:bg-surfaceHighlight/50 transition-colors">
                     <td className="px-6 py-4 text-main">{formatCurrency(loan.montoOtorgado)}</td>
                     <td className="px-6 py-4">
                        <StatusBadge variant={
                          loan.estado === 'activo' ? 'success' :
                          loan.estado === 'finalizado' ? 'warning' : 'error'
                        }>
                         {getEstadoPrestamoLabel(loan.estado)}
                       </StatusBadge>
                     </td>
                     <td className="px-6 py-4">
                       <button
                         onClick={() => navigate(`/loans/${loan.id}`)}
                         className="text-primary-400 hover:text-primary-300 font-medium hover:underline"
                       >
                         Ver detalles
                       </button>
                     </td>
                   </tr>
                 ))}
                 {borrowerLoans.length === 0 && (
                   <tr>
                     <td colSpan={3} className="px-6 py-8 text-center text-muted">
                       Este cliente no tiene préstamos registrados
                     </td>
                   </tr>
                 )}
               </tbody>
             </table>
           </div>
        )}
      </div>
    </div>
  );
}
