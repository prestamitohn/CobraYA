import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invitarUsuario } from '../../services/authService';
import { useToast } from '../../context/ToastContext';
import { X, Save, Mail, Lock } from 'lucide-react';

interface InvitarSocioModalProps {
  isOpen: boolean;
  onClose: () => void;
  clienteId: string;
  clienteNombre: string;
}

export function InvitarSocioModal({ isOpen, onClose, clienteId, clienteNombre }: InvitarSocioModalProps) {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (isOpen) {
      setCorreo('');
      setPassword('');
    }
  }, [isOpen]);

  const mutation = useMutation({
    mutationFn: () => invitarUsuario({ rol: 'socio', correo, password, nombreUsuario: clienteNombre, clienteId }),
    onSuccess: () => {
      addToast('Socio invitado — ya puede iniciar sesión en el portal', 'success');
      queryClient.invalidateQueries({ queryKey: ['borrower'] });
      onClose();
    },
    onError: (error: any) => addToast(error.message || 'Error al invitar al socio', 'error'),
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-surface border border-border rounded-xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-main">Dar acceso al portal del socio</h2>
          <button onClick={onClose} className="text-muted hover:text-main transition-colors"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }} className="p-6 space-y-4">
          <p className="text-sm text-muted">
            Se creará una cuenta para <span className="text-main font-medium">{clienteNombre}</span> con la que podrá entrar al portal y ver sus aportaciones, ahorros, préstamos y dividendos.
          </p>
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted">Correo del socio</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
              <input
                type="email"
                required
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                className="w-full bg-surfaceHighlight border border-border rounded-lg pl-10 pr-4 py-2 text-main focus:border-primary-500 focus:outline-none"
                placeholder="socio@ejemplo.com"
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted">Contraseña inicial</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
              <input
                type="text"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-surfaceHighlight border border-border rounded-lg pl-10 pr-4 py-2 text-main focus:border-primary-500 focus:outline-none"
                placeholder="Mínimo 8 caracteres"
              />
            </div>
            <p className="text-xs text-muted">Se crea con el correo ya confirmado — compártele estos datos para que inicie sesión.</p>
          </div>
          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-muted hover:text-main">Cancelar</button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {mutation.isPending ? 'Creando...' : 'Dar Acceso'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
