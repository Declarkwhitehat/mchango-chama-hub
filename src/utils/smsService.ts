import { supabase } from "@/integrations/supabase/client";

/**
 * Send transactional SMS using Celcom Africa
 * @param phone - Phone number in international format (e.g., +254712345678)
 * @param message - SMS message content (max 160 chars for single SMS)
 * @param eventType - Optional event type for logging (e.g., 'registration', 'chama_created')
 */
export const sendTransactionalSMS = async (
  phone: string,
  message: string,
  eventType?: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const { data, error } = await supabase.functions.invoke('send-transactional-sms', {
      body: {
        phone,
        message,
        eventType,
      },
    });

    if (error) {
      console.error('SMS sending error:', error);
      return { success: false, error: error.message };
    }

    if (!data?.success) {
      console.error('SMS sending failed:', data);
      return { success: false, error: data?.error || 'Failed to send SMS' };
    }

    return { success: true };
  } catch (error: any) {
    console.error('SMS service error:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send OTP to phone number
 */
export const sendOTP = async (phone: string): Promise<{ success: boolean; error?: string; expiresIn?: number }> => {
  try {
    const { data, error } = await supabase.functions.invoke('send-otp', {
      body: { phone },
    });

    if (error) {
      console.error('OTP sending error:', error);
      return { success: false, error: error.message };
    }

    if (!data?.success) {
      return { success: false, error: data?.error || 'Failed to send OTP' };
    }

    return { success: true, expiresIn: data.expiresIn };
  } catch (error: any) {
    console.error('OTP service error:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Verify OTP
 */
export const verifyOTP = async (
  phone: string,
  otp: string,
  userId?: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const { data, error } = await supabase.functions.invoke('verify-otp', {
      body: { phone, otp, userId },
    });

    if (error) {
      console.error('OTP verification error:', error);
      return { success: false, error: error.message };
    }

    if (!data?.success) {
      return { success: false, error: data?.error || 'Failed to verify OTP' };
    }

    return { success: true };
  } catch (error: any) {
    console.error('OTP verification service error:', error);
    return { success: false, error: error.message };
  }
};

// SMS Templates
export const SMS_TEMPLATES = {
  accountCreated: (name: string) =>
    `Welcome ${name}! Your account has been created successfully. Start exploring our platform now.`,
  
  chamaCreated: (chamaName: string) =>
    `Your Chama "${chamaName}" has been created successfully! Share the link with members to join.`,
  
  mchangoCreated: (mchangoTitle: string) =>
    `Your campaign "${mchangoTitle}" is now live! Share it to start receiving donations.`,
  
  passwordReset: (code: string) =>
    `Your password reset code is: ${code}. Valid for 10 minutes.`,
  
  paymentReceived: (amount: number, reference: string) =>
    `Payment of KES ${amount} received successfully. Ref: ${reference}`,
  
  withdrawalApproved: (amount: number) =>
    `Your withdrawal request of KES ${amount} has been approved and will be processed shortly.`,
};
