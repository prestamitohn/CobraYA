import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getBorrowerByDocumento, updateBorrower } from '../services/borrowerService';
import { getMyTenant } from '../services/tenantService';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { BorrowerForm, BorrowerFormData } from '../components/borrowers/BorrowerForm';
import { useToast } from '../context/ToastContext';

export function EditBorrower() {
  const navigate = useNavigate();
  const { documento } = useParams<{ documento: string }>();
  const { addToast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [updateError, setUpdateError] = useState('');

  const { data: tenant } = useQuery({ queryKey: ['tenant'], queryFn: getMyTenant });
  const esCooperativa = tenant?.tipoTenant === 'cooperativa';
  const etiqueta = esCooperativa ? 'Socio' : 'Cliente';

  const { data: borrower, isLoading: isLoadingData, error: loadError } = useQuery({
    queryKey: ['borrower', documento],
    queryFn: () => getBorrowerByDocumento(documento!),
    enabled: !!documento,
  });

  const onSubmit = async (data: BorrowerFormData) => {
    if (!borrower) return;

    setIsLoading(true);
    setUpdateError('');
    try {
      await updateBorrower(borrower.id, {
        nombre: data.nombre,
        apellido: data.apellido,
        telefono: data.telefono || undefined,
        domicilio: data.domicilio || undefined,
        correo: data.correo || undefined,
        numeroSocio: data.numeroSocio || undefined,
      });
      addToast(`${etiqueta} actualizado correctamente`, 'success');
      navigate('/borrowers');
    } catch (err: any) {
      const msg = err.message || `Error al actualizar el ${etiqueta.toLowerCase()}`;
      setUpdateError(msg);
      addToast(msg, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoadingData) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-red-400">
        <AlertTriangle className="h-12 w-12 mb-4" />
        <p>Error al cargar los datos del {etiqueta.toLowerCase()}</p>
        <button
          onClick={() => navigate('/borrowers')}
          className="mt-4 text-primary-400 hover:underline"
        >
          Volver a la lista
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/borrowers')}
          className="p-2 hover:bg-surfaceHighlight rounded-lg transition-colors text-muted hover:text-white"
        >
          <ArrowLeft className="h-6 w-6" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-main">Editar {etiqueta}</h1>
          <p className="text-muted">{esCooperativa ? 'Actualizar datos del socio' : 'Actualizar datos del prestatario'}</p>
        </div>
      </div>

      <div className="glass-panel p-6 rounded-xl border border-border">
        {updateError && (
          <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            <p>{updateError}</p>
          </div>
        )}

        {borrower && (
          <BorrowerForm
            initialData={borrower}
            onSubmit={onSubmit}
            isLoading={isLoading}
            submitLabel={`Actualizar ${etiqueta}`}
            esCooperativa={esCooperativa}
          />
        )}
      </div>
    </div>
  );
}
