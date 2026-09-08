import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { createBorrower, getSiguienteNumeroSocio } from '../services/borrowerService';
import { getMyTenant } from '../services/tenantService';
import { ArrowLeft } from 'lucide-react';
import { BorrowerForm, BorrowerFormData } from '../components/borrowers/BorrowerForm';
import { useToast } from '../context/ToastContext';

export function CreateBorrower() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const { data: tenant } = useQuery({ queryKey: ['tenant'], queryFn: getMyTenant });
  const esCooperativa = tenant?.tipoTenant === 'cooperativa';
  const etiqueta = esCooperativa ? 'Socio' : 'Cliente';

  const { data: numeroSocioSugerido } = useQuery({
    queryKey: ['siguienteNumeroSocio'],
    queryFn: getSiguienteNumeroSocio,
    enabled: esCooperativa,
  });

  const onSubmit = async (data: BorrowerFormData) => {
    setIsLoading(true);
    try {
      await createBorrower({
        documento: data.documento,
        nombre: data.nombre,
        apellido: data.apellido,
        telefono: data.telefono || undefined,
        domicilio: data.domicilio || undefined,
        correo: data.correo || undefined,
        numeroSocio: data.numeroSocio || undefined,
        garante: data.garanteNombre
          ? {
              nombre: data.garanteNombre,
              apellido: data.garanteApellido || undefined,
              documento: data.garanteDni || undefined,
              telefono: data.garanteTelefono || undefined,
              correo: data.garanteCorreo || undefined,
              domicilio: data.garanteDomicilio || undefined,
            }
          : undefined,
      });
      addToast(`${etiqueta} registrado correctamente`, 'success');
      navigate('/borrowers');
    } catch (err: any) {
      const msg = err.message?.includes('uq_clientes_tenant_numero_socio')
        ? 'Ese número de socio ya está en uso — elegí otro.'
        : err.message?.includes('uq_clientes_tenant_documento')
          ? 'Ya existe un registro con esa identidad/RTN.'
          : err.message || `Error al registrar el ${etiqueta.toLowerCase()}`;
      addToast(msg, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/borrowers')}
          className="p-2 hover:bg-surfaceHighlight rounded-lg transition-colors text-muted hover:text-main"
        >
          <ArrowLeft className="h-6 w-6" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-main">Nuevo {etiqueta}</h1>
          <p className="text-muted">{esCooperativa ? 'Registrar un nuevo socio en la cooperativa' : 'Registrar un nuevo prestatario en el sistema'}</p>
        </div>
      </div>

      <div className="glass-panel p-6 rounded-xl border border-border">
        <BorrowerForm
          onSubmit={onSubmit}
          isLoading={isLoading}
          submitLabel={`Guardar ${etiqueta}`}
          esCooperativa={esCooperativa}
          numeroSocioSugerido={numeroSocioSugerido}
        />
      </div>
    </div>
  );
}
