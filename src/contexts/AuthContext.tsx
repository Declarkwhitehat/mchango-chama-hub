import * as React from 'react';
import { createContext, useContext, useEffect, useState, ReactNode, useRef } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  isBiometricEnabledSync,
  isAppLockedSync,
  getStoredSession,
  setStoredSession,
  setAppLocked,
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

    // ── 1. Auth state listener (set up FIRST) ──────────────────────
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

        // Keep stored session fresh on every valid auth event (fire-and-forget async)
        if (
          (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') &&
          newSession.access_token &&
          newSession.refresh_token &&
          isNativeApp()
        ) {
          // Use async isBiometricEnabled() instead of sync localStorage check
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
        if (event === 'TOKEN_REFRESHED' && !newSession) {
          toast.error("Your session has expired. Please log in again.");
        }
      }
    });

    // ── 2. Initialization (runs INSIDE the provider lifecycle) ─────
    const initializeAuth = async () => {
      try {
        // Debug log storage state on native
        if (isNativeApp()) {
          await debugStorageState();
        }

        // Check if we need biometric unlock (soft-locked state)
        if (isNativeApp() && isBiometricEnabledSync() && isAppLockedSync()) {
          const stored = await getStoredSession();
          if (stored) {
            // Attempt biometric authentication
            const bioType = await getBiometricType();
            const bioResult = await authenticateBiometric(
              `Scan your ${bioType} to unlock PAMOJA NOVA`
            );

            if (bioResult.success) {
              // Restore session from stored tokens
              const restored = await restoreSessionFromStored(stored);
              if (restored && mounted) {
                await setAppLocked(false);
                // Session is now set via setSession above (triggered by the listener)
                return;
              }
            }
            // Biometric failed or session expired — stay on login screen
            if (mounted) setLoading(false);
            return;
          }
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

    // ── 3. Visibility change handler (app resume) ──────────────────
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

  /** Soft logout: lock the app but keep stored session for biometric unlock. */
  const lockApp = async (): Promise<void> => {
    // Save current session to secure storage before signing out
    if (isNativeApp() && isBiometricEnabledSync()) {
      const { data } = await supabase.auth.getSession();
      if (data.session?.access_token && data.session.refresh_token) {
        await setStoredSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
      }
    }
    await setAppLocked(true);
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

/**
 * Restore a Supabase session from stored tokens.
 * Tries refreshSession first, falls back to setSession.
 * On success, atomically updates stored tokens with fresh rotated ones.
 */
async function restoreSessionFromStored(
  stored: { access_token: string; refresh_token: string }
): Promise<boolean> {
  // Strategy 1: refresh with stored refresh_token
  try {
    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: stored.refresh_token,
    });
    if (!error && data.session?.access_token && data.session.refresh_token) {
      await setStoredSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });
      return true;
    }
  } catch (err) {
    console.warn('[AuthContext] refreshSession failed:', err);
  }

  // Strategy 2: setSession
  try {
    const { error } = await supabase.auth.setSession({
      access_token: stored.access_token,
      refresh_token: stored.refresh_token,
    });
    if (!error) {
      const { data } = await supabase.auth.getSession();
      if (data.session?.access_token && data.session.refresh_token) {
        await setStoredSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
        return true;
      }
    }
  } catch (err) {
    console.error('[AuthContext] setSession failed:', err);
  }

  // Both failed → tokens are stale
  await hardLogoutStorage();
  return false;
}
