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

// ─── Formatting helpers ───────────────────────────────────────────────────────
const fmtKES = (n: number | null | undefined) =>
  `KES ${Number(n || 0).toLocaleString('en-KE')}`;

const maskPhone = (phone?: string | null) => {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length < 6) return digits;
  return `${digits.slice(0, 4)}***${digits.slice(-3)}`;
};

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

    // 2. Push notification is sent automatically by the DB trigger
    //    `notifications_push_after_insert` → `notify_push_on_notification_insert()`.
    //    Do NOT also call sendPushNotification here or users get duplicate banners.

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

// ─── Admin fan-out ────────────────────────────────────────────────────────────
let _adminCache: { ids: string[]; at: number } | null = null;
const ADMIN_CACHE_MS = 60_000;

async function getAdminUserIds(adminClient: AnySupabaseClient): Promise<string[]> {
  const now = Date.now();
  if (_adminCache && now - _adminCache.at < ADMIN_CACHE_MS) return _adminCache.ids;
  try {
    const { data } = await adminClient
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin');
    const ids = Array.from(new Set((data || []).map((r: any) => r.user_id).filter(Boolean)));
    _adminCache = { ids, at: now };
    return ids;
  } catch (err) {
    console.warn('[notifyAllAdmins] failed to fetch admins:', err);
    return [];
  }
}

export async function notifyAllAdmins(
  adminClient: AnySupabaseClient,
  notification: Omit<CreateNotificationParams, 'userId'>,
) {
  const ids = await getAdminUserIds(adminClient);
  if (ids.length === 0) return;
  await notifyManyUsers(adminClient, ids, notification);
}

// ─── Notification Templates (short, professional, no emoji) ───────────────────
// Style: Title <= 40 chars, message <= 160 chars (single SMS segment).
// Format: <Action>. <amount/entity>. <key fact>.

