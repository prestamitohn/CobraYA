import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createBorrower } from '../services/borrowerService';
import { ArrowLeft } from 'lucide-react';
import { BorrowerForm, BorrowerFormData } from '../components/borrowers/BorrowerForm';
import { useToast } from '../context/ToastContext';

export function CreateBorrower() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

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
      addToast('Cliente registrado correctamente', 'success');
      navigate('/borrowers');
    } catch (err: any) {
      addToast(err.message || 'Error al registrar el cliente', 'error');
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
          <h1 className="text-2xl font-bold text-main">Nuevo Cliente</h1>
          <p className="text-muted">Registrar un nuevo prestatario en el sistema</p>
        </div>
      </div>

      <div className="glass-panel p-6 rounded-xl border border-border">
        <BorrowerForm
          onSubmit={onSubmit}
          isLoading={isLoading}
          submitLabel="Guardar Cliente"
        />
      </div>
    </div>
  );
}
