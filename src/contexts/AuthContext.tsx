import * as React from 'react';
import { createContext, useContext, useEffect, useState, ReactNode, useRef } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  isBiometricEnabled,
  isAppLocked,
  getStoredSession,
  setStoredSession,
  setAppLocked as setAppLockedStorage,
  hardLogoutStorage,
  debugStorageState,
} from '@/lib/secureStorage';
import { isNativeApp, authenticateBiometric, getBiometricType } from '@/lib/biometricHandler';

interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  id_number: string | null;
  kyc_status: string | null;
  kyc_submitted_at: string | null;
  kyc_rejection_reason: string | null;
  created_at: string | null;
  payment_details_completed: boolean | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (emailOrPhone: string, password: string) => Promise<{ error: any; requires2FA?: boolean; userId?: string; pendingSession?: any }>;
  signUp: (email: string, password: string, userData: any) => Promise<{ error: any }>;
  signOut: () => Promise<{ error: any }>;
  lockApp: () => Promise<void>;
  hardLogout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps): React.ReactElement {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const initRan = useRef(false);

  const fetchProfile = async (userId: string): Promise<void> => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, phone, id_number, kyc_status, kyc_submitted_at, kyc_rejection_reason, created_at, payment_details_completed')
        .eq('id', userId)
        .single();

      if (!error && data) {
        setProfile(data);
      }
    } catch (err) {
      console.error('Error fetching profile:', err);
    }
  };

  const refreshProfile = async (): Promise<void> => {
    if (user) {
      await fetchProfile(user.id);
    }
  };

  useEffect(() => {
    let mounted = true;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!mounted) return;

      setSession(newSession);
      setUser(newSession?.user ?? null);

      if (newSession?.user) {
        setTimeout(() => {
          if (mounted) fetchProfile(newSession.user.id);
        }, 0);

        if (
          (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') &&
          newSession.access_token &&
          newSession.refresh_token &&
          isNativeApp()
        ) {
          isBiometricEnabled().then((enabled) => {
            if (enabled) {
              setStoredSession({
                access_token: newSession.access_token,
                refresh_token: newSession.refresh_token,
              });
            }
          });
        }
      } else {
        setProfile(null);
      }
    });

    const initializeAuth = async () => {
      try {
        if (isNativeApp()) {
          await debugStorageState();
        }

        const biometricOn = isNativeApp() && await isBiometricEnabled();
        const locked = isNativeApp() && await isAppLocked();

        if (isNativeApp() && biometricOn && locked) {
          // App is locked — DO NOT restore session here.
          // Let Auth.tsx handle the fingerprint UI.
          // Just set loading=false so the login screen renders.
          if (mounted) setLoading(false);
          return;
        }

        // Normal init: check existing Supabase session
        const { data: { session: initialSession } } = await supabase.auth.getSession();
        if (!mounted) return;

        setSession(initialSession);
        setUser(initialSession?.user ?? null);

        if (initialSession?.user) {
          await fetchProfile(initialSession.user.id);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    if (!initRan.current) {
      initRan.current = true;
      initializeAuth();
    } else {
      setLoading(false);
    }

    let lastVisibilityRefresh = 0;
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const now = Date.now();
        if (now - lastVisibilityRefresh < 60_000) return;
        lastVisibilityRefresh = now;
        supabase.auth.getSession().then(({ data: { session: refreshedSession } }) => {
          if (!mounted) return;
          setSession(refreshedSession);
          setUser(refreshedSession?.user ?? null);
          if (refreshedSession?.user) {
            fetchProfile(refreshedSession.user.id);
          }
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      mounted = false;
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const captureLoginIP = async (isSignup: boolean) => {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (!currentSession?.access_token) return;

      await fetch(`${supabaseUrl}/functions/v1/capture-login-ip`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentSession.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ is_signup: isSignup }),
      });
    } catch (err) {
      console.error('Failed to capture login IP:', err);
    }
  };

  const signIn = async (emailOrPhone: string, password: string): Promise<{ error: any; requires2FA?: boolean; userId?: string; pendingSession?: any }> => {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const response = await fetch(`${supabaseUrl}/functions/v1/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseAnonKey,
        },
        body: JSON.stringify({
          identifier: emailOrPhone,
          password
        })
      });

      const responseData = await response.json();

      if (response.status === 429) {
        const error = new Error(responseData.error || 'Too many login attempts. Please try again later.');
        (error as any).rateLimitInfo = {
          resetTime: responseData.resetTime,
          remainingAttempts: responseData.remainingAttempts || 0
        };
        throw error;
      }

      if (!response.ok) {
        const error = new Error(
          responseData.error?.includes('Invalid credentials')
            ? 'Invalid email/phone or password. Please check your credentials and try again.'
            : responseData.error || 'Login failed. Please try again.'
        );
        if (responseData.remainingAttempts !== undefined) {
          (error as any).remainingAttempts = responseData.remainingAttempts;
        }
        throw error;
      }

      if (responseData.requires2FA) {
        return {
          error: null,
          requires2FA: true,
          userId: responseData.userId,
          pendingSession: responseData.pendingSession,
        };
      }

      if (responseData.session) {
        await supabase.auth.setSession(responseData.session);
        captureLoginIP(false);
      }

      return { error: null };
    } catch (error: any) {
      return { error };
    }
  };

  const signUp = async (email: string, password: string, userData: any): Promise<{ error: any }> => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: userData,
      },
    });
    if (!error) {
      captureLoginIP(true);
    }
    return { error };
  };

  const signOut = async (): Promise<{ error: any }> => {
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    return { error };
  };

  /**
   * Soft lock: save tokens to Capacitor Preferences, mark app as locked,
   * then clear the in-memory Supabase session WITHOUT calling signOut().
   * 
   * CRITICAL: We must NOT call supabase.auth.signOut() here because that
   * invalidates the refresh token on the server, making biometric restore
   * impossible. Instead we just clear the local session state.
   */
  const lockApp = async (): Promise<void> => {
    const biometricEnabled = isNativeApp() && await isBiometricEnabled();

    if (biometricEnabled) {
      // Save current fresh tokens BEFORE clearing session
      const { data } = await supabase.auth.getSession();
      if (data.session?.access_token && data.session.refresh_token) {
        await setStoredSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
      }
    }

    // Mark app as locked in Capacitor Preferences
    await setAppLockedStorage(true);

    // Clear local session WITHOUT invalidating the refresh token on the server.
    // scope: 'local' only removes the local session, keeping server-side tokens valid.
    await supabase.auth.signOut({ scope: 'local' });
  };

  /** Hard logout: wipe everything, biometric no longer works. */
  const hardLogout = async (): Promise<void> => {
    await hardLogoutStorage();
    await supabase.auth.signOut({ scope: 'local' });
  };

  const value: AuthContextType = {
    user,
    session,
    profile,
    loading,
    signIn,
    signUp,
    signOut,
    lockApp,
    hardLogout,
    refreshProfile,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
    }
