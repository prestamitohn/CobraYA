import React, { createContext, useContext, useState, useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { EstadoSuscripcion, Usuario } from '../types/cobraya';

interface TenantEstado {
  nombre: string;
  estadoSuscripcion: EstadoSuscripcion;
  fechaInicio: string;
  diasRestantesPrueba: number;
  trialVencido: boolean;
}

interface AuthContextType {
  session: Session | null;
  user: Usuario | null;
  esSuperadmin: boolean;
  tenantEstado: TenantEstado | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function fetchUsuario(userId: string): Promise<Usuario | null> {
  const { data, error } = await supabase
    .from('usuarios')
    .select('id, tenant_id, rol, nombre, correo, activo')
    .eq('id', userId)
    .single();

  if (error || !data) return null;

  return {
    id: data.id,
    tenantId: data.tenant_id,
    rol: data.rol,
    nombre: data.nombre,
    correo: data.correo,
    activo: data.activo,
  };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<Usuario | null>(null);
  const [esSuperadmin, setEsSuperadmin] = useState(false);
  const [tenantEstado, setTenantEstado] = useState<TenantEstado | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // is_superadmin/mi_tenant_estado solo importan para el 1% de sesiones (superadmin) o
  // para mostrar el bloqueo de cuenta suspendida — no tiene sentido que TODOS los
  // logins esperen esas dos RPC antes de poder pintar la app (medido: la primera vez
  // que Postgres compila el plan de una RPC puede tardar >1s). Se resuelven en
  // background después de que el usuario ya está listo, no bloquean isLoading.
  const loadExtras = () => {
    supabase.rpc('is_superadmin').then(({ data }) => setEsSuperadmin(!!data));
    supabase.rpc('mi_tenant_estado').then(({ data }) => {
      const row = data?.[0];
      setTenantEstado(row ? {
        nombre: row.nombre,
        estadoSuscripcion: row.estado_suscripcion,
        fechaInicio: row.fecha_inicio,
        diasRestantesPrueba: row.dias_restantes_prueba,
        trialVencido: row.trial_vencido,
      } : null);
    });
  };

  const loadUsuario = async (sess: Session | null) => {
    if (sess?.user) {
      // La fila en `usuarios` la crea el trigger handle_new_user() al registrarse;
      // justo después del signUp puede haber una carrera mínima, por eso un reintento.
      let usuario = await fetchUsuario(sess.user.id);
      if (!usuario) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        usuario = await fetchUsuario(sess.user.id);
      }
      setUser(usuario);
      loadExtras();
    } else {
      setUser(null);
      setEsSuperadmin(false);
      setTenantEstado(null);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session: sess } }) => {
      setSession(sess);
      await loadUsuario(sess);
      setIsLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      loadUsuario(sess);
    });

    return () => subscription.unsubscribe();
  }, []);

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setEsSuperadmin(false);
    setTenantEstado(null);
  };

  const refreshUser = async () => {
    await loadUsuario(session);
  };

  return (
    <AuthContext.Provider
      value={{ session, user, esSuperadmin, tenantEstado, isAuthenticated: !!session, isLoading, logout, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
