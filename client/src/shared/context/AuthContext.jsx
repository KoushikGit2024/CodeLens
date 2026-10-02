import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const isConfigured = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);

  useEffect(() => {
    if (!isConfigured) {
      // Supabase not configured — skip auth entirely, render app as unauthenticated
      setLoading(false);
      return;
    }

    // Fetch active session initially
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [isConfigured]);

  const signIn = async (email, password) => {
    if (!isConfigured) return { error: { message: 'Auth not configured.' } };
    return supabase.auth.signInWithPassword({ email, password });
  };

  const signUp = async (email, password, fullName) => {
    if (!isConfigured) return { error: { message: 'Auth not configured.' } };
    return supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
  };

  const signOut = async () => {
    if (!isConfigured) return;
    return supabase.auth.signOut();
  };

  const signInWithOAuth = async provider => {
    if (!isConfigured) return { error: { message: 'Auth not configured.' } };
    return supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  };

  const resetPasswordForEmail = async email => {
    if (!isConfigured) return { error: { message: 'Auth not configured.' } };
    return supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
  };

  const updateUserPassword = async newPassword => {
    if (!isConfigured) return { error: { message: 'Auth not configured.' } };
    return supabase.auth.updateUser({ password: newPassword });
  };

  // Always render children — analysis must never be gated on auth loading
  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        loading,
        signIn,
        signUp,
        signOut,
        signInWithOAuth,
        resetPasswordForEmail,
        updateUserPassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
