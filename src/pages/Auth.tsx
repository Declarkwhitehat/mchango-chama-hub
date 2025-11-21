import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Eye, EyeOff, Check, X, Fingerprint } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { PhoneVerification } from "@/components/PhoneVerification";
import { sendTransactionalSMS, SMS_TEMPLATES } from "@/utils/smsService";
import { useWebAuthn } from "@/hooks/useWebAuthn";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const loginSchema = z.object({
  emailOrPhone: z.string()
    .min(1, "Email or phone number is required")
    .refine(
      (val) => {
        // Check if it's a valid email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (emailRegex.test(val)) return true;
        
        // Check if it's a valid phone (international format or Kenyan format)
        const phoneRegex = /^(\+?\d{10,15}|0\d{9}|[17]\d{8,9})$/;
        return phoneRegex.test(val.replace(/\s/g, ''));
      },
      { message: "Must be a valid email or phone number (e.g., +254712345678 or 0712345678 or email@example.com)" }
    ),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const signupSchema = z.object({
  full_name: z.string().min(2, "Full name is required").max(100),
  id_number: z.string().min(5, "Valid ID number is required").max(50),
  phone: z.string().regex(/^\+\d{10,15}$/, "Phone must be in international format (e.g., +254712345678)"),
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
  const { signIn, signUp, user } = useAuth();
  const { isSupported: isWebAuthnSupported, registerCredential, authenticate, checkHasCredentials, isLoading: isWebAuthnLoading } = useWebAuthn();
  const [isLoading, setIsLoading] = useState(false);
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

  // Auto-trigger biometric authentication on page load
  useEffect(() => {
    // Guard: Only run once per component mount
    if (hasAttemptedAutoLogin.current) {
      return;
    }

    const attemptAutoLogin = async () => {
      try {
        // Mark as attempted immediately and stop showing loading
        hasAttemptedAutoLogin.current = true;
        setIsInitialCheck(false);
        
        // Don't auto-trigger if user cancelled biometric in this session
        if (biometricCancelled) {
          return;
        }
        
        // Don't auto-trigger if device doesn't support WebAuthn
        if (!isWebAuthnSupported()) {
          return;
        }

        // Check for stored identifier from previous successful login
        const storedIdentifier = localStorage.getItem('lastLoginIdentifier');
        if (!storedIdentifier) {
          return;
        }

        // Check if this user has registered credentials
        const hasCredentials = await checkHasCredentials(storedIdentifier);
        if (!hasCredentials) {
          console.log('No biometric credentials found for auto-login');
          return;
        }

        // Trigger fingerprint prompt - native dialog appears here
        const result = await authenticate(storedIdentifier);
        
        if (result.success) {
          toast.success('Welcome back!');
          navigate('/');
        } else {
          // If biometric failed, show clear message to use password
          setBiometricCancelled(true);
          toast.error('Fingerprint authentication failed. Please use your password.');
        }
      } catch (error) {
        console.error('Auto-login error:', error);
        setBiometricCancelled(true); // Don't auto-prompt again this session
        toast.error('Fingerprint authentication cancelled. Please use your password.');
      }
    };

    attemptAutoLogin();
  }, [isWebAuthnSupported, checkHasCredentials, authenticate, biometricCancelled, navigate]);

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
  // Move redirect to effect to avoid running navigation during render
  // and to prevent redirect loops
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [didRedirect, setDidRedirect] = useState(false);
  if (user && !didRedirect) {
    // defer redirect until after paint
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
      const { error } = await signIn(data.emailOrPhone, data.password);
      
      if (error) {
        if (error.message.includes("Invalid login credentials") || error.message.includes("No account found")) {
          toast.error("Invalid credentials. Please check your email/phone and password.");
        } else if (error.message.includes("Email not confirmed")) {
          toast.error("Please verify your email address before logging in. Check your inbox.");
        } else if (error.message.includes("Too many requests")) {
          toast.error("Too many login attempts. Please wait a few minutes and try again.");
        } else {
          toast.error(error.message);
        }
        return;
      }
      
      // Store identifier for next auto-login
      localStorage.setItem('lastLoginIdentifier', data.emailOrPhone);
      
      toast.success("Welcome back!");
      
      // Check if user is admin and redirect appropriately
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
          // Offer biometric setup for next time
          if (isWebAuthnSupported()) {
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

    const result = await authenticate(emailOrPhone);
    if (result.success) {
      // Store identifier for next auto-login
      localStorage.setItem('lastLoginIdentifier', emailOrPhone);
      navigate('/home');
    }
  };

  const handleEnableBiometric = async () => {
    setIsLoading(true);
    try {
      const result = await registerCredential();
      if (result.success) {
        toast.success('Biometric login enabled successfully!');
        setShowBiometricSetup(false);
        // Navigate to KYC if coming from signup (signupStep will be 'phone'), otherwise to home
        navigate(signupStep === 'phone' ? '/kyc-upload' : '/home');
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to enable biometric login');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSkipBiometric = () => {
    setShowBiometricSetup(false);
    // Navigate to KYC if coming from signup (signupStep will be 'phone'), otherwise to home
    navigate(signupStep === 'phone' ? '/kyc-upload' : '/home');
  };

  const handleSignup = async (data: SignupFormData) => {
    // First step: collect details and verify phone
    if (!phoneVerified) {
      setSignupStep('phone');
      return;
    }

    setIsLoading(true);
    
    try {
      const { error: signUpError } = await signUp(data.email, data.password, {
        full_name: data.full_name,
        id_number: data.id_number,
        phone: data.phone,
      });
      
      if (signUpError) {
        if (signUpError.message.includes("already registered") || signUpError.message.includes("User already")) {
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

      // Record T&C acceptance
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

      // Send welcome SMS
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
      
      // Check if device supports biometric and prompt immediately
      if (isWebAuthnSupported()) {
        setShowBiometricSetup(true);
      } else {
        navigate('/kyc-upload');
      }
    } catch (error: any) {
      toast.error("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

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

            <Tabs defaultValue="login" className="w-full">
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
                            disabled={isLoading}
                          >
                            {isLoading ? "Logging in..." : "Login"}
                          </Button>
                          
                          {isWebAuthnSupported() && !biometricCancelled && (
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
                                disabled={isWebAuthnLoading}
                                onClick={handleBiometricLogin}
                              >
                                <Fingerprint className="mr-2 h-4 w-4" />
                                {isWebAuthnLoading ? "Authenticating..." : "Use Fingerprint/Face ID"}
                              </Button>
                            </>
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
                                setSignupStep('details');
                                toast.success("Phone verified! Complete your registration.");
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
