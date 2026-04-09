import { supabase } from "@/integrations/supabase/client";

/**
 * Send transactional SMS using Onfon Media
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

// SMS Templates — Pamojanova branded, professional, concise
const STOP_LINE = '\nSTOP 4569*5#';

export const SMS_TEMPLATES = {
  accountCreated: (name: string) =>
    `Pamojanova: Welcome, ${name}! Your account has been created successfully. Log in to explore Chamas, Mchangos, and more.${STOP_LINE}`,

  chamaCreated: (chamaName: string) =>
    `Pamojanova: Your Chama "${chamaName}" has been created. Share the invite link with members to get started.${STOP_LINE}`,

  mchangoCreated: (mchangoTitle: string) =>
    `Pamojanova: Your campaign "${mchangoTitle}" is now live. Share it to start receiving donations.${STOP_LINE}`,

  passwordReset: (code: string) =>
    `Pamojanova: Your password reset code is ${code}. It expires in 10 minutes. Do not share this code with anyone.${STOP_LINE}`,

  paymentReceived: (amount: number, reference: string) =>
    `Pamojanova: Payment of KES ${amount.toFixed(2)} received successfully. Ref: ${reference}. Thank you!${STOP_LINE}`,

  dailyPaymentReminder: (name: string, amount: number, memberCode: string) =>
    `Pamojanova: Hi ${name}, your contribution of KES ${amount.toFixed(2)} is due today. Pay via M-Pesa or online. Member ID: ${memberCode}.${STOP_LINE}`,

  fullPayoutNotice: (amount: number, chamaName: string, requiresVerification: boolean) =>
    `Pamojanova: Payout of KES ${amount.toFixed(2)} from "${chamaName}" has been processed. All members contributed. ${requiresVerification ? 'Pending admin approval.' : 'Funds will arrive shortly.'}${STOP_LINE}`,

  partialPayoutNotice: (amount: number, chamaName: string, paidCount: number, totalCount: number, requiresVerification: boolean) =>
    `Pamojanova: Payout of KES ${amount.toFixed(2)} from "${chamaName}" processed (${paidCount}/${totalCount} members paid). ${requiresVerification ? 'Pending admin approval.' : 'Funds will arrive shortly.'}${STOP_LINE}`,

  latePaymentCredit: (amount: number, nextCycleDate: string) =>
    `Pamojanova: Your payment of KES ${amount.toFixed(2)} was received after the daily cut-off. It has been credited to your next cycle on ${nextCycleDate}.${STOP_LINE}`,

  managerMissedPaymentAlert: (memberName: string, memberCode: string, chamaName: string, missedCount: number) =>
    `Pamojanova: Alert — ${memberName} (${memberCode}) has missed ${missedCount} contribution(s) in "${chamaName}". Please follow up.${STOP_LINE}`,

  withdrawalApproved: (amount: number) =>
    `Pamojanova: Your withdrawal of KES ${amount.toFixed(2)} has been approved and will be processed shortly.${STOP_LINE}`,

  chamaStarted: (chamaName: string, amount: number, frequency: string, memberNumber: number, payoutDate: string, startDate: string) =>
    `Pamojanova: "${chamaName}" has officially started on ${startDate}. Contribute KES ${amount.toLocaleString()} ${frequency}. You are member #${memberNumber}. Your payout date: ${payoutDate}.${STOP_LINE}`,

  paymentReminder: (chamaName: string, amount: number, dueDate: string, memberCode: string) =>
    `Pamojanova: Reminder — Your contribution of KES ${amount.toLocaleString()} for "${chamaName}" is due on ${dueDate}. Member ID: ${memberCode}. Pay on time to secure your payout.${STOP_LINE}`,

  cycleComplete: (chamaName: string, managerName: string, managerPhone: string, memberCode: string) =>
    `Pamojanova: "${chamaName}" has completed its full cycle. All payouts have been made. To rejoin, contact ${managerName} at ${managerPhone} or log in to the app. Member ID: ${memberCode}.${STOP_LINE}`,

  rejoinRequestSubmitted: (memberName: string, chamaName: string) =>
    `Pamojanova: ${memberName} has submitted a rejoin request for "${chamaName}". Log in to approve or reject it.${STOP_LINE}`,

  rejoinApproved: (chamaName: string) =>
    `Pamojanova: Your rejoin request for "${chamaName}" has been approved. You will be notified when the new cycle begins.${STOP_LINE}`,

  rejoinRejected: (chamaName: string, reason?: string) =>
    `Pamojanova: Your rejoin request for "${chamaName}" was not approved. ${reason || 'Contact the manager for details.'}${STOP_LINE}`,

  newCycleStarted: (chamaName: string, memberNumber: number, payoutDate: string) =>
    `Pamojanova: A new cycle has started for "${chamaName}". You are member #${memberNumber}. Your payout date: ${payoutDate}. Contributions begin now.${STOP_LINE}`,

  payoutConfirmed: (amount: number, reference: string, entityType: string, entityName: string, timestamp: string) =>
    `Pamojanova: Payout of KES ${amount.toFixed(2)} confirmed. Ref: ${reference}. Source: ${entityType} "${entityName}". Sent on ${timestamp}. Sisi tuko pamoja, je wewe?${STOP_LINE}`,

  chamaDeleted: (chamaName: string, rejoinCount: number, totalMembers: number) =>
    `Pamojanova: "${chamaName}" did not meet the 40% rejoin requirement (${rejoinCount}/${totalMembers}). The Chama has been closed. You may join or create a new one.${STOP_LINE}`,
};
