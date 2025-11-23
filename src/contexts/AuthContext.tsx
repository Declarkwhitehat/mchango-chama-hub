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

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  profile: null,
  loading: true,
  signIn: async () => ({ error: null }),
  signUp: async () => ({ error: null }),
  signOut: async () => ({ error: null }),
  refreshProfile: async () => {},
});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (!error && data) {
      setProfile(data);
    }
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  };

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      }
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Phase 2: Session Timeout Protection
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

  const signIn = async (emailOrPhone: string, password: string) => {
    try {
      // Call rate-limited login edge function
      const { data: loginData, error: loginError } = await supabase.functions.invoke('login', {
        body: { identifier: emailOrPhone, password }
      });

      if (loginError) {
        throw loginError;
      }

      if (loginData.error) {
        // Provide user-friendly error messages
        if (loginData.error.includes('Invalid credentials')) {
          throw new Error('Invalid email/phone or password. Please check your credentials and try again.');
        }
        if (loginData.error.includes('Too many login attempts')) {
          throw new Error(loginData.error);
        }
        throw new Error(loginData.error);
      }

      // Set session from edge function response
      if (loginData.session) {
        await supabase.auth.setSession(loginData.session);
      }
      
      return { error: null };
    } catch (error: any) {
      console.error('Sign in error:', error);
      return { error };
    }
  };

  const signUp = async (email: string, password: string, userData: any) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: userData,
      },
    });
    return { error };
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    return { error };
  };

  const value = {
    user,
    session,
    profile,
    loading,
    signIn,
    signUp,
    signOut,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
