import React, { createContext, useContext, useState, useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { EstadoSuscripcion, Usuario } from '../types/cobraya';

interface TenantEstado {
  nombre: string;
  estadoSuscripcion: EstadoSuscripcion;
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

      const [{ data: superadminData }, { data: tenantEstadoData }] = await Promise.all([
        supabase.rpc('is_superadmin'),
        supabase.rpc('mi_tenant_estado'),
      ]);
      setEsSuperadmin(!!superadminData);
      const tenantRow = tenantEstadoData?.[0];
      setTenantEstado(tenantRow ? { nombre: tenantRow.nombre, estadoSuscripcion: tenantRow.estado_suscripcion } : null);
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
