import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Mail, Smartphone, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

const identifierSchema = z.object({
  emailOrPhone: z.string()
    .min(1, "Email or phone number is required")
    .refine(
      (val) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (emailRegex.test(val)) return true;
        const phoneRegex = /^(\+?\d{10,15}|0\d{9}|[17]\d{8,9})$/;
        return phoneRegex.test(val.replace(/\s/g, ''));
      },
      { message: "Must be a valid email or phone number" }
    ),
});

const newPasswordSchema = z.object({
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type IdentifierFormData = z.infer<typeof identifierSchema>;
type NewPasswordFormData = z.infer<typeof newPasswordSchema>;

type Step = 'identifier' | 'otp' | 'newPassword' | 'success';

const ForgotPassword = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<Step>('identifier');
  const [isPhone, setIsPhone] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [normalizedPhone, setNormalizedPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const identifierForm = useForm<IdentifierFormData>({
    resolver: zodResolver(identifierSchema),
  });

  const passwordForm = useForm<NewPasswordFormData>({
    resolver: zodResolver(newPasswordSchema),
  });

  const normalizePhone = (phone: string): string => {
    let normalized = phone.trim();
    if (normalized.startsWith('0')) {
      normalized = '+254' + normalized.substring(1);
    } else if (normalized.startsWith('7') || normalized.startsWith('1')) {
      normalized = '+254' + normalized;
    } else if (!normalized.startsWith('+')) {
      normalized = '+' + normalized;
    }
    return normalized;
  };

  const handleIdentifierSubmit = async (data: IdentifierFormData) => {
    setIsLoading(true);
    setIdentifier(data.emailOrPhone);
    
    try {
      // Detect if it's a phone or email
      const phoneCheck = /^[\+\d]/.test(data.emailOrPhone.trim()) && !data.emailOrPhone.includes('@');
      setIsPhone(phoneCheck);

      if (phoneCheck) {
        // Phone flow: Send OTP
        const phone = normalizePhone(data.emailOrPhone);
        setNormalizedPhone(phone);

        // Check if phone exists in database
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('id')
          .eq('phone', phone)
          .single();

        if (profileError || !profile) {
          toast.error("No account found with this phone number");
          return;
        }

        // Send OTP
        const { error: otpError } = await supabase.functions.invoke('send-otp', {
          body: { phone }
        });

        if (otpError) {
          toast.error("Failed to send OTP. Please try again.");
          return;
        }

        toast.success("OTP sent to your phone");
        setStep('otp');
      } else {
        // Email flow: Use Supabase's built-in password reset
        const redirectUrl = `${window.location.origin}/reset-password`;
        
        const { error } = await supabase.auth.resetPasswordForEmail(data.emailOrPhone, {
          redirectTo: redirectUrl,
        });
        
        if (error) {
          toast.error(error.message);
          return;
        }
        
        setStep('success');
        toast.success("Password reset email sent! Check your inbox.");
      }
    } catch (error: any) {
      toast.error(error.message || "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (otp.length !== 6) {
      toast.error("Please enter a 6-digit OTP");
      return;
    }

    setIsLoading(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('verify-otp', {
        body: { 
          phone: normalizedPhone,
          otp 
        }
      });

      if (error || !data?.verified) {
        toast.error(data?.error || "Invalid OTP. Please try again.");
        return;
      }

      toast.success("OTP verified!");
      setStep('newPassword');
    } catch (error: any) {
      toast.error("Failed to verify OTP");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordReset = async (data: NewPasswordFormData) => {
    setIsLoading(true);
    
    try {
      const { error } = await supabase.functions.invoke('reset-password-phone', {
        body: {
          phone: normalizedPhone,
          newPassword: data.password,
          otp
        }
      });

      if (error) {
        toast.error("Failed to reset password. Please try again.");
        return;
      }

      toast.success("Password reset successfully!");
      setStep('success');
    } catch (error: any) {
      toast.error(error.message || "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOTP = async () => {
    setIsLoading(true);
    try {
      const { error } = await supabase.functions.invoke('send-otp', {
        body: { phone: normalizedPhone }
      });

      if (error) {
        toast.error("Failed to resend OTP");
        return;
      }

      toast.success("OTP resent successfully");
      setOtp("");
    } catch (error) {
      toast.error("Failed to resend OTP");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Button
          variant="ghost"
          onClick={() => step === 'identifier' ? navigate("/auth") : setStep('identifier')}
          className="mb-6"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {step === 'identifier' ? 'Back to Login' : 'Back'}
        </Button>

        <Card>
          <CardHeader className="space-y-1">
            <div className="flex items-center justify-center mb-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                {step === 'otp' ? (
                  <Smartphone className="h-6 w-6 text-primary" />
                ) : (
                  <Mail className="h-6 w-6 text-primary" />
                )}
              </div>
            </div>
            <CardTitle className="text-2xl text-center">
              {step === 'identifier' && 'Forgot Password?'}
              {step === 'otp' && 'Verify OTP'}
              {step === 'newPassword' && 'Set New Password'}
              {step === 'success' && 'Success!'}
            </CardTitle>
            <CardDescription className="text-center">
              {step === 'identifier' && 'Enter your email or phone number to reset your password'}
              {step === 'otp' && `Enter the 6-digit code sent to ${identifier}`}
              {step === 'newPassword' && 'Enter your new password'}
              {step === 'success' && (isPhone 
                ? 'Your password has been reset successfully'
                : `Check your email at ${identifier} for reset instructions`
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {step === 'identifier' && (
              <Form {...identifierForm}>
                <form onSubmit={identifierForm.handleSubmit(handleIdentifierSubmit)} className="space-y-4">
                  <FormField
                    control={identifierForm.control}
                    name="emailOrPhone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email or Phone Number</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Enter email or phone number"
                            {...field}
                          />
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
                    {isLoading ? "Processing..." : "Continue"}
                  </Button>
                </form>
              </Form>
            )}

            {step === 'otp' && (
              <div className="space-y-4">
                <div className="flex flex-col items-center space-y-4">
                  <InputOTP
                    maxLength={6}
                    value={otp}
                    onChange={setOtp}
                  >
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                <Button
                  onClick={handleVerifyOTP}
                  variant="hero"
                  className="w-full"
                  disabled={isLoading || otp.length !== 6}
                >
                  {isLoading ? "Verifying..." : "Verify OTP"}
                </Button>
                <div className="text-center">
                  <Button
                    variant="ghost"
                    onClick={handleResendOTP}
                    disabled={isLoading}
                    className="text-sm"
                  >
                    Resend OTP
                  </Button>
                </div>
              </div>
            )}

            {step === 'newPassword' && (
              <Form {...passwordForm}>
                <form onSubmit={passwordForm.handleSubmit(handlePasswordReset)} className="space-y-4">
                  <FormField
                    control={passwordForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>New Password</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              type={showPassword ? "text" : "password"}
                              placeholder="Enter new password"
                              {...field}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                              onClick={() => setShowPassword(!showPassword)}
                            >
                              {showPassword ? (
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
                    control={passwordForm.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confirm Password</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              type={showConfirmPassword ? "text" : "password"}
                              placeholder="Confirm new password"
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
                  <Button
                    type="submit"
                    variant="hero"
                    className="w-full"
                    disabled={isLoading}
                  >
                    {isLoading ? "Resetting..." : "Reset Password"}
                  </Button>
                </form>
              </Form>
            )}

            {step === 'success' && (
              <div className="space-y-4">
                {!isPhone && (
                  <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
                    <p className="text-sm text-muted-foreground text-center">
                      We've sent a password reset link to <strong>{identifier}</strong>
                    </p>
                  </div>
                )}
                <div className="text-center space-y-3">
                  {!isPhone && (
                    <p className="text-sm text-muted-foreground">
                      Didn't receive the email? Check your spam folder.
                    </p>
                  )}
                  <Button
                    variant="hero"
                    onClick={() => navigate("/auth")}
                    className="w-full"
                  >
                    {isPhone ? 'Login with New Password' : 'Return to Login'}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ForgotPassword;
