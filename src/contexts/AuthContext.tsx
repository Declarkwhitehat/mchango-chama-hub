import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface Profile {
  id: string;
  full_name: string;
  id_number: string;
  phone: string;
  email: string;
  kyc_status: 'pending' | 'approved' | 'rejected';
  id_front_url: string | null;
  id_back_url: string | null;
  kyc_submitted_at: string | null;
  kyc_rejection_reason: string | null;
  email_verified: boolean;
  phone_verified: boolean;
  created_at: string;
  updated_at: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signUp: (data: {
    email: string;
    password: string;
    full_name: string;
    id_number: string;
    phone: string;
  }) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<{ error: any }>;
  refreshProfile: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFetchingProfile, setIsFetchingProfile] = useState(false);

  const fetchProfile = async (userId: string, retryCount = 0): Promise<void> => {
    // Prevent concurrent fetches
    if (isFetchingProfile) return;
    setIsFetchingProfile(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        // If profile doesn't exist yet, retry up to 3 times with exponential backoff
        if (error.code === 'PGRST116' && retryCount < 3) {
          await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retryCount)));
          return fetchProfile(userId, retryCount + 1);
        }
        throw error;
      }
      setProfile(data);
    } catch (error: any) {
      console.error('Error fetching profile:', error);
      // Don't throw - allow user to remain authenticated even if profile fetch fails
      // Profile will be null but user/session will be valid
    } finally {
      setIsFetchingProfile(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    let profileFetchTimeout: NodeJS.Timeout | null = null;

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!mounted) return;

        console.log('Auth state changed:', event);
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          // Clear any pending profile fetch
          if (profileFetchTimeout) {
            clearTimeout(profileFetchTimeout);
          }
          
          // Debounce profile fetching to prevent rapid successive calls
          profileFetchTimeout = setTimeout(() => {
            if (mounted && !isFetchingProfile) {
              fetchProfile(session.user.id);
            }
          }, 300);
        } else {
          setProfile(null);
          setIsFetchingProfile(false);
        }
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        fetchProfile(session.user.id).finally(() => {
          if (mounted) setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      if (profileFetchTimeout) {
        clearTimeout(profileFetchTimeout);
      }
      subscription.unsubscribe();
    };
  }, [isFetchingProfile]);

  const signUp = async (data: {
    email: string;
    password: string;
    full_name: string;
    id_number: string;
    phone: string;
  }) => {
    const { error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          full_name: data.full_name,
          id_number: data.id_number,
          phone: data.phone,
        },
        emailRedirectTo: `${window.location.origin}/kyc-upload`,
      },
    });
    return { error };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    return { error };
  };

  const refreshProfile = () => {
    if (user) {
      fetchProfile(user.id);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        loading,
        signUp,
        signIn,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
