import { supabase } from "@/integrations/supabase/client";

interface CreateNotificationParams {
  userId: string;
  title: string;
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  category: 'verification' | 'withdrawal' | 'payment' | 'reminder' | 'chama' | 'campaign' | 'organization';
  relatedEntityId?: string;
  relatedEntityType?: string;
}

// This function should be called from edge functions or service role context
// since the INSERT policy requires service role
export async function createNotification(params: CreateNotificationParams) {
  const { data, error } = await supabase
    .from('notifications')
    .insert({
      user_id: params.userId,
      title: params.title,
      message: params.message,
      type: params.type || 'info',
      category: params.category,
      related_entity_id: params.relatedEntityId,
      related_entity_type: params.relatedEntityType,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating notification:', error);
    return null;
  }

  return data;
}

// Helper to create common notification types
export const NotificationHelpers = {
  verificationRequested: (userId: string, entityType: string, entityName: string) => ({
    userId,
    title: 'Verification Request Submitted',
    message: `Your verification request for ${entityType} "${entityName}" has been submitted and is pending review.`,
    type: 'info' as const,
    category: 'verification' as const,
  }),

  verificationApproved: (userId: string, entityType: string, entityName: string) => ({
    userId,
    title: 'Verification Approved! ✓',
    message: `Congratulations! Your ${entityType} "${entityName}" has been verified.`,
    type: 'success' as const,
    category: 'verification' as const,
  }),

  verificationRejected: (userId: string, entityType: string, entityName: string, reason?: string) => ({
    userId,
    title: 'Verification Request Rejected',
    message: `Your verification request for ${entityType} "${entityName}" was not approved.${reason ? ` Reason: ${reason}` : ''}`,
    type: 'error' as const,
    category: 'verification' as const,
  }),

  withdrawalRequested: (userId: string, amount: number, entityName: string) => ({
    userId,
    title: 'Withdrawal Request Submitted',
    message: `Your withdrawal request of KES ${amount.toLocaleString()} from "${entityName}" is being processed.`,
    type: 'info' as const,
    category: 'withdrawal' as const,
  }),

  withdrawalApproved: (userId: string, amount: number) => ({
    userId,
    title: 'Withdrawal Approved! 💰',
    message: `Your withdrawal of KES ${amount.toLocaleString()} has been approved and is being processed.`,
    type: 'success' as const,
    category: 'withdrawal' as const,
  }),

  withdrawalCompleted: (userId: string, amount: number) => ({
    userId,
    title: 'Withdrawal Complete',
    message: `KES ${amount.toLocaleString()} has been sent to your payment method.`,
    type: 'success' as const,
    category: 'withdrawal' as const,
  }),

  withdrawalRejected: (userId: string, amount: number, reason?: string) => ({
    userId,
    title: 'Withdrawal Rejected',
    message: `Your withdrawal request of KES ${amount.toLocaleString()} was rejected.${reason ? ` Reason: ${reason}` : ''}`,
    type: 'error' as const,
    category: 'withdrawal' as const,
  }),

  paymentReceived: (userId: string, amount: number, chamaName: string) => ({
    userId,
    title: 'Payment Received! 💳',
    message: `Your payment of KES ${amount.toLocaleString()} to "${chamaName}" was successful.`,
    type: 'success' as const,
    category: 'payment' as const,
  }),

  paymentReminder: (userId: string, amount: number, chamaName: string, dueTime: string) => ({
    userId,
    title: 'Payment Reminder ⏰',
    message: `Reminder: Pay KES ${amount.toLocaleString()} to "${chamaName}" before ${dueTime} today.`,
    type: 'warning' as const,
    category: 'reminder' as const,
  }),

  payoutReceived: (userId: string, amount: number, chamaName: string) => ({
    userId,
    title: 'Payout Received! 🎉',
    message: `You received a payout of KES ${amount.toLocaleString()} from "${chamaName}".`,
    type: 'success' as const,
    category: 'payment' as const,
  }),

  chamaJoinApproved: (userId: string, chamaName: string) => ({
    userId,
    title: 'Join Request Approved',
    message: `You have been approved to join "${chamaName}". Welcome!`,
    type: 'success' as const,
    category: 'chama' as const,
  }),

  chamaJoinRejected: (userId: string, chamaName: string) => ({
    userId,
    title: 'Join Request Rejected',
    message: `Your request to join "${chamaName}" was not approved.`,
    type: 'error' as const,
    category: 'chama' as const,
  }),

  kycApproved: (userId: string) => ({
    userId,
    title: 'KYC Approved! ✓',
    message: 'Your identity verification has been approved. You can now create Chamas, Campaigns, and Organizations.',
    type: 'success' as const,
    category: 'verification' as const,
  }),

  kycRejected: (userId: string, reason?: string) => ({
    userId,
    title: 'KYC Verification Rejected',
    message: `Your identity verification was not approved.${reason ? ` Reason: ${reason}` : ' Please resubmit with valid documents.'}`,
    type: 'error' as const,
    category: 'verification' as const,
  }),
};