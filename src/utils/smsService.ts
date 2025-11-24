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
  
  dailyPaymentReminder: (name: string, amount: number, memberCode: string) =>
    `Hi ${name}, reminder: Your contribution of KES ${amount} is due today. Pay via M-Pesa or online. Member ID: ${memberCode}`,
  
  fullPayoutNotice: (amount: number, chamaName: string, requiresVerification: boolean) =>
    `Your chama "${chamaName}" payout of KES ${amount.toFixed(2)} has been processed. Full payout - all members contributed! ${requiresVerification ? 'Pending admin approval.' : "You'll receive it shortly."}`,
  
  partialPayoutNotice: (amount: number, chamaName: string, paidCount: number, totalCount: number, requiresVerification: boolean) =>
    `Your chama "${chamaName}" payout of KES ${amount.toFixed(2)} has been processed. Partial payout (${paidCount}/${totalCount} members paid). ${requiresVerification ? 'Pending admin approval.' : "You'll receive it shortly."}`,
  
  latePaymentCredit: (amount: number, nextCycleDate: string) =>
    `Your payment of KES ${amount} was received after 8 PM. It has been credited to your next cycle contribution on ${nextCycleDate}.`,
  
  managerMissedPaymentAlert: (memberName: string, memberCode: string, chamaName: string, missedCount: number) =>
    `Alert: Member ${memberName} (${memberCode}) has missed ${missedCount} contributions in your Chama "${chamaName}". Please follow up.`,
  
  withdrawalApproved: (amount: number) =>
    `Your withdrawal request of KES ${amount} has been approved and will be processed shortly.`,
  
  chamaStarted: (chamaName: string, amount: number, frequency: string, memberNumber: number, payoutDate: string, startDate: string) =>
    `Your Chama "${chamaName}" has officially started! You will contribute KES ${amount.toLocaleString()} ${frequency}, starting ${startDate}. You are member #${memberNumber}, and your payout date will be ${payoutDate}.`,
  
  paymentReminder: (chamaName: string, amount: number, dueDate: string, memberCode: string) =>
    `⏰ Reminder: Your contribution of KSh ${amount.toLocaleString()} for "${chamaName}" is due on ${dueDate}. Member ID: ${memberCode}. Pay on time to avoid missing your payout turn!`,
  
  cycleComplete: (chamaName: string, managerName: string, managerPhone: string, memberCode: string) =>
    `🎉 Great news! Your chama "${chamaName}" has completed its full cycle. All members have received their payouts! Would you like to rejoin for another cycle? Reply to your manager ${managerName} at ${managerPhone} or log in to the app. Member ID: ${memberCode}`,
  
  rejoinRequestSubmitted: (memberName: string, chamaName: string) =>
    `New rejoin request for "${chamaName}" from ${memberName}. Log in to the app to approve or reject this request.`,
  
  rejoinApproved: (chamaName: string) =>
    `✅ Your rejoin request for "${chamaName}" has been approved! You'll be notified when the new cycle starts with your new payout position.`,
  
  rejoinRejected: (chamaName: string, reason?: string) =>
    `❌ Your rejoin request for "${chamaName}" was not approved. ${reason || 'Please contact the manager for more information.'}`,
  
  newCycleStarted: (chamaName: string, memberNumber: number, payoutDate: string) =>
    `🔄 New cycle started for "${chamaName}"! You're member #${memberNumber}. Your payout date: ${payoutDate}. Contributions start now. Good luck! 🎯`,
};
