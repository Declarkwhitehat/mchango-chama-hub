// Use a structural type so this helper works with any @supabase/supabase-js client version.
type AnySupabaseClient = {
  from: (table: string) => any;
};

interface CreateNotificationParams {
  userId: string;
  title: string;
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  category: 'verification' | 'withdrawal' | 'payment' | 'reminder' | 'chama' | 'campaign' | 'organization' | 'welfare';
  relatedEntityId?: string;
  relatedEntityType?: string;
}

/**
 * Sends a push notification banner via FCM to all devices for a user.
 * Non-blocking — never throws or crashes the caller.
 */
async function sendPushNotification(
  userId: string,
  title: string,
  body: string,
): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    console.warn('[Push] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return;
  }

  try {
    const res = await fetch(
      `${supabaseUrl}/functions/v1/send-push-notification`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': serviceRoleKey,
          'Authorization': `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({ user_id: userId, title, body }),
      },
    );

    if (!res.ok) {
      const text = await res.text();
      console.warn('[Push] Notification failed:', res.status, text);
    } else {
      console.log('[Push] Notification sent to user:', userId);
    }
  } catch (err) {
    // Non-fatal — never crash the caller
    console.warn('[Push] Error sending push notification (non-fatal):', err);
  }
}

/**
 * Creates an in-app notification in the DB AND sends a push notification banner.
 * Every place that calls this will now automatically get both.
 */
export async function createNotification(
  adminClient: AnySupabaseClient,
  params: CreateNotificationParams
) {
  try {
    // 1. Save in-app notification to database
    const { error } = await adminClient
      .from('notifications')
      .insert({
        user_id: params.userId,
        title: params.title,
        message: params.message,
        type: params.type || 'info',
        category: params.category,
        related_entity_id: params.relatedEntityId,
        related_entity_type: params.relatedEntityType,
      });

    if (error) {
      console.error('Error creating notification:', error);
    }

    // 2. Send push notification banner (fire-and-forget, never blocks)
    void sendPushNotification(params.userId, params.title, params.message);

  } catch (err) {
    console.error('Failed to create notification:', err);
  }
}

/**
 * Send the same notification to a list of users (deduped). Best-effort, never throws.
 * Useful for fan-out notifications (e.g. notify all donors when a campaign withdraws).
 */
export async function notifyManyUsers(
  adminClient: AnySupabaseClient,
  userIds: (string | null | undefined)[],
  notification: Omit<CreateNotificationParams, 'userId'>,
) {
  const unique = Array.from(
    new Set(userIds.filter((id): id is string => !!id && typeof id === 'string')),
  );
  if (unique.length === 0) return;
  await Promise.allSettled(
    unique.map((userId) =>
      createNotification(adminClient, { ...notification, userId }),
    ),
  );
}

// ─── Notification Templates ───────────────────────────────────────────────────

export const NotificationTemplates = {
  // ── Withdrawals ──
  withdrawalRequested: (amount: number, entityName: string) => ({
    title: 'Withdrawal Request Submitted',
    message: `Your withdrawal request of KES ${amount.toLocaleString()} from "${entityName}" is being processed.`,
    type: 'info' as const,
    category: 'withdrawal' as const,
  }),

  withdrawalApproved: (amount: number) => ({
    title: 'Withdrawal Approved! 💰',
    message: `Your withdrawal of KES ${amount.toLocaleString()} has been approved and is being processed.`,
    type: 'success' as const,
    category: 'withdrawal' as const,
  }),

  withdrawalCompleted: (amount: number) => ({
    title: 'Withdrawal Complete ✅',
    message: `KES ${amount.toLocaleString()} has been sent to your M-Pesa.`,
    type: 'success' as const,
    category: 'withdrawal' as const,
  }),

  withdrawalRejected: (amount: number, reason?: string) => ({
    title: 'Withdrawal Rejected ❌',
    message: `Your withdrawal request of KES ${amount.toLocaleString()} was rejected.${reason ? ` Reason: ${reason}` : ''}`,
    type: 'error' as const,
    category: 'withdrawal' as const,
  }),

  // ── Payments ──
  paymentReceived: (amount: number, chamaName: string) => ({
    title: 'Payment Received! 💳',
    message: `Your payment of KES ${amount.toLocaleString()} to "${chamaName}" was successful.`,
    type: 'success' as const,
    category: 'payment' as const,
  }),

  paymentConfirmed: (amount: number, mpesaRef: string) => ({
    title: 'Payment Confirmed! ✅',
    message: `KES ${amount.toLocaleString()} received. M-Pesa ref: ${mpesaRef}.`,
    type: 'success' as const,
    category: 'payment' as const,
  }),

  paymentFailed: (amount: number) => ({
    title: 'Payment Failed ❌',
    message: `Your payment of KES ${amount.toLocaleString()} was not completed. Please try again.`,
    type: 'error' as const,
    category: 'payment' as const,
  }),

  // ── Reminders ──
  paymentReminder: (amount: number, chamaName: string, dueTime: string) => ({
    title: 'Payment Reminder ⏰',
    message: `Reminder: Pay KES ${amount.toLocaleString()} to "${chamaName}" before ${dueTime} today.`,
    type: 'warning' as const,
    category: 'reminder' as const,
  }),

  latePaymentWarning: (amount: number, chamaName: string) => ({
    title: 'Late Payment Warning ⚠️',
    message: `You have a missed payment of KES ${amount.toLocaleString()} in "${chamaName}". Please pay immediately.`,
    type: 'warning' as const,
    category: 'reminder' as const,
  }),

  welfarePaymentDue: (amount: number, welfareName: string) => ({
    title: 'Welfare Contribution Due 🤝',
    message: `Your welfare contribution of KES ${amount.toLocaleString()} to "${welfareName}" is due today.`,
    type: 'warning' as const,
    category: 'welfare' as const,
  }),

  // ── Payouts ──
  payoutReceived: (amount: number, chamaName: string) => ({
    title: 'Payout Received! 🎉',
    message: `You received a payout of KES ${amount.toLocaleString()} from "${chamaName}". Check your M-Pesa!`,
    type: 'success' as const,
    category: 'payment' as const,
  }),

  payoutDay: (amount: number, chamaName: string) => ({
    title: "It's Your Payout Day! 🎉",
    message: `Today is your payout day for "${chamaName}". KES ${amount.toLocaleString()} is being sent to your M-Pesa.`,
    type: 'success' as const,
    category: 'payment' as const,
  }),

  // ── Campaigns / Donations ──
  donationReceived: (amount: number, campaignName: string, donorName: string) => ({
    title: 'New Donation Received! 💝',
    message: `${donorName} donated KES ${amount.toLocaleString()} to your campaign "${campaignName}".`,
    type: 'success' as const,
    category: 'campaign' as const,
  }),

  campaignWithdrawal: (campaignName: string, amount: number) => ({
    title: 'Campaign Withdrawal Notice 📢',
    message: `The campaign "${campaignName}" has withdrawn KES ${amount.toLocaleString()}. Contact support if suspicious.`,
    type: 'info' as const,
    category: 'campaign' as const,
  }),

  // ── Chama ──
  chamaJoinApproved: (chamaName: string) => ({
    title: 'Join Request Approved ✅',
    message: `You have been approved to join "${chamaName}". Welcome!`,
    type: 'success' as const,
    category: 'chama' as const,
  }),

  chamaJoinRejected: (chamaName: string) => ({
    title: 'Join Request Rejected',
    message: `Your request to join "${chamaName}" was not approved.`,
    type: 'error' as const,
    category: 'chama' as const,
  }),

  // ── Verification / KYC ──
  verificationRequested: (entityType: string, entityName: string) => ({
    title: 'Verification Request Submitted',
    message: `Your verification request for ${entityType} "${entityName}" has been submitted and is pending review.`,
    type: 'info' as const,
    category: 'verification' as const,
  }),

  verificationApproved: (entityType: string, entityName: string) => ({
    title: 'Verification Approved! ✓',
    message: `Congratulations! Your ${entityType} "${entityName}" has been verified.`,
    type: 'success' as const,
    category: 'verification' as const,
  }),

  verificationRejected: (entityType: string, entityName: string, reason?: string) => ({
    title: 'Verification Request Rejected',
    message: `Your verification request for ${entityType} "${entityName}" was not approved.${reason ? ` Reason: ${reason}` : ''}`,
    type: 'error' as const,
    category: 'verification' as const,
  }),

  kycApproved: () => ({
    title: 'KYC Approved! ✓',
    message: 'Your identity verification has been approved. You can now create Chamas, Campaigns, and Organizations.',
    type: 'success' as const,
    category: 'verification' as const,
  }),

  kycRejected: (reason?: string) => ({
    title: 'KYC Verification Rejected',
    message: `Your identity verification was not approved.${reason ? ` Reason: ${reason}` : ' Please resubmit with valid documents.'}`,
    type: 'error' as const,
    category: 'verification' as const,
  }),
};
        
