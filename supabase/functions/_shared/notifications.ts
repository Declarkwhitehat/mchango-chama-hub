import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

interface CreateNotificationParams {
  userId: string;
  title: string;
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  category: 'verification' | 'withdrawal' | 'payment' | 'reminder' | 'chama' | 'campaign' | 'organization';
  relatedEntityId?: string;
  relatedEntityType?: string;
}

export async function createNotification(
  adminClient: SupabaseClient,
  params: CreateNotificationParams
) {
  try {
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
  } catch (err) {
    console.error('Failed to create notification:', err);
  }
}

// Common notification templates
export const NotificationTemplates = {
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
    title: 'Withdrawal Complete',
    message: `KES ${amount.toLocaleString()} has been sent to your payment method.`,
    type: 'success' as const,
    category: 'withdrawal' as const,
  }),

  withdrawalRejected: (amount: number, reason?: string) => ({
    title: 'Withdrawal Rejected',
    message: `Your withdrawal request of KES ${amount.toLocaleString()} was rejected.${reason ? ` Reason: ${reason}` : ''}`,
    type: 'error' as const,
    category: 'withdrawal' as const,
  }),

  paymentReceived: (amount: number, chamaName: string) => ({
    title: 'Payment Received! 💳',
    message: `Your payment of KES ${amount.toLocaleString()} to "${chamaName}" was successful.`,
    type: 'success' as const,
    category: 'payment' as const,
  }),

  paymentReminder: (amount: number, chamaName: string, dueTime: string) => ({
    title: 'Payment Reminder ⏰',
    message: `Reminder: Pay KES ${amount.toLocaleString()} to "${chamaName}" before ${dueTime} today.`,
    type: 'warning' as const,
    category: 'reminder' as const,
  }),

  payoutReceived: (amount: number, chamaName: string) => ({
    title: 'Payout Received! 🎉',
    message: `You received a payout of KES ${amount.toLocaleString()} from "${chamaName}".`,
    type: 'success' as const,
    category: 'payment' as const,
  }),

  chamaJoinApproved: (chamaName: string) => ({
    title: 'Join Request Approved',
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

  campaignWithdrawal: (campaignName: string, amount: number) => ({
    title: 'Campaign Withdrawal Notice 📢',
    message: `The campaign "${campaignName}" has withdrawn KES ${amount.toLocaleString()}. If you find this suspicious, please contact customer care.`,
    type: 'info' as const,
    category: 'campaign' as const,
  }),
};