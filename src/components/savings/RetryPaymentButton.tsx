import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { RefreshCw, Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { canRetry, calculateBackoffDelay, getRetryMessage, DEFAULT_RETRY_CONFIG } from '@/utils/retryHelpers';

interface RetryPaymentButtonProps {
  depositId: string;
  amount: number;
  retryCount: number;
  maxRetries: number;
  phoneNumber: string;
  groupId: string;
  groupName: string;
  onSuccess: () => void;
}

export function RetryPaymentButton({
  depositId,
  amount,
  retryCount,
  maxRetries,
  phoneNumber,
  groupId,
  groupName,
  onSuccess,
}: RetryPaymentButtonProps) {
  const { toast } = useToast();
  const [processing, setProcessing] = useState(false);

  const canRetryPayment = canRetry(retryCount, maxRetries);

  const handleRetry = async () => {
    if (!canRetryPayment) {
      toast({
        title: 'Maximum Retries Exceeded',
        description: `This payment has already been retried ${retryCount} times.`,
        variant: 'destructive',
      });
      return;
    }

    try {
      setProcessing(true);

      // Show backoff message
      const delay = calculateBackoffDelay(retryCount);
      toast({
        title: 'Retrying Payment',
        description: getRetryMessage(retryCount, maxRetries),
      });

      // Wait for backoff delay
      await new Promise(resolve => setTimeout(resolve, delay));

      // Get deposit details
      const { data: deposit } = await supabase
        .from('saving_group_deposits')
        .select('*')
        .eq('id', depositId)
        .single();

      if (!deposit) throw new Error('Deposit not found');

      // Trigger new STK Push
      toast({
        title: 'Payment Initiated',
        description: 'Please check your phone and enter your M-Pesa PIN',
      });

      const { data: stkData, error: stkError } = await supabase.functions.invoke('mpesa-stk-push', {
        body: {
          phone_number: phoneNumber,
          amount: amount,
          account_reference: `SAV-${groupId.substring(0, 8)}`,
          transaction_desc: `Retry: Savings deposit to ${groupName}`,
          callback_metadata: {
            type: 'savings_deposit',
            group_id: groupId,
            beneficiary_user_id: deposit.member_user_id,
            payer_user_id: deposit.payer_user_id,
            saved_for_member_id: deposit.saved_for_member_id,
            is_retry: true,
            existing_deposit_id: depositId,
            retry_count: retryCount + 1,
          }
        }
      });

      if (stkError) throw stkError;

      // Update deposit with new checkout request ID and retry count
      await supabase
        .from('saving_group_deposits')
        .update({
          payment_reference: stkData.CheckoutRequestID,
          retry_count: retryCount + 1,
          last_retry_at: new Date().toISOString(),
          status: 'pending',
        })
        .eq('id', depositId);

      toast({
        title: 'Processing Payment',
        description: 'Waiting for M-Pesa confirmation...',
        duration: 5000,
      });

      // Poll for status
      let attempts = 0;
      const maxAttempts = 20;

      const checkStatus = async (): Promise<void> => {
        const { data: depositStatus } = await supabase
          .from('saving_group_deposits')
          .select('status, mpesa_receipt_number')
          .eq('id', depositId)
          .single();

        if (depositStatus?.status === 'completed') {
          toast({
            title: 'Retry Successful!',
            description: `Payment completed successfully. KES ${amount.toLocaleString()} has been credited to your savings.`,
          });
          onSuccess();
          return;
        }

        if (depositStatus?.status === 'failed') {
          toast({
            title: 'Retry Failed',
            description: canRetry(retryCount + 1, maxRetries)
              ? `Payment failed. You have ${maxRetries - retryCount - 1} retry attempts remaining.`
              : 'Maximum retry attempts reached. Please contact support.',
            variant: 'destructive',
          });
          onSuccess(); // Refresh to show updated status
          return;
        }

        // Still pending
        attempts++;
        if (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 3000));
          return checkStatus();
        } else {
          toast({
            title: 'Payment Timeout',
            description: 'Payment is taking longer than expected. Check your transaction history.',
            variant: 'destructive',
          });
          onSuccess();
        }
      };

      await checkStatus();

    } catch (error: any) {
      console.error('Retry error:', error);
      toast({
        title: 'Retry Failed',
        description: error.message || 'Failed to retry payment',
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };

  if (!canRetryPayment) {
    return (
      <Button size="sm" variant="outline" disabled>
        Max Retries Reached
      </Button>
    );
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={processing}>
          {processing ? (
            <>
              <Loader2 className="mr-2 h-3 w-3 animate-spin" />
              Retrying...
            </>
          ) : (
            <>
              <RefreshCw className="mr-2 h-3 w-3" />
              Retry ({retryCount}/{maxRetries})
            </>
          )}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Retry Payment?</AlertDialogTitle>
          <AlertDialogDescription>
            This will retry the failed M-Pesa payment for KES {amount.toLocaleString()}.
            <br /><br />
            You have used {retryCount} of {maxRetries} retry attempts.
            <br /><br />
            Please ensure you have sufficient balance and your phone is ready to receive the M-Pesa prompt.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleRetry}>
            Retry Payment
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
