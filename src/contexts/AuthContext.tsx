import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

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

  const signIn = async (emailOrPhone: string, password: string) => {
    let emailToUse = emailOrPhone;
    
    // Detect if input is a phone number
    const isPhone = /^[\+\d]/.test(emailOrPhone.trim()) && !emailOrPhone.includes('@');
    
    if (isPhone) {
      // Normalize phone to +254 format
      let normalizedPhone = emailOrPhone.trim();
      if (normalizedPhone.startsWith('0')) {
        normalizedPhone = '+254' + normalizedPhone.substring(1);
      } else if (normalizedPhone.startsWith('7') || normalizedPhone.startsWith('1')) {
        normalizedPhone = '+254' + normalizedPhone;
      } else if (!normalizedPhone.startsWith('+')) {
        normalizedPhone = '+' + normalizedPhone;
      }
      
      // Query profiles table to get email
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('email')
        .eq('phone', normalizedPhone)
        .single();
      
      if (profileError || !profile?.email) {
        return { error: { message: 'No account found with this phone number' } };
      }
      
      emailToUse = profile.email;
    }
    
    // Proceed with email-based authentication
    const { error } = await supabase.auth.signInWithPassword({
      email: emailToUse,
      password,
    });
    
    return { error };
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
