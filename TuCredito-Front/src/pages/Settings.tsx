import { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Settings as SettingsIcon, Shield, Moon, User, Globe, Check, AlertCircle, Loader2, Eye, EyeOff, X, Building2, Image, Trash2, Upload, Bell, BellOff } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';
import { updateProfile } from '../services/authService';
import { getMyTenant, updateTenant, uploadTenantLogo, removeTenantLogo } from '../services/tenantService';
import { isPushSupported, getNotificationPermission, hasActivePushSubscription, subscribeToPush, unsubscribeFromPush } from '../services/pushService';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

interface ProfileFormData {
    nombre: string;
}

interface BusinessFormData {
    nombre: string;
    rtn: string;
}

interface PasswordFormData {
    nuevaContrasenia: string;
    confirmarContrasenia: string;
}

export function Settings() {
    const { theme, toggleTheme } = useTheme();
    const { user, refreshUser } = useAuth();
    const { addToast } = useToast();
    const queryClient = useQueryClient();
    const isOwner = user?.rol === 'owner';

    const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
    const [isEditBusinessOpen, setIsEditBusinessOpen] = useState(false);
    const logoInputRef = useRef<HTMLInputElement>(null);
    const [isUploadingLogo, setIsUploadingLogo] = useState(false);

    const { data: tenant } = useQuery({
        queryKey: ['tenant'],
        queryFn: getMyTenant,
        enabled: isOwner,
    });

    const {
        register: registerBusiness,
        handleSubmit: handleSubmitBusiness,
        formState: { errors: errorsBusiness },
        reset: resetBusiness,
    } = useForm<BusinessFormData>({
        defaultValues: { nombre: '', rtn: '' }
    });

    useEffect(() => {
        if (tenant) resetBusiness({ nombre: tenant.nombre, rtn: tenant.rtn || '' });
    }, [tenant, resetBusiness]);

    const businessMutation = useMutation({
        mutationFn: (data: BusinessFormData) => updateTenant(tenant!.id, { nombre: data.nombre, rtn: data.rtn || null }),
        onSuccess: async () => {
            addToast('Datos del negocio actualizados correctamente', 'success');
            await queryClient.invalidateQueries({ queryKey: ['tenant'] });
            setIsEditBusinessOpen(false);
        },
        onError: (error: any) => {
            addToast(error.message || 'Error al actualizar los datos del negocio', 'error');
        }
    });

    const logoMutation = useMutation({
        mutationFn: (file: File) => uploadTenantLogo(file),
        onSuccess: async () => {
            addToast('Logo actualizado correctamente', 'success');
            await queryClient.invalidateQueries({ queryKey: ['tenant'] });
        },
        onError: (error: any) => {
            addToast(error.message || 'Error al subir el logo', 'error');
        },
        onSettled: () => setIsUploadingLogo(false),
    });

    const removeLogoMutation = useMutation({
        mutationFn: () => removeTenantLogo(),
        onSuccess: async () => {
            addToast('Logo eliminado', 'success');
            await queryClient.invalidateQueries({ queryKey: ['tenant'] });
        },
        onError: (error: any) => {
            addToast(error.message || 'Error al eliminar el logo', 'error');
        }
    });

    const handleLogoSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            addToast('Selecciona un archivo de imagen válido', 'error');
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            addToast('La imagen no debe superar 2MB', 'error');
            return;
        }
        setIsUploadingLogo(true);
        logoMutation.mutate(file);
        e.target.value = '';
    };

    const pushSupported = isPushSupported();
    const notificationPermission = getNotificationPermission();

    const { data: hasPushSubscription, refetch: refetchPushSubscription } = useQuery({
        queryKey: ['pushSubscriptionStatus'],
        queryFn: hasActivePushSubscription,
        enabled: pushSupported,
    });

    const subscribePushMutation = useMutation({
        mutationFn: () => subscribeToPush(user!.tenantId, user!.id),
        onSuccess: (result) => {
            if (result.ok) {
                addToast('Notificaciones activadas correctamente', 'success');
            } else if (result.reason === 'permission_denied') {
                addToast('Debes permitir las notificaciones en tu navegador', 'error');
            } else {
                addToast('No se pudieron activar las notificaciones', 'error');
            }
            refetchPushSubscription();
        },
        onError: () => addToast('No se pudieron activar las notificaciones', 'error'),
    });

    const unsubscribePushMutation = useMutation({
        mutationFn: unsubscribeFromPush,
        onSuccess: () => {
            addToast('Notificaciones desactivadas', 'success');
            refetchPushSubscription();
        },
        onError: () => addToast('Error al desactivar las notificaciones', 'error'),
    });

    const { register, handleSubmit, formState: { errors }, reset, watch } = useForm<PasswordFormData>({
        defaultValues: { nuevaContrasenia: '', confirmarContrasenia: '' }
    });

    const {
        register: registerProfile,
        handleSubmit: handleSubmitProfile,
        formState: { errors: errorsProfile },
        reset: resetProfile
    } = useForm<ProfileFormData>({
        defaultValues: { nombre: user?.nombre || '' }
    });

    useEffect(() => {
        if (user) resetProfile({ nombre: user.nombre });
    }, [user, resetProfile]);

    const profileMutation = useMutation({
        mutationFn: (data: ProfileFormData) => updateProfile(user!.id, { nombre: data.nombre }),
        onSuccess: async () => {
            addToast('Perfil actualizado correctamente', 'success');
            await refreshUser();
            setIsEditProfileOpen(false);
        },
        onError: (error: any) => {
            addToast(error.message || 'Error al actualizar el perfil', 'error');
        }
    });

    const passwordMutation = useMutation({
        mutationFn: (data: PasswordFormData) => updateProfile(user!.id, { nuevaContrasenia: data.nuevaContrasenia }),
        onSuccess: () => {
            addToast('Contraseña actualizada correctamente', 'success');
            reset();
            setIsChangePasswordOpen(false);
        },
        onError: (error: any) => {
            addToast(error.message || 'Error al actualizar la contraseña', 'error');
        }
    });

    const onSubmitPassword = (data: PasswordFormData) => {
        if (data.nuevaContrasenia !== data.confirmarContrasenia) return;
        passwordMutation.mutate(data);
    };

    const newPassword = watch('nuevaContrasenia');

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-main">Configuración</h1>
        <p className="text-muted">Administra tus preferencias y la configuración de la cuenta</p>
      </div>

      <div className="glass-panel rounded-xl border border-border overflow-hidden">
        <div className="p-6 border-b border-border">
          <h2 className="text-lg font-semibold text-main flex items-center gap-2">
            <User className="h-5 w-5 text-primary-500" />
            Perfil
          </h2>
        </div>
        <div className="p-6 space-y-4">
           <div className="flex items-center justify-between py-2">
              <div>
                <p className="font-medium text-main">Información Personal</p>
                <p className="text-sm text-muted">Actualiza tu nombre</p>
              </div>
              <button
                onClick={() => setIsEditProfileOpen(true)}
                className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-surfaceHighlight transition-colors text-main"
              >
                {isEditProfileOpen ? 'Editando...' : 'Editar'}
              </button>
           </div>

           {isEditProfileOpen && (
               <form onSubmit={handleSubmitProfile((data) => profileMutation.mutate(data))} className="mt-4 space-y-4 p-4 bg-surfaceHighlight/30 rounded-xl border border-border animate-in fade-in slide-in-from-top-2 relative">
                   <button
                       type="button"
                       onClick={() => setIsEditProfileOpen(false)}
                       className="absolute top-2 right-2 text-muted hover:text-main p-1"
                   >
                       <X className="h-4 w-4" />
                   </button>

                   <div>
                       <label className="block text-sm font-medium text-muted mb-1">Nombre</label>
                       <input
                           {...registerProfile('nombre', { required: 'El nombre es requerido', maxLength: { value: 60, message: 'Máximo 60 caracteres' } })}
                           className="w-full bg-surface/50 border border-border rounded-lg px-4 py-2 text-main focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
                       />
                       {errorsProfile.nombre && <span className="text-xs text-red-400 mt-1">{errorsProfile.nombre.message as string}</span>}
                   </div>

                   <div className="flex justify-end pt-2 gap-2">
                       <button
                           type="button"
                           onClick={() => setIsEditProfileOpen(false)}
                           className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-surfaceHighlight transition-colors text-main"
                       >
                           Cancelar
                       </button>
                       <button
                           type="submit"
                           disabled={profileMutation.isPending}
                           className="bg-primary-600 hover:bg-primary-700 text-white px-6 py-2 rounded-lg transition-colors shadow-lg shadow-primary-500/20 flex items-center gap-2 disabled:opacity-50"
                       >
                           {profileMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                           Guardar Cambios
                       </button>
                   </div>
               </form>
           )}
        </div>
      </div>

      {isOwner && (
      <div className="glass-panel rounded-xl border border-border overflow-hidden">
        <div className="p-6 border-b border-border">
          <h2 className="text-lg font-semibold text-main flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary-500" />
            Negocio
          </h2>
        </div>
        <div className="p-6 space-y-6">
           <div className="flex items-center gap-4">
              <div className="relative flex-shrink-0">
                {tenant?.logoUrl ? (
                  <img src={tenant.logoUrl} alt="Logo del negocio" className="h-16 w-16 rounded-xl object-cover border border-border" />
                ) : (
                  <div className="h-16 w-16 rounded-xl bg-surfaceHighlight border border-dashed border-border flex items-center justify-center text-muted">
                    <Image className="h-6 w-6" />
                  </div>
                )}
                {isUploadingLogo && (
                  <div className="absolute inset-0 rounded-xl bg-black/40 flex items-center justify-center">
                    <Loader2 className="h-5 w-5 text-white animate-spin" />
                  </div>
                )}
              </div>
              <div className="flex-1">
                <p className="font-medium text-main">Logo del Negocio</p>
                <p className="text-sm text-muted mb-2">PNG o JPG, máximo 2MB. Se muestra en tu perfil.</p>
                <div className="flex items-center gap-2">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleLogoSelected}
                  />
                  <button
                    type="button"
                    onClick={() => logoInputRef.current?.click()}
                    disabled={isUploadingLogo}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-xs hover:bg-surfaceHighlight transition-colors text-main disabled:opacity-50"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    {tenant?.logoUrl ? 'Reemplazar' : 'Subir Logo'}
                  </button>
                  {tenant?.logoUrl && (
                    <button
                      type="button"
                      onClick={() => removeLogoMutation.mutate()}
                      disabled={removeLogoMutation.isPending}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-red-500/20 text-xs text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Quitar
                    </button>
                  )}
                </div>
              </div>
           </div>

           <div className="flex items-center justify-between py-2 border-t border-border pt-4">
              <div>
                <p className="font-medium text-main">Datos del Negocio</p>
                <p className="text-sm text-muted">Nombre y RTN de tu negocio</p>
              </div>
              <button
                onClick={() => setIsEditBusinessOpen(true)}
                className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-surfaceHighlight transition-colors text-main"
              >
                {isEditBusinessOpen ? 'Editando...' : 'Editar'}
              </button>
           </div>

           {!isEditBusinessOpen ? (
              <div className="space-y-1 text-sm">
                <p><span className="text-muted">Nombre:</span> <span className="text-main">{tenant?.nombre || '-'}</span></p>
                <p><span className="text-muted">RTN:</span> <span className="text-main">{tenant?.rtn || 'No registrado'}</span></p>
              </div>
           ) : (
               <form onSubmit={handleSubmitBusiness((data) => businessMutation.mutate(data))} className="space-y-4 p-4 bg-surfaceHighlight/30 rounded-xl border border-border animate-in fade-in slide-in-from-top-2 relative">
                   <button
                       type="button"
                       onClick={() => setIsEditBusinessOpen(false)}
                       className="absolute top-2 right-2 text-muted hover:text-main p-1"
                   >
                       <X className="h-4 w-4" />
                   </button>

                   <div>
                       <label className="block text-sm font-medium text-muted mb-1">Nombre del Negocio</label>
                       <input
                           {...registerBusiness('nombre', { required: 'El nombre es requerido', maxLength: { value: 120, message: 'Máximo 120 caracteres' } })}
                           className="w-full bg-surface/50 border border-border rounded-lg px-4 py-2 text-main focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
                       />
                       {errorsBusiness.nombre && <span className="text-xs text-red-400 mt-1">{errorsBusiness.nombre.message as string}</span>}
                   </div>

                   <div>
                       <label className="block text-sm font-medium text-muted mb-1">RTN (opcional)</label>
                       <input
                           {...registerBusiness('rtn')}
                           className="w-full bg-surface/50 border border-border rounded-lg px-4 py-2 text-main focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
                       />
                   </div>

                   <div className="flex justify-end pt-2 gap-2">
                       <button
                           type="button"
                           onClick={() => setIsEditBusinessOpen(false)}
                           className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-surfaceHighlight transition-colors text-main"
                       >
                           Cancelar
                       </button>
                       <button
                           type="submit"
                           disabled={businessMutation.isPending}
                           className="bg-primary-600 hover:bg-primary-700 text-white px-6 py-2 rounded-lg transition-colors shadow-lg shadow-primary-500/20 flex items-center gap-2 disabled:opacity-50"
                       >
                           {businessMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                           Guardar Cambios
                       </button>
                   </div>
               </form>
           )}
        </div>
      </div>
      )}

      <div className="glass-panel rounded-xl border border-border overflow-hidden">
        <div className="p-6 border-b border-border">
          <h2 className="text-lg font-semibold text-main flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary-500" />
            Apariencia
          </h2>
        </div>
        <div className="p-6 space-y-4">
           <div className="flex items-center justify-between py-2">
              <div>
                <p className="font-medium text-main">Tema</p>
                <p className="text-sm text-muted">Alternar entre modo claro y oscuro</p>
              </div>
              <button
                onClick={toggleTheme}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm hover:bg-surfaceHighlight transition-colors text-main"
              >
                {theme === 'dark' ? <Moon className="h-4 w-4" /> : <SettingsIcon className="h-4 w-4" />}
                {theme === 'dark' ? 'Modo Oscuro' : 'Modo Claro'}
              </button>
           </div>
        </div>
      </div>

      <div className="glass-panel rounded-xl border border-border overflow-hidden">
        <div className="p-6 border-b border-border">
          <h2 className="text-lg font-semibold text-main flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary-500" />
            Notificaciones
          </h2>
        </div>
        <div className="p-6 space-y-4">
           <div className="flex items-center justify-between py-2 gap-4">
              <div>
                <p className="font-medium text-main">Notificaciones Push</p>
                <p className="text-sm text-muted">Recibe un resumen diario de cuotas por cobrar y en mora, aunque no tengas la app abierta.</p>
              </div>
              {!pushSupported ? (
                <span className="text-xs text-muted italic whitespace-nowrap">No disponible</span>
              ) : notificationPermission === 'denied' ? (
                <span className="text-xs text-red-400 italic whitespace-nowrap">Bloqueadas en el navegador</span>
              ) : hasPushSubscription ? (
                <button
                  onClick={() => unsubscribePushMutation.mutate()}
                  disabled={unsubscribePushMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm hover:bg-surfaceHighlight transition-colors text-main disabled:opacity-50 whitespace-nowrap"
                >
                  {unsubscribePushMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellOff className="h-4 w-4" />}
                  Desactivar
                </button>
              ) : (
                <button
                  onClick={() => subscribePushMutation.mutate()}
                  disabled={subscribePushMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 whitespace-nowrap"
                >
                  {subscribePushMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
                  Activar
                </button>
              )}
           </div>
        </div>
      </div>

      <div className="glass-panel rounded-xl border border-border overflow-hidden">
        <div className="p-6 border-b border-border">
          <h2 className="text-lg font-semibold text-main flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary-500" />
            Seguridad
          </h2>
        </div>
        <div className="p-6 space-y-4">
           <div className="flex items-start justify-between py-2">
              <div>
                <p className="font-medium text-main">Cambiar Contraseña</p>
                <p className="text-sm text-muted">Se recomienda cambiarla cada 3 meses</p>
              </div>
              <button
                onClick={() => setIsChangePasswordOpen(!isChangePasswordOpen)}
                className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-surfaceHighlight transition-colors text-main"
              >
                {isChangePasswordOpen ? 'Cancelar' : 'Actualizar'}
              </button>
           </div>

           {isChangePasswordOpen && (
               <form onSubmit={handleSubmit(onSubmitPassword)} className="mt-4 space-y-4 p-4 bg-surfaceHighlight/30 rounded-xl border border-border animate-in fade-in slide-in-from-top-2">
                   <div>
                       <label className="block text-sm font-medium text-muted mb-1">Nueva Contraseña</label>
                       <div className="relative">
                           <input
                               type={showNew ? 'text' : 'password'}
                               {...register('nuevaContrasenia', {
                                   required: 'La nueva contraseña es requerida',
                                   minLength: { value: 8, message: 'Mínimo 8 caracteres' },
                                   pattern: { value: /^(?=.*[0-9]).*$/, message: 'Debe contener al menos un número' }
                               })}
                               className="w-full bg-surface/50 border border-border rounded-lg px-4 py-2 pr-10 text-main focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
                           />
                           <button
                               type="button"
                               onClick={() => setShowNew(!showNew)}
                               className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted hover:text-main transition-colors"
                           >
                               {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                           </button>
                       </div>
                       {errors.nuevaContrasenia && <span className="text-xs text-red-400 mt-1">{errors.nuevaContrasenia.message as string}</span>}
                   </div>

                   <div>
                       <label className="block text-sm font-medium text-muted mb-1">Confirmar Nueva Contraseña</label>
                       <div className="relative">
                           <input
                               type={showConfirm ? 'text' : 'password'}
                               {...register('confirmarContrasenia', {
                                   required: 'Confirma tu nueva contraseña',
                                   validate: value => value === newPassword || 'Las contraseñas no coinciden'
                               })}
                               className="w-full bg-surface/50 border border-border rounded-lg px-4 py-2 pr-10 text-main focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-colors"
                           />
                           <button
                               type="button"
                               onClick={() => setShowConfirm(!showConfirm)}
                               className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted hover:text-main transition-colors"
                           >
                               {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                           </button>
                       </div>
                       {errors.confirmarContrasenia && <span className="text-xs text-red-400 mt-1">{errors.confirmarContrasenia.message as string}</span>}
                   </div>

                   {passwordMutation.isError && (
                       <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 p-3 rounded-lg">
                           <AlertCircle className="h-4 w-4" />
                           <span>Error al actualizar la contraseña</span>
                       </div>
                   )}

                   <div className="flex justify-end pt-2">
                       <button
                           type="submit"
                           disabled={passwordMutation.isPending}
                           className="bg-primary-600 hover:bg-primary-700 text-white px-6 py-2 rounded-lg transition-colors shadow-lg shadow-primary-500/20 flex items-center gap-2 disabled:opacity-50"
                       >
                           {passwordMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                           Guardar Cambios
                       </button>
                   </div>
               </form>
           )}
        </div>
      </div>
    </div>
  );
}
