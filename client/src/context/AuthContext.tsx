import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

type User = {
  id: string;
  email?: string | null;
  user_metadata?: unknown;
};

type Session = {
  user: User;
} | null;

type AuthError = {
  message: string;
};

type AppAccess = {
  role_slug: string;
  role_name: string;
  is_admin: boolean;
};

type AuthContextType = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  access: AppAccess | null;
  signInWithGoogle: () => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<{ error: AuthError | null }>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [access, setAccess] = useState<AppAccess | null>(null);

  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      try {
        const res = await fetch('/api/auth/session', { credentials: 'include' });
        const payload: unknown = res.ok ? await res.json() : null;
        if (!mounted) return;

        if (typeof payload !== 'object' || payload === null) {
          setLoading(false);
          return;
        }

        const obj = payload as Record<string, unknown>;
        const sess = obj.session;
        const acc = obj.access;

        if (typeof sess === 'object' && sess !== null) {
          const s = sess as Record<string, unknown>;
          const u = s.user;
          if (typeof u === 'object' && u !== null) {
            const uu = u as Record<string, unknown>;
            const id = typeof uu.id === 'string' ? uu.id : '';
            if (id) {
              const userObj: User = {
                id,
                email: typeof uu.email === 'string' ? uu.email : null,
                user_metadata: uu.user_metadata ?? null,
              };
              setUser(userObj);
              setSession({ user: userObj });
            }
          }
        }

        if (typeof acc === 'object' && acc !== null) {
          const a = acc as Record<string, unknown>;
          setAccess({
            role_slug: String(a.role_slug ?? ''),
            role_name: String(a.role_name ?? ''),
            is_admin: Boolean(a.is_admin),
          });
        }

        setLoading(false);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        console.error('Auth initialization error:', err);
        if (mounted) setLoading(false);
      }
    };

    initAuth();
    return () => { mounted = false; };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    window.location.assign('/api/auth/login/google');
    return { error: null };
  }, []);

  const signOut = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      setSession(null);
      setUser(null);
      setAccess(null);
      return { error: null };
    } catch (err) {
      return { error: { message: err instanceof Error ? err.message : 'Sign out failed' } };
    }
  }, []);

  const value: AuthContextType = { user, session, loading, access, signInWithGoogle, signOut };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
