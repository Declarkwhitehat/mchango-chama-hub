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
  const lastProcessedUserId = useState<string | null>(null)[0];

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
    let isInitializing = true;

    console.log('[AuthDebug] AuthContext mounting');

    // Set up auth state listener FIRST (before getSession)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;

        console.log('[AuthDebug] Auth event:', event, 'hasSession:', !!session, 'user:', session?.user?.email);
        
        // Update session and user state
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          // Clear any pending profile fetch
          if (profileFetchTimeout) {
            clearTimeout(profileFetchTimeout);
          }
          
          // Only fetch profile once after initial session
          if (event === 'INITIAL_SESSION') {
            console.log('[AuthDebug] Fetching profile for user:', session.user.id);
            fetchProfile(session.user.id).finally(() => {
              if (isInitializing) {
                console.log('[AuthDebug] Initial session loaded');
                isInitializing = false;
                setLoading(false);
              }
            });
          } else if (isInitializing && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
            // Finish initialization on first non-initial event
            isInitializing = false;
            setLoading(false);
          }
        } else {
          // No session - clear profile and finish loading
          console.log('[AuthDebug] No session, clearing profile');
          setProfile(null);
          setIsFetchingProfile(false);
          if (isInitializing) {
            isInitializing = false;
            setLoading(false);
          }
        }
      }
    );

    // Handle OAuth/magic link redirect if present, then check for session
    (async () => {
      try {
        // Attempt code exchange once; ignore errors if not applicable
        const { data: exchangeData } = await supabase.auth.exchangeCodeForSession(window.location.href);
        console.log('[AuthDebug] exchangeCodeForSession ->', !!exchangeData?.session);
        if (exchangeData?.session) {
          // Clean URL after successful exchange
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      } catch (e) {
        console.log('[AuthDebug] exchangeCodeForSession skipped/failed');
      }

      // Proceed to read current session (INITIAL_SESSION event will also fire)
      supabase.auth.getSession().then(({ data: { session }, error }) => {
        if (error) {
          console.error('[AuthDebug] Error getting session:', error);
        }
        console.log('[AuthDebug] Initial getSession result:', !!session, 'user:', session?.user?.email);
        
        if (!mounted) return;
        
        if (session) {
          setSession(session);
          setUser(session.user);
        } else if (!session && isInitializing) {
          console.log('[AuthDebug] No initial session found');
          isInitializing = false;
          setLoading(false);
        }
      });
    })();

    return () => {
      console.log('[AuthDebug] AuthContext unmounting');
      mounted = false;
      if (profileFetchTimeout) {
        clearTimeout(profileFetchTimeout);
      }
      subscription.unsubscribe();
    };
  }, []);

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

    // Capture IP address on signup
    if (!error) {
      setTimeout(async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            await supabase.functions.invoke('capture-login-ip', {
              body: { is_signup: true },
              headers: { Authorization: `Bearer ${session.access_token}` }
            });
          }
        } catch (ipError) {
          console.error('Failed to capture signup IP:', ipError);
          // Don't block signup flow if IP capture fails
        }
      }, 0);
    }

    return { error };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    // Capture IP address on login
    if (!error) {
      setTimeout(async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            await supabase.functions.invoke('capture-login-ip', {
              body: { is_signup: false },
              headers: { Authorization: `Bearer ${session.access_token}` }
            });
          }
        } catch (ipError) {
          console.error('Failed to capture login IP:', ipError);
          // Don't block login flow if IP capture fails
        }
      }, 0);
    }

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
