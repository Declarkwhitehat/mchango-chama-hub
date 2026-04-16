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
import React from "react";

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

  // Resolve biometric availability once on mount (async, non-blocking)
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const available = await isNativeBiometricAvailable();
        if (!cancelled) setBiometricReady(available);
      } catch {
        if (!cancelled) setBiometricReady(false);
      }
    };
    if (isNative) {
      check();
    }
    return () => { cancelled = true; };
  }, [isNative, isNativeBiometricAvailable]);

  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [signupStep, setSignupStep] = useState<'details' | 'phone'>('details');
  const [showBiometricSetup, setShowBiometricSetup] = useState(false);
  const [biometricIdentifier, setBiometricIdentifier] = useState('');
  const [biometricCancelled, setBiometricCancelled] = useState(false);
  const [isInitialCheck, setIsInitialCheck] = useState(true);
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

  // Check localStorage for rate limit on mount
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

  // Countdown timer for rate limit
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

  // Auto-trigger biometric authentication on page load
  useEffect(() => {
    // Guard: Only run once per component mount
    if (hasAttemptedAutoLogin.current) return;

    // Wait for native biometric availability check to complete before proceeding
    if (isNative && !biometricReady) return;

    const attemptAutoLogin = async () => {
      try {
        hasAttemptedAutoLogin.current = true;
        setIsInitialCheck(false);

        if (biometricCancelled) return;

        // Native app: use native biometrics (fingerprint/face)
        if (isNative) {
          const nativeBioEnabled = localStorage.getItem('nativeBiometricEnabled') === 'true';
          const storedToken = localStorage.getItem('biometricSession');

          if (biometricReady && nativeBioEnabled && storedToken) {
            const biometryType = await getBiometryType();
            const result = await nativeAuthenticate(`Verify your ${biometryType} to sign in`);

            if (result.success) {
              try {
                const parsed = JSON.parse(storedToken);
                const { error } = await supabase.auth.setSession(parsed);
                if (!error) {
                  toast.success('Welcome back!');
                  navigate(returnTo || '/', { replace: true });
                  return;
                }
              } catch {
                // Token expired or invalid — fall through to password login
                localStorage.removeItem('biometricSession');
              }
            } else {
              setBiometricCancelled(true);
              toast.error('Fingerprint cancelled. Please use your password.');
            }
          }
          return;
        }

        // Browser: use WebAuthn
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
        toast.error('Fingerprint authentication cancelled. Please use your password.');
      }
    };

    attemptAutoLogin();
  }, [
    isWebAuthnSupported, checkHasCredentials, authenticate,
    biometricCancelled, biometricReady, navigate, isNative,
    getBiometryType, nativeAuthenticate, returnTo,
  ]);

  // Format countdown display
  const formatCountdown = (seconds: number): string => {
    if (seconds < 60) {
      return `${seconds} second${seconds !== 1 ? 's' : ''}`;
    }
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes} minute${minutes !== 1 ? 's' : ''} ${secs} second${secs !== 1 ? 's' : ''}`;
  };

  // Calculate password strength
  const calculatePasswordStrength = (password: string) => {
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecialChar = /[^A-Za-z0-9]/.test(password);
    const hasMinLength = password.length >= 8;

    const score = [hasUpperCase, hasLowerCase, hasNumber, hasSpecialChar, hasMinLength].filter(Boolean).length;

    setPasswordStrength({
      score,
      hasUpperCase,
      hasLowerCase,
      hasNumber,
      hasSpecialChar,
      hasMinLength,
    });
  };

  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const signupForm = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
  });

  // Redirect if already logged in
  const [didRedirect, setDidRedirect] = useState(false);
  if (user && !didRedirect && !show2FA) {
    setTimeout(async () => {
      if (didRedirect) return;
      try {
        const { data } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .eq('role', 'admin')
          .maybeSingle();
        setDidRedirect(true);
        navigate(data ? "/admin" : "/home", { replace: true });
      } catch {
        setDidRedirect(true);
        navigate("/home", { replace: true });
      }
    }, 0);
    return null;
  }

  const handleLogin = async (data: LoginFormData) => {
    setIsLoading(true);

    try {
      const result = await signIn(data.emailOrPhone, data.password);
      const { error } = result;

      // Check if 2FA is required
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
          navigate("/admin");
        } else {
          if (isNative) {
            const { data: sessionData } = await supabase.auth.getSession();
            if (sessionData.session) {
              localStorage.setItem('biometricSession', JSON.stringify({
                access_token: sessionData.session.access_token,
                refresh_token: sessionData.session.refresh_token,
              }));
            }
          }

          const nativeBioAvailable = isNative && await isNativeBiometricAvailable();
          if (nativeBioAvailable || isWebAuthnSupported()) {
            setBiometricIdentifier(data.emailOrPhone);
            setShowBiometricSetup(true);
          } else {
            navigate("/home");
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
    const emailOrPhone = loginForm.getValues('emailOrPhone');
    if (!emailOrPhone) {
      toast.error('Please enter your email or phone number first');
      return;
    }

    if (isNative) {
      const result = await nativeAuthenticate('Verify your identity to sign in');
      if (result.success) {
        const storedToken = localStorage.getItem('biometricSession');
        if (storedToken) {
          try {
            const parsed = JSON.parse(storedToken);
            const { error } = await supabase.auth.setSession(parsed);
            if (!error) {
              toast.success('Welcome back!');
              navigate(returnTo || '/home', { replace: true });
              return;
            }
          } catch { /* fall through */ }
        }
        toast.error('Stored session expired. Please log in with your password.');
      }
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
          localStorage.setItem('nativeBiometricEnabled', 'true');
          const { data: sessionData } = await supabase.auth.getSession();
          if (sessionData.session) {
            localStorage.setItem('biometricSession', JSON.stringify({
              access_token: sessionData.session.access_token,
              refresh_token: sessionData.session.refresh_token,
            }));
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
      const { data: uniqueCheck, error: uniqueError } = await supabase
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

      const { error } = await signUp(
        data.email,
        data.password,
        data.full_name,
        data.phone,
        data.id_number
      );

      if (error) {
        if (error.message.includes("already registered") || error.message.includes("already exists")) {
          toast.error("An account with this email already exists. Please log in instead.");
        } else {
          toast.error(error.message);
        }
        return;
      }

      toast.success("Account created! Please check your email to verify your account.");

      const nativeBioAvailable = isNative && await isNativeBiometricAvailable();
      if (nativeBioAvailable || isWebAuthnSupported()) {
        setBiometricIdentifier(data.email);
        setShowBiometricSetup(true);
      } else {
        navigate('/kyc-upload');
      }
    } catch (error: any) {
      toast.error("An unexpected error occurred during signup");
    } finally {
      setIsLoading(false);
    }
  };

  if (show2FA) {
    return (
      <TwoFactorVerification
        userId={pending2FAUserId}
        pendingSession={pending2FASession}
        onSuccess={() => {
          setShow2FA(false);
          navigate(returnTo || '/home', { replace: true });
        }}
        onCancel={()
