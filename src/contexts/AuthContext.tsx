import * as React from 'react';
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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

    // Listener for ONGOING auth changes - never await Supabase calls here
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
      } else {
        setProfile(null);
        if (event === 'TOKEN_REFRESHED' && !newSession) {
          toast.error("Your session has expired. Please log in again.");
        }
      }
    });

    // INITIAL load - controls loading state
    const initializeAuth = async () => {
      try {
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

    initializeAuth();

    // Refresh session when tab regains focus (fixes stale token after idle)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
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
      
      // Call login edge function with direct fetch for full response control
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

      // Handle 429 rate limit error
      if (response.status === 429) {
        const error = new Error(responseData.error || 'Too many login attempts. Please try again later.');
        (error as any).rateLimitInfo = {
          resetTime: responseData.resetTime,
          remainingAttempts: responseData.remainingAttempts || 0
        };
        throw error;
      }

      // Handle other error responses
      if (!response.ok) {
        const error = new Error(
          responseData.error?.includes('Invalid credentials')
            ? 'Invalid email/phone or password. Please check your credentials and try again.'
            : responseData.error || 'Login failed. Please try again.'
        );
        // Include remaining attempts info for all errors
        if (responseData.remainingAttempts !== undefined) {
          (error as any).remainingAttempts = responseData.remainingAttempts;
        }
        throw error;
      }

      // Check if 2FA is required
      if (responseData.requires2FA) {
        return { 
          error: null, 
          requires2FA: true, 
          userId: responseData.userId,
          pendingSession: responseData.pendingSession,
        };
      }

      // Success - set session
      if (responseData.session) {
        await supabase.auth.setSession(responseData.session);
        // Capture IP after successful login
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
      // Capture IP after successful signup
      captureLoginIP(true);
    }
    return { error };
  };

  const signOut = async (): Promise<{ error: any }> => {
    const { error } = await supabase.auth.signOut();
    return { error };
  };

  const value: AuthContextType = {
    user,
    session,
    profile,
    loading,
    signIn,
    signUp,
    signOut,
    refreshProfile,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
