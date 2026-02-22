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
  signIn: (emailOrPhone: string, password: string) => Promise<{ error: any }>;
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
        .select('*')
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
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!mounted) return;
      
      setSession(newSession);
      setUser(newSession?.user ?? null);
      
      if (newSession?.user) {
        // Defer profile fetch to avoid Navigator LockManager deadlock
        setTimeout(() => {
          if (mounted) {
            fetchProfile(newSession.user.id);
          }
        }, 0);
      } else {
        setProfile(null);
      }
      // Do NOT set loading here - let initializeAuth control it
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

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Session Timeout Protection
  useEffect(() => {
    if (!session) return;

    const checkSessionExpiry = setInterval(async () => {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      
      if (currentSession?.expires_at) {
        const expiryTime = new Date(currentSession.expires_at * 1000);
        const now = new Date();
        const timeUntilExpiry = expiryTime.getTime() - now.getTime();
        
        // Warn user 5 minutes before expiry
        if (timeUntilExpiry < 5 * 60 * 1000 && timeUntilExpiry > 0) {
          toast.warning("Your session will expire soon. Please save your work.", {
            duration: 10000,
          });
        }
        
        // Force logout on expiry
        if (timeUntilExpiry <= 0) {
          await signOut();
          toast.error("Your session has expired. Please log in again.");
        }
      }
    }, 60000); // Check every minute

    return () => clearInterval(checkSessionExpiry);
  }, [session]);

  const signIn = async (emailOrPhone: string, password: string): Promise<{ error: any }> => {
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

      // Success - set session
      if (responseData.session) {
        await supabase.auth.setSession(responseData.session);
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