export const NotificationTemplates = {
  // ── Withdrawals ──
  withdrawalRequested: (amount: number, entityName: string) => ({
    title: 'Withdrawal submitted',
    message: `${fmtKES(amount)} from "${entityName}" is being processed.`,
    type: 'info' as const,
    category: 'withdrawal' as const,
  }),

  withdrawalApproved: (amount: number) => ({
    title: 'Withdrawal approved',
    message: `${fmtKES(amount)} approved. Sending to your M-Pesa now.`,
    type: 'success' as const,
    category: 'withdrawal' as const,
  }),

  withdrawalCompleted: (amount: number) => ({
    title: 'Withdrawal sent',
    message: `${fmtKES(amount)} delivered to your M-Pesa.`,
    type: 'success' as const,
    category: 'withdrawal' as const,
  }),

  withdrawalCompletedDetailed: (amount: number, phone: string | null | undefined, mpesaRef?: string | null) => ({
    title: 'Withdrawal sent',
    message: `${fmtKES(amount)} sent to ${maskPhone(phone) || 'your M-Pesa'}.${mpesaRef ? ` Ref ${mpesaRef}.` : ''}`,
    type: 'success' as const,
    category: 'withdrawal' as const,
  }),

  withdrawalRejected: (amount: number, reason?: string) => ({
    title: 'Withdrawal rejected',
    message: `${fmtKES(amount)} request rejected.${reason ? ` Reason: ${reason}.` : ''}`,
    type: 'error' as const,
    category: 'withdrawal' as const,
  }),

  withdrawalFailed: (amount: number, reason?: string) => ({
    title: 'Withdrawal failed',
    message: `${fmtKES(amount)} did not go through.${reason ? ` Reason: ${reason}.` : ''} Contact support.`,
    type: 'error' as const,
    category: 'withdrawal' as const,
  }),

  // ── Payments ──
  paymentReceived: (amount: number, chamaName: string) => ({
    title: 'Payment successful',
    message: `${fmtKES(amount)} paid to "${chamaName}".`,
    type: 'success' as const,
    category: 'payment' as const,
  }),

  paymentConfirmed: (amount: number, mpesaRef: string) => ({
    title: 'Payment confirmed',
    message: `${fmtKES(amount)} received. M-Pesa ref ${mpesaRef}.`,
    type: 'success' as const,
    category: 'payment' as const,
  }),

  paymentFailed: (amount: number) => ({
    title: 'Payment failed',
    message: `${fmtKES(amount)} did not complete. Try again.`,
    type: 'error' as const,
    category: 'payment' as const,
  }),

  // ── Reminders ──
  paymentReminder: (amount: number, chamaName: string, dueTime: string) => ({
    title: 'Payment due',
    message: `Pay ${fmtKES(amount)} to "${chamaName}" before ${dueTime} today.`,
    type: 'warning' as const,
    category: 'reminder' as const,
  }),

  latePaymentWarning: (amount: number, chamaName: string) => ({
    title: 'Missed payment',
    message: `${fmtKES(amount)} overdue in "${chamaName}". Pay now to avoid removal.`,
    type: 'warning' as const,
    category: 'reminder' as const,
  }),

  welfarePaymentDue: (amount: number, welfareName: string) => ({
    title: 'Welfare contribution due',
    message: `${fmtKES(amount)} due to "${welfareName}" today.`,
    type: 'warning' as const,
    category: 'welfare' as const,
  }),

  // ── Payouts ──
  payoutReceived: (amount: number, chamaName: string) => ({
    title: 'Payout received',
    message: `${fmtKES(amount)} from "${chamaName}" sent to your M-Pesa.`,
    type: 'success' as const,
    category: 'payment' as const,
  }),

  payoutDay: (amount: number, chamaName: string) => ({
    title: 'Your payout day',
    message: `${fmtKES(amount)} from "${chamaName}" is being sent to your M-Pesa.`,
    type: 'success' as const,
    category: 'payment' as const,
  }),

  // ── Campaigns / Donations ──
  donationReceived: (amount: number, campaignName: string, donorName: string) => ({
    title: 'New donation',
    message: `${donorName} donated ${fmtKES(amount)} to "${campaignName}".`,
    type: 'success' as const,
    category: 'campaign' as const,
  }),

  donationSent: (amount: number, campaignName: string, mpesaRef?: string | null) => ({
    title: 'Donation sent',
    message: `${fmtKES(amount)} donated to "${campaignName}".${mpesaRef ? ` Ref ${mpesaRef}.` : ''} Thank you.`,
    type: 'success' as const,
    category: 'campaign' as const,
  }),

  campaignWithdrawal: (campaignName: string, amount: number) => ({
    title: 'Campaign withdrawal',
    message: `"${campaignName}" withdrew ${fmtKES(amount)}. Contact support if suspicious.`,
    type: 'info' as const,
    category: 'campaign' as const,
  }),

  // ── Entity creation ──
  chamaCreated: (name: string, code?: string | null) => ({
    title: 'Chama created',
    message: `"${name}" is live.${code ? ` Code ${code}. Share to invite members.` : ' Share the invite link to add members.'}`,
    type: 'success' as const,
    category: 'chama' as const,
  }),

  welfareCreated: (name: string, code?: string | null) => ({
    title: 'Welfare created',
    message: `"${name}" is live.${code ? ` Code ${code}. Share to invite members.` : ' Share the invite link to add members.'}`,
    type: 'success' as const,
    category: 'welfare' as const,
  }),

  campaignCreated: (name: string, target?: number | null) => ({
    title: 'Campaign created',
    message: `"${name}" is live${target ? `. Target ${fmtKES(target)}` : ''}. Share the link to start receiving donations.`,
    type: 'success' as const,
    category: 'campaign' as const,
  }),

  organizationCreated: (name: string) => ({
    title: 'Organization created',
    message: `"${name}" is live. Share the link to start receiving donations.`,
    type: 'success' as const,
    category: 'organization' as const,
  }),

  // ── Chama membership ──
  chamaJoinApproved: (chamaName: string) => ({
    title: 'Join request approved',
    message: `You have been approved to join "${chamaName}".`,
    type: 'success' as const,
    category: 'chama' as const,
  }),

  chamaJoinRejected: (chamaName: string) => ({
    title: 'Join request rejected',
    message: `Your request to join "${chamaName}" was not approved.`,
    type: 'error' as const,
    category: 'chama' as const,
  }),

  // ── Verification / KYC ──
  verificationRequested: (entityType: string, entityName: string) => ({
    title: 'Verification submitted',
    message: `Verification for ${entityType} "${entityName}" submitted. Review within 24h.`,
    type: 'info' as const,
    category: 'verification' as const,
  }),

  verificationApproved: (entityType: string, entityName: string) => ({
    title: 'Verification approved',
    message: `${entityType} "${entityName}" is now verified.`,
    type: 'success' as const,
    category: 'verification' as const,
  }),

  verificationRejected: (entityType: string, entityName: string, reason?: string) => ({
    title: 'Verification rejected',
    message: `${entityType} "${entityName}" was not verified.${reason ? ` Reason: ${reason}.` : ''}`,
    type: 'error' as const,
    category: 'verification' as const,
  }),

  kycApproved: () => ({
    title: 'Identity verified',
    message: 'Your identity is verified. You can now create Chamas, Campaigns, and Organizations.',
    type: 'success' as const,
    category: 'verification' as const,
  }),

  kycRejected: (reason?: string) => ({
    title: 'Identity not verified',
    message: `Your identity verification was not approved.${reason ? ` Reason: ${reason}.` : ' Please resubmit valid documents.'}`,
    type: 'error' as const,
    category: 'verification' as const,
  }),

  // ── Admin-only alerts ──
  adminPayoutFailed: (amount: number, recipient: string | null | undefined, reason: string) => ({
    title: 'Admin: payout failed',
    message: `B2C ${fmtKES(amount)} to ${maskPhone(recipient) || 'recipient'} failed. Reason: ${reason}.`,
    type: 'error' as const,
    category: 'withdrawal' as const,
  }),

  adminLargeWithdrawal: (amount: number, entityName: string, requester: string) => ({
    title: 'Admin: large withdrawal',
    message: `${fmtKES(amount)} requested from "${entityName}" by ${requester}. Review.`,
    type: 'warning' as const,
    category: 'withdrawal' as const,
  }),

  adminVerificationPending: (entityType: string, entityName: string, requestedBy: string) => ({
    title: 'Admin: verification pending',
    message: `${entityType} "${entityName}" submitted by ${requestedBy}. Review.`,
    type: 'info' as const,
    category: 'verification' as const,
  }),
};

