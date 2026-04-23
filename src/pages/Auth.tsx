import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Eye, EyeOff, Check, X, Fingerprint, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { PhoneVerification } from "@/components/PhoneVerification";
import { TwoFactorVerification } from "@/components/TwoFactorVerification";
import { sendTransactionalSMS, SMS_TEMPLATES } from "@/utils/smsService";
import { useWebAuthn } from "@/hooks/useWebAuthn";
import { useNativeBiometrics } from "@/hooks/useNativeBiometrics";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  isBiometricEnabled,
  isAppLocked,
  getStoredSession,
  setStoredSession,
  setAppLocked,
  setBiometricEnabled,
  hardLogoutStorage,
  clearStoredSession,
} from "@/lib/secureStorage";
import { isNativeApp, authenticateBiometric, getBiometricType as getBioType } from "@/lib/biometricHandler";
const loginSchema = z.object({
  emailOrPhone: z.string()
    .min(1, "Email or phone number is required")
    .refine(
      (val) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (emailRegex.test(val)) return true;
        const phoneRegex = /^(\+?\d{10,15}|0\d{9}|[17]\d{8,9})$/;
        return phoneRegex.test(val.replace(/\s/g, ''));
      },
      { message: "Must be a valid email or phone number (e.g., +254712345678 or 0712345678 or email@example.com)" }
    ),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const SAFARICOM_PREFIXES = ['70', '71', '72', '74', '75', '76', '79', '110', '111'];

const isSafaricomNumber = (phone: string): boolean => {
  const numberPart = phone.replace('+254', '');
  return SAFARICOM_PREFIXES.some(prefix => numberPart.startsWith(prefix));
};

const signupSchema = z.object({
  full_name: z.string().min(2, "Full name is required").max(100),
  id_number: z.string().min(5, "Valid ID number is required").max(50),
  phone: z.string()
    .min(10, "Phone number is required")
    .transform((val) => {
      const cleaned = val.replace(/\s/g, '');
      if (cleaned.startsWith('07') || cleaned.startsWith('01')) {
        return '+254' + cleaned.slice(1);
      }
      if (cleaned.startsWith('7') || cleaned.startsWith('1')) {
        return '+254' + cleaned;
      }
      return cleaned;
    })
    .refine((val) => /^\+254\d{9}$/.test(val), "Phone must be a valid Kenyan number (e.g., 0712345678 or +254712345678)")
    .refine((val) => isSafaricomNumber(val), "Only Safaricom numbers are accepted for M-Pesa payouts"),
  email: z.string().email("Invalid email address").max(255),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character"),
  confirmPassword: z.string(),
  acceptTerms: z.boolean().refine(val => val === true, {
    message: "You must accept the Terms and Conditions"
  }),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type LoginFormData = z.infer<typeof loginSchema>;
type SignupFormData = z.infer<typeof signupSchema>;
const Auth = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = location.state?.returnTo;
  const { signIn, signUp, user } = useAuth();
  const { isSupported: isWebAuthnSupported, registerCredential, authenticate, checkHasCredentials, isLoading: isWebAuthnLoading } = useWebAuthn();
  const { isNativeApp: isNative, isAvailable: isNativeBiometricAvailable, authenticate: nativeAuthenticate, getBiometryType } = useNativeBiometrics();
  const [isLoading, setIsLoading] = useState(false);
  const [biometricReady, setBiometricReady] = useState(false);
  const [biometricChecked, setBiometricChecked] = useState(false);
  const [nativeBiometricConfigured, setNativeBiometricConfigured] = useState(false);
  const [nativeBiometricLoginEnabled, setNativeBiometricLoginEnabled] = useState(false);
  const [nativeAppLocked, setNativeAppLocked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const available = await isNativeBiometricAvailable();
        if (!cancelled) {
          setBiometricReady(available);
          setBiometricChecked(true);
        }
      } catch {
        if (!cancelled) {
          setBiometricReady(false);
          setBiometricChecked(true);
        }
      }
    };
    if (isNative) {
      setBiometricChecked(false);
      check();
    } else {
      setBiometricReady(false);
      setBiometricChecked(true);
    }
    return () => { cancelled = true; };
  }, [isNative, isNativeBiometricAvailable]);

  useEffect(() => {
    let cancelled = false;

    const loadNativeBiometricState = async () => {
      if (!isNative) {
        if (!cancelled) {
          setNativeBiometricConfigured(false);
          setNativeBiometricLoginEnabled(false);
          setNativeAppLocked(false);
        }
        return;
      }

      const [enabled, locked] = await Promise.all([
        isBiometricEnabled(),
        isAppLocked(),
      ]);

      if (!cancelled) {
        const configured = biometricReady && enabled;
        setNativeBiometricConfigured(configured);
        setNativeBiometricLoginEnabled(enabled);
        setNativeAppLocked(locked);
      }
    };

    void loadNativeBiometricState();

    return () => {
      cancelled = true;
    };
  }, [biometricReady, isNative]);

  const clearNativeBiometricStorage = async () => {
    await hardLogoutStorage();
    setNativeBiometricConfigured(false);
    setNativeBiometricLoginEnabled(false);
    setNativeAppLocked(false);
  };

  const storeNativeBiometricSession = async (enableLogin = false) => {
    try {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!session?.access_token || !session.refresh_token) return false;
      await setStoredSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });
      if (enableLogin) {
        await setBiometricEnabled(true);
        setNativeBiometricConfigured(true);
        setNativeBiometricLoginEnabled(true);
      }
      return true;
    } catch {
      return false;
    }
  };

  const restoreNativeBiometricSession = async () => {
    const stored = await getStoredSession();
    if (!stored) {
      setNativeBiometricConfigured(false);
      setNativeBiometricLoginEnabled(false);
      return false;
    }

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
        await setAppLocked(false);
        setNativeAppLocked(false);
        return true;
      }
    } catch {}

    // Strategy 2: setSession fallback
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
          await setAppLocked(false);
          setNativeAppLocked(false);
          return true;
        }
      }
    } catch {}

    // Both failed → clear stale tokens
    await clearStoredSession();
    await setAppLocked(false);
    setNativeBiometricConfigured(false);
    setNativeBiometricLoginEnabled(false);
    setNativeAppLocked(false);
    return false;
  };

  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [signupStep, setSignupStep] = useState<'details' | 'phone'>('details');
  const [showBiometricSetup, setShowBiometricSetup] = useState(false);
  const [biometricIdentifier, setBiometricIdentifier] = useState('');
  const [biometricCancelled, setBiometricCancelled] = useState(false);
  const [isInitialCheck, setIsInitialCheck] = useState(false);
  const hasAttemptedAutoLogin = useRef(false);
  const [passwordStrength, setPasswordStrength] = useState({
    score: 0,
    hasUpperCase: false,
    hasLowerCase: false,
    hasNumber: false,
    hasSpecialChar: false,
    hasMinLength: false,
  });
  const [rateLimitResetTime, setRateLimitResetTime] = useState<Date | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);
  const [show2FA, setShow2FA] = useState(false);
  const [pending2FAUserId, setPending2FAUserId] = useState<string>("");
  const [pending2FASession, setPending2FASession] = useState<any>(null);

  useEffect(() => {
    const stored = localStorage.getItem('rateLimitResetTime');
    if (stored) {
      const resetTime = new Date(stored);
      if (resetTime > new Date()) {
        setRateLimitResetTime(resetTime);
      } else {
        localStorage.removeItem('rateLimitResetTime');
      }
    }
  }, []);

  useEffect(() => {
    if (!rateLimitResetTime) return;
    const interval = setInterval(() => {
      const now = new Date();
      const diff = Math.max(0, Math.floor((rateLimitResetTime.getTime() - now.getTime()) / 1000));
      setRemainingSeconds(diff);
      if (diff === 0) {
        setRateLimitResetTime(null);
        localStorage.removeItem('rateLimitResetTime');
        toast.success('You can now try logging in again');
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [rateLimitResetTime]);

  useEffect(() => {
    if (hasAttemptedAutoLogin.current) return;
    if (isNative) {
      hasAttemptedAutoLogin.current = true;
      return;
    }
    if (!biometricChecked) return;

    const attemptAutoLogin = async () => {
      try {
        hasAttemptedAutoLogin.current = true;
        if (biometricCancelled) return;
        if (!isWebAuthnSupported()) return;
        const storedIdentifier = localStorage.getItem('lastLoginIdentifier');
        if (!storedIdentifier) return;
        const hasCredentials = await checkHasCredentials(storedIdentifier);
        if (!hasCredentials) return;
        const result = await authenticate(storedIdentifier);
        if (result.success) {
          toast.success('Welcome back!');
          navigate(returnTo || '/', { replace: true });
        } else {
          setBiometricCancelled(true);
          toast.error('Fingerprint authentication failed. Please use your password.');
        }
      } catch (error) {
        console.error('Auto-login error:', error);
        setBiometricCancelled(true);
      } finally {
        setIsInitialCheck(false);
      }
    };
    void attemptAutoLogin();
  }, [authenticate, biometricCancelled, biometricChecked, checkHasCredentials, isNative, isWebAuthnSupported, navigate, returnTo]);

  const formatCountdown = (seconds: number): string => {
    if (seconds < 60) return `${seconds} second${seconds !== 1 ? 's' : ''}`;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes} minute${minutes !== 1 ? 's' : ''} ${secs} second${secs !== 1 ? 's' : ''}`;
  };

  const calculatePasswordStrength = (password: string) => {
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecialChar = /[^A-Za-z0-9]/.test(password);
    const hasMinLength = password.length >= 8;
    const score = [hasUpperCase, hasLowerCase, hasNumber, hasSpecialChar, hasMinLength].filter(Boolean).length;
    setPasswordStrength({ score, hasUpperCase, hasLowerCase, hasNumber, hasSpecialChar, hasMinLength });
  };

  const loginForm = useForm<LoginFormData>({ resolver: zodResolver(loginSchema) });
  const signupForm = useForm<SignupFormData>({ resolver: zodResolver(signupSchema) });

  const [didRedirect, setDidRedirect] = useState(false);
  useEffect(() => {
    if (!user) return;
    if (didRedirect) return;
    if (show2FA || showBiometricSetup || isLoading) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle();
        if (cancelled) return;
        setDidRedirect(true);
        navigate(data ? "/admin" : (returnTo || "/home"), { replace: true });
      } catch {
        if (cancelled) return;
        setDidRedirect(true);
        navigate(returnTo || "/home", { replace: true });
      }
    })();
    return () => { cancelled = true; };
  }, [user, didRedirect, show2FA, showBiometricSetup, isLoading, navigate, returnTo]);
  const handleLogin = async (data: LoginFormData) => {
    setIsLoading(true);

    try {
      const result = await signIn(data.emailOrPhone, data.password);
      const { error } = result;

      if (result.requires2FA && result.userId) {
        setPending2FAUserId(result.userId);
        setPending2FASession(result.pendingSession);
        setShow2FA(true);
        setIsLoading(false);
        return;
      }

      if (error) {
        if (error.message.includes("Too many") || error.message.includes("rate limit")) {
          if ((error as any).rateLimitInfo?.resetTime) {
            const resetTime = new Date((error as any).rateLimitInfo.resetTime);
            setRateLimitResetTime(resetTime);
            localStorage.setItem('rateLimitResetTime', resetTime.toISOString());
          }
          setRemainingAttempts(null);
          return;
        }

        if ((error as any).remainingAttempts !== undefined) {
          setRemainingAttempts((error as any).remainingAttempts);
        }

        if (error.message.includes("Invalid login credentials") || error.message.includes("No account found") || error.message.includes("Invalid")) {
          toast.error("Invalid credentials. Please check your email/phone and password.");
        } else if (error.message.includes("Email not confirmed")) {
          toast.error("Please verify your email address before logging in. Check your inbox.");
        } else {
          toast.error(error.message);
        }
        return;
      }

      localStorage.setItem('lastLoginIdentifier', data.emailOrPhone);
      setRemainingAttempts(null);
      toast.success("Welcome back!");

      if (returnTo) {
        navigate(returnTo, { replace: true });
        return;
      }

      const { data: userData } = await supabase.auth.getUser();
      if (userData.user) {
        const { data: adminRole } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', userData.user.id)
          .eq('role', 'admin')
          .maybeSingle();

        if (adminRole) {
          navigate("/admin", { replace: true });
        } else {
          if (isNative && biometricReady && !nativeBiometricConfigured) {
            setBiometricIdentifier(data.emailOrPhone);
            setShowBiometricSetup(true);
          } else {
            if (isNative && nativeBiometricConfigured) {
              await storeNativeBiometricSession();
            }
            navigate("/home", { replace: true });
          }
        }
      }
    } catch (error: any) {
      toast.error("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleBiometricLogin = async () => {
    if (isNative) {
      if (!nativeBiometricLoginEnabled) {
        toast.error('Fingerprint login is not set up. Please log in with your password first.');
        return;
      }

      const result = await nativeAuthenticate('Scan your fingerprint to sign in');
      if (result.success) {
        const restored = await restoreNativeBiometricSession();
        if (restored) {
          toast.success('Welcome back!');
          navigate(returnTo || '/home', { replace: true });
          return;
        }
        toast.error('Your session has expired. Please log in with your password once to re-enable fingerprint.');
      }
      return;
    }

    const emailOrPhone = loginForm.getValues('emailOrPhone');
    if (!emailOrPhone) {
      toast.error('Please enter your email or phone number first');
      return;
    }
    const result = await authenticate(emailOrPhone);
    if (result.success) {
      localStorage.setItem('lastLoginIdentifier', emailOrPhone);
      navigate(returnTo || '/home', { replace: true });
    }
  };

  const handleEnableBiometric = async () => {
    setIsLoading(true);
    try {
      if (isNative) {
        const result = await nativeAuthenticate('Verify your identity to enable fingerprint login');
        if (result.success) {
          const stored = await storeNativeBiometricSession(true);
          if (!stored) {
            toast.error('Could not save your login session for fingerprint sign-in. Please log in again.');
            setIsLoading(false);
            return;
          }
          toast.success('Fingerprint login enabled!');
          setShowBiometricSetup(false);
          navigate(returnTo || (signupStep === 'phone' ? '/kyc-upload' : '/home'), { replace: true });
        } else {
          toast.error(result.error || 'Failed to verify fingerprint');
        }
        setIsLoading(false);
        return;
      }

      const result = await registerCredential();
      if (result.success) {
        toast.success('Biometric login enabled successfully!');
        setShowBiometricSetup(false);

        if (returnTo) {
          navigate(returnTo, { replace: true });
        } else {
          navigate(signupStep === 'phone' ? '/kyc-upload' : '/home');
        }
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to enable biometric login');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSkipBiometric = () => {
    setShowBiometricSetup(false);
    if (returnTo) {
      navigate(returnTo, { replace: true });
    } else {
      navigate(signupStep === 'phone' ? '/kyc-upload' : '/home');
    }
  };

  const handleSignup = async (data: SignupFormData) => {
    if (!phoneVerified) {
      setSignupStep('phone');
      return;
    }

    setIsLoading(true);

    try {
      const { data: uniqueCheck } = await supabase
        .rpc('check_signup_uniqueness', {
          p_phone: data.phone,
          p_id_number: data.id_number,
          p_email: data.email,
        });

      if (uniqueCheck) {
        const check = typeof uniqueCheck === 'string' ? JSON.parse(uniqueCheck) : uniqueCheck;
        if (check.phone_exists) {
          toast.error("This phone number is already registered. Please use a different number or log in.");
          setIsLoading(false);
          return;
        }
        if (check.id_number_exists) {
          toast.error("This ID number is already registered. Please contact support if you believe this is an error.");
          setIsLoading(false);
          return;
        }
        if (check.email_exists) {
          toast.error("This email is already registered. Please log in or use a different email.");
          setIsLoading(false);
          return;
        }
      } 

    const { error: signUpError } = await signUp(data.email, data.password, {
        full_name: data.full_name,
        id_number: data.id_number,
        phone: data.phone,
      });

      if (signUpError) {
        if (signUpError.message.includes("phone number is already registered") ||
            signUpError.message.includes("profiles_phone_unique")) {
          toast.error("This phone number is already registered. Please use a different number or log in.");
        } else if (signUpError.message.includes("ID number is already registered") ||
                 signUpError.message.includes("profiles_id_number_key")) {
          toast.error("This ID number is already registered. Please contact support if this is an error.");
        } else if (signUpError.message.includes("already registered") || signUpError.message.includes("User already")) {
          toast.error("This email is already registered. Please log in or use a different email.");
        } else if (signUpError.message.includes("Password")) {
          toast.error("Password is too weak. Please use a stronger password.");
        } else if (signUpError.message.includes("rate limit")) {
          toast.error("Too many requests. Please wait a moment and try again.");
        } else {
          toast.error(signUpError.message);
        }
        return;
      }

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase.from('user_consents').insert({
            user_id: user.id,
            terms_version: 'v1.0',
            privacy_version: 'v1.0',
            ip_address: null,
          });
        }
      } catch (consentError) {
        console.error('Failed to record consent:', consentError);
      }

      try {
        await sendTransactionalSMS(
          data.phone,
          SMS_TEMPLATES.accountCreated(data.full_name),
          'registration'
        );
      } catch (smsError) {
        console.error('Failed to send welcome SMS:', smsError);
      }

      toast.success("Account created successfully!");

      const shouldOfferNativeBiometricSetup = isNative && biometricReady && !nativeBiometricConfigured;
      if (shouldOfferNativeBiometricSetup || isWebAuthnSupported()) {
        setShowBiometricSetup(true);
      } else {
        if (returnTo) {
          navigate(returnTo, { replace: true });
        } else {
          navigate('/kyc-upload');
        }
      }
    } catch (error: any) {
      toast.error("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handle2FAVerified = async () => {
    if (pending2FASession) {
      await supabase.auth.setSession(pending2FASession);
    }

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (currentSession?.access_token) {
        fetch(`${supabaseUrl}/functions/v1/capture-login-ip`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${currentSession.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ is_signup: false }),
        }).catch(err => console.error('Failed to capture IP after 2FA:', err));
      }
    } catch (err) {
      console.error('Failed to capture IP after 2FA:', err);
    }

    const emailOrPhone = loginForm.getValues('emailOrPhone');
    if (emailOrPhone) {
      localStorage.setItem('lastLoginIdentifier', emailOrPhone);
    }

    toast.success("Welcome back!");
    setShow2FA(false);
    setPending2FAUserId("");
    setPending2FASession(null);

    const { data: userData } = await supabase.auth.getUser();
    if (userData.user) {
      const { data: adminRole } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userData.user.id)
        .eq('role', 'admin')
        .maybeSingle();

      if (adminRole) {
        navigate("/admin", { replace: true });
        return;
      }

      if (isNative && !nativeBiometricConfigured) {
        const stored = await storeNativeBiometricSession();
        if (stored) {
          setBiometricIdentifier(emailOrPhone);
          setShowBiometricSetup(true);
          return;
        }
      }

      if (isNative && nativeBiometricConfigured) {
        await storeNativeBiometricSession();
      }

      navigate("/home", { replace: true });
    } else {
      navigate("/home", { replace: true });
    }
  };

  const handle2FACancel = () => {
    setShow2FA(false);
    setPending2FAUserId("");
    setPending2FASession(null);
  };

  if (show2FA && pending2FAUserId) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 flex flex-col items-center justify-center px-4">
        <TwoFactorVerification
          userId={pending2FAUserId}
          onVerified={handle2FAVerified}
          onCancel={handle2FACancel}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 flex flex-col">
      <div className="container px-4 py-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/")}
          className="mb-4"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>

        <div className="flex flex-col items-center justify-center min-h-[calc(100vh-120px)]">
          <div className="w-full max-w-md space-y-6">
            <div className="text-center space-y-2">
              <div className="flex justify-center mb-4">
                <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center shadow-lg">
                  <span className="text-primary-foreground font-bold text-2xl">C</span>
                </div>
              </div>
              <h1 className="text-3xl font-bold text-foreground">Welcome</h1>
              <p className="text-muted-foreground">Join the community of savers and fundraisers</p>
            </div>

            <Tabs defaultValue={new URLSearchParams(location.search).get('tab') === 'signup' ? 'signup' : 'login'} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Login</TabsTrigger>
                <TabsTrigger value="signup">Sign Up</TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <Card>
                  <CardHeader>
                    <CardTitle>Login</CardTitle>
                    <CardDescription>Enter your credentials to access your account</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {isInitialCheck ? (
                      <div className="flex items-center justify-center min-h-[400px]">
                        <div className="text-muted-foreground text-sm">Checking authentication...</div>
                      </div>
                    ) : (
                      <Form {...loginForm}>
                        <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4">
                          {rateLimitResetTime && remainingSeconds > 0 && (
                            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4">
                              <div className="flex items-start gap-3">
                                <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <h4 className="font-semibold text-destructive mb-1">Too Many Login Attempts</h4>
                                  <p className="text-sm text-muted-foreground">
                                    Please wait <span className="font-medium text-foreground">{formatCountdown(remainingSeconds)}</span> before trying again
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}

                          {!rateLimitResetTime && remainingAttempts !== null && remainingAttempts < 5 && (
                            <div className={`${
                              remainingAttempts === 0
                                ? 'bg-destructive/10 border-destructive/30'
                                : remainingAttempts <= 2
                                  ? 'bg-secondary/10 border-secondary/30'
                                  : 'bg-muted/50 border-border/50'
                            } border rounded-lg p-3`}>
                              <div className="flex items-center gap-2">
                                <AlertTriangle className={`h-4 w-4 flex-shrink-0 ${
                                  remainingAttempts === 0
                                    ? 'text-destructive'
                                    : remainingAttempts <= 2
                                      ? 'text-secondary'
                                      : 'text-muted-foreground'
                                }`} />
                                <p className="text-sm">
                                  <span className="font-medium">
                                    {remainingAttempts === 0
                                      ? 'Last attempt remaining'
                                      : `${remainingAttempts} ${remainingAttempts === 1 ? 'attempt' : 'attempts'} remaining`}
                                  </span>
                                  {remainingAttempts <= 2 && (
                                    <span className="text-muted-foreground ml-1">
                                      before temporary lockout
                                    </span>
                                  )}
                                </p>
                              </div>
                            </div>
                          )}

                          <FormField
                            control={loginForm.control}
                            name="emailOrPhone"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Email or Phone Number</FormLabel>
                                <FormControl>
                                  <Input
                                    placeholder="Enter email or phone number"
                                    {...field}
                                    autoComplete="username"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={loginForm.control}
                            name="password"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Password</FormLabel>
                                <FormControl>
                                  <div className="relative">
                                    <Input
                                      type={showLoginPassword ? "text" : "password"}
                                      {...field}
                                    />
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                                      onClick={() => setShowLoginPassword(!showLoginPassword)}
                                    >
                                      {showLoginPassword ? (
                                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                                      ) : (
                                        <Eye className="h-4 w-4 text-muted-foreground" />
                                      )}
                                    </Button>
                                  </div>
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <Button
                            type="submit"
                            variant="hero"
                            className="w-full"
                            disabled={isLoading || (rateLimitResetTime !== null && remainingSeconds > 0)}
                          >
                            {isLoading ? "Logging in..." : "Login"}
                          </Button>

                          {(isWebAuthnSupported() || nativeBiometricLoginEnabled) && (
                            <>
                              <div className="relative">
                                <div className="absolute inset-0 flex items-center">
                                  <span className="w-full border-t border-border" />
                                </div>
                                <div className="relative flex justify-center text-xs uppercase">
                                  <span className="bg-card px-2 text-muted-foreground">Or</span>
                                </div>
                              </div>

                              
                              <Button
                                type="button"
                                variant="outline"
                                className="w-full"
                                disabled={isWebAuthnLoading || (rateLimitResetTime !== null && remainingSeconds > 0)}
                                onClick={handleBiometricLogin}
                              >
                                <Fingerprint className="mr-2 h-4 w-4" />
                                {isWebAuthnLoading ? "Authenticating..." : "Use Fingerprint/Face ID"}
                              </Button>
                            </>
                          )}

                          {isNative && biometricReady && !nativeBiometricConfigured && (
                            <p className="text-center text-xs text-muted-foreground">
                              <Fingerprint className="inline h-3.5 w-3.5 mr-1 align-text-bottom" />
                              Sign in with your password — you can enable Fingerprint login right after.
                            </p>
                          )}

                          {nativeAppLocked && (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded-lg p-3">
                              <span>🔒</span>
                              <span>App locked. Use fingerprint to unlock.</span>
                            </div>
                          )}

                          <div className="text-center">
                            <Link to="/forgot-password" className="text-sm text-primary hover:underline">
                              Forgot password?
                            </Link>
                          </div>
                        </form>
                      </Form>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="signup">
                <Card>
                  <CardHeader>
                    <CardTitle>Create Account</CardTitle>
                    <CardDescription>
                      {signupStep === 'details'
                        ? 'Get started with your financial journey'
                        : 'Verify your phone number'
                      }
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Form {...signupForm}>
                      <form onSubmit={signupForm.handleSubmit(handleSignup)} className="space-y-4">
                        {signupStep === 'details' && (
                          <>
                        <FormField
                          control={signupForm.control}
                          name="full_name"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Full Name</FormLabel>
                              <FormControl>
                                <Input placeholder="John Doe" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={signupForm.control}
                          name="id_number"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>ID Number</FormLabel>
                              <FormControl>
                                <Input placeholder="12345678" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={signupForm.control}
                          name="phone"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Phone Number</FormLabel>
                              <FormControl>
                                <Input placeholder="+254712345678" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={signupForm.control}
                          name="email"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Email</FormLabel>
                              <FormControl>
                                <Input
                                  type="email"
                                  placeholder="name@example.com"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={signupForm.control}
                          name="password"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Password</FormLabel>
                              <FormControl>
                                <div className="relative">
                                  <Input
                                    type={showSignupPassword ? "text" : "password"}
                                    {...field}
                                    onChange={(e) => {
                                      field.onChange(e);
                                      calculatePasswordStrength(e.target.value);
                                    }}
                                  />
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                                    onClick={() => setShowSignupPassword(!showSignupPassword)}
                                  >
                                    {showSignupPassword ? (
                                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                                    ) : (
                                      <Eye className="h-4 w-4 text-muted-foreground" />
                                    )}
                                  </Button>
                                </div>
                              </FormControl>
                              {field.value && (
                                <div className="space-y-2 mt-2">
                                  <div className="flex gap-1">
                                    {[1, 2, 3, 4, 5].map((level) => (
                                      <div
                                        key={level}
                                        className={`h-1 flex-1 rounded-full transition-colors ${
                                          level <= passwordStrength.score
                                            ? passwordStrength.score <= 2
                                              ? "bg-red-500"
                                              : passwordStrength.score <= 3
                                              ? "bg-yellow-500"
                                              : "bg-green-500"
                                            : "bg-muted"
                                        }`}
                                      />
                                    ))}
                                  </div>
                                  <div className="text-xs space-y-1">
                                    {[
                                      { check: passwordStrength.hasMinLength, label: "At least 8 characters" },
                                      { check: passwordStrength.hasUpperCase, label: "One uppercase letter" },
                                      { check: passwordStrength.hasLowerCase, label: "One lowercase letter" },
                                      { check: passwordStrength.hasNumber, label: "One number" },
                                      { check: passwordStrength.hasSpecialChar, label: "One special character" },
                                    ].map((requirement, index) => (
                                      <div key={index} className="flex items-center gap-1 text-muted-foreground">
                                        {requirement.check ? (
                                          <Check className="h-3 w-3 text-green-500" />
                                        ) : (
                                          <X className="h-3 w-3 text-red-500" />
                                        )}
                                        <span className={requirement.check ? "text-green-500" : ""}>
                                          {requirement.label}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={signupForm.control}
                          name="confirmPassword"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Confirm Password</FormLabel>
                              <FormControl>
                                <div className="relative">
                                  <Input
                                    type={showConfirmPassword ? "text" : "password"}
                                    {...field}
                                  />
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                  >
                                    {showConfirmPassword ? (
                                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                                    ) : (
                                      <Eye className="h-4 w-4 text-muted-foreground" />
                                    )}
                                  </Button>
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={signupForm.control}
                          name="acceptTerms"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                              <FormControl>
                                <Checkbox
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                />
                              </FormControl>
                              <div className="space-y-1 leading-none">
                                <FormLabel className="text-sm font-normal">
                                  I agree to the{" "}
                                  <Link to="/terms" target="_blank" className="text-primary hover:underline">
                                    Terms and Conditions
                                  </Link>
                                  {" "}and{" "}
                                  <Link to="/privacy" target="_blank" className="text-primary hover:underline">
                                    Privacy Policy
                                  </Link>
                                </FormLabel>
                                <FormMessage />
                              </div>
                            </FormItem>
                          )}
                        />
                        <Button
                          type="submit"
                          variant="hero"
                          className="w-full"
                          disabled={isLoading}
                        >
                          {isLoading ? "Creating account..." : phoneVerified ? "Complete Registration" : "Continue to Verification"}
                        </Button>
                          </>
                        )}

                        {signupStep === 'phone' && (
                          <div className="space-y-4">
                            <PhoneVerification
                              phone={signupForm.watch('phone')}
                              onPhoneChange={(phone) => signupForm.setValue('phone', phone)}
                              onVerified={() => {
                                setPhoneVerified(true);
                                toast.success("Phone verified! Creating your account...");
                                setTimeout(() => {
                                  signupForm.handleSubmit(handleSignup)();
                                }, 500);
                              }}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              className="w-full"
                              onClick={() => setSignupStep('details')}
                            >
                              Back to Details
                            </Button>
                          </div>
                        )}
                      </form>
                    </Form>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>

      {/* Biometric Setup Dialog */}
      <Dialog open={showBiometricSetup} onOpenChange={setShowBiometricSetup}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Fingerprint className="h-5 w-5 text-primary" />
              Enable Biometric Login?
            </DialogTitle>
            <DialogDescription>
              Use your fingerprint or face recognition for faster and more secure login next time.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              Your biometric data stays secure on your device and is never shared. You can always use your password if needed.
            </p>
          </div>
          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleSkipBiometric}
              disabled={isWebAuthnLoading}
            >
              Maybe Later
            </Button>
            <Button
              onClick={handleEnableBiometric}
              disabled={isWebAuthnLoading}
            >
              {isWebAuthnLoading ? "Setting up..." : "Enable Biometric Login"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Auth;
