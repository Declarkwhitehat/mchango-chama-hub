import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getPaymentMethodLimit } from '@/utils/paymentLimits';
import { calculateBackoffDelay, canRetry, getRetryMessage, DEFAULT_RETRY_CONFIG } from '@/utils/retryHelpers';

interface PaymentMethod {
  id: string;
  method_type: string;
  phone_number?: string;
  bank_name?: string;
  account_number?: string;
  account_name?: string;
  is_default: boolean;
  is_verified: boolean;
}

interface GroupMember {
  id: string;
  user_id: string;
  unique_member_id: string;
  profiles: {
    full_name: string;
  };
}

interface SavingsDepositFormProps {
  groupId: string;
  memberId: string;
  groupName: string;
  onSuccess: () => void;
}

const COMMISSION_RATE = 0.01; // 1%
const MIN_AMOUNT = 100;
const MAX_AMOUNT = 1000000;

export function SavingsDepositForm({ groupId, memberId, groupName, onSuccess }: SavingsDepositFormProps) {
  const { toast } = useToast();
  const [amount, setAmount] = useState<string>('');
  const [commission, setCommission] = useState<number>(0);
  const [netAmount, setNetAmount] = useState<number>(0);
  const [saveFor, setSaveFor] = useState<'self' | 'other'>('self');
  const [selectedMemberId, setSelectedMemberId] = useState<string>('');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Calculate commission in real-time
  useEffect(() => {
    const amountNum = parseFloat(amount) || 0;
    const comm = amountNum * COMMISSION_RATE;
    const net = amountNum - comm;
    setCommission(comm);
    setNetAmount(net);
  }, [amount]);

  // Fetch payment methods
  useEffect(() => {
    const fetchPaymentMethods = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('payment-methods', {
          method: 'GET',
        });
        if (error) throw error;
        
        const verifiedMethods = (data.methods || []).filter((m: PaymentMethod) => m.is_verified);
        setPaymentMethods(verifiedMethods);
        
        // Set default payment method
        const defaultMethod = verifiedMethods.find((m: PaymentMethod) => m.is_default);
        setSelectedPaymentMethod(defaultMethod || verifiedMethods[0] || null);
      } catch (error: any) {
        console.error('Error fetching payment methods:', error);
        toast({
          title: 'Error',
          description: 'Failed to load payment methods',
          variant: 'destructive',
        });
      }
    };

    fetchPaymentMethods();
  }, [toast]);

  // Fetch group members if saving for another
  useEffect(() => {
    if (saveFor === 'other') {
      const fetchMembers = async () => {
        try {
          setLoading(true);
          const { data: membersData, error } = await supabase
            .from('saving_group_members')
            .select('id, user_id, unique_member_id')
            .eq('group_id', groupId)
            .eq('status', 'active')
            .eq('is_approved', true)
            .neq('id', memberId);

          if (error) throw error;

          // Fetch profiles separately
          if (membersData && membersData.length > 0) {
            const userIds = membersData.map(m => m.user_id);
            const { data: profilesData } = await supabase
              .from('profiles')
              .select('id, full_name')
              .in('id', userIds);

            const profilesMap = new Map(profilesData?.map(p => [p.id, p]) || []);
            
            const enrichedMembers = membersData.map(member => ({
              ...member,
              profiles: {
                full_name: profilesMap.get(member.user_id)?.full_name || 'Unknown'
              }
            }));

            setGroupMembers(enrichedMembers);
          } else {
            setGroupMembers([]);
          }
        } catch (error: any) {
          console.error('Error fetching members:', error);
          toast({
            title: 'Error',
            description: 'Failed to load group members',
            variant: 'destructive',
          });
        } finally {
          setLoading(false);
        }
      };

      fetchMembers();
    }
  }, [saveFor, groupId, memberId, toast]);

  const validateAmount = (): string | null => {
    const amountNum = parseFloat(amount);
    
    if (!amount || isNaN(amountNum)) {
      return 'Please enter a valid amount';
    }
    
    if (amountNum < MIN_AMOUNT) {
      return `Minimum deposit is KES ${MIN_AMOUNT.toLocaleString()}`;
    }
    
    if (amountNum > MAX_AMOUNT) {
      return `Maximum deposit is KES ${MAX_AMOUNT.toLocaleString()}`;
    }

    if (!selectedPaymentMethod) {
      return 'Please select a payment method';
    }

    const limit = getPaymentMethodLimit(selectedPaymentMethod.method_type as any);
    if (amountNum > limit) {
      return `Amount exceeds ${selectedPaymentMethod.method_type} daily limit of KES ${limit.toLocaleString()}`;
    }

    if (saveFor === 'other' && !selectedMemberId) {
      return 'Please select a member to save for';
    }

    return null;
  };

  const handleSubmit = async (isRetry: boolean = false, existingDepositId?: string) => {
    const validationError = validateAmount();
    if (validationError) {
      toast({
        title: 'Validation Error',
        description: validationError,
        variant: 'destructive',
      });
      return;
    }

    try {
      setProcessing(true);
      const amountNum = parseFloat(amount);
      
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) throw new Error('Not authenticated');

      // Get beneficiary user_id
      const beneficiaryUserId = saveFor === 'self' 
        ? session.session.user.id 
        : groupMembers.find(m => m.id === selectedMemberId)?.user_id;

      let depositId = existingDepositId;
      let checkoutRequestId: string;
      let currentRetryCount = 0;

      // If this is a retry, get the current retry count
      if (isRetry && existingDepositId) {
        const { data: existingDeposit } = await supabase
          .from('saving_group_deposits')
          .select('retry_count, max_retries')
          .eq('id', existingDepositId)
          .single();

        if (existingDeposit) {
          currentRetryCount = existingDeposit.retry_count || 0;
          
          // Check if max retries exceeded
          if (!canRetry(currentRetryCount, existingDeposit.max_retries)) {
            toast({
              title: 'Maximum Retries Exceeded',
              description: `This payment has already been retried ${currentRetryCount} times. Please contact support if you need assistance.`,
              variant: 'destructive',
            });
            return;
          }

          // Show retry notification with backoff message
          const delay = calculateBackoffDelay(currentRetryCount);
          toast({
            title: 'Retrying Payment',
            description: getRetryMessage(currentRetryCount, existingDeposit.max_retries),
          });

          // Wait for exponential backoff
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      // Step 1: Trigger M-Pesa STK Push (this now creates the pending deposit record)
      toast({
        title: isRetry ? 'Retrying Payment' : 'Payment Initiated',
        description: 'Please check your phone and enter your M-Pesa PIN',
      });

      const { data: stkData, error: stkError } = await supabase.functions.invoke('mpesa-stk-push', {
        body: {
          phone_number: selectedPaymentMethod?.phone_number,
          amount: amountNum,
          account_reference: `SAV-${groupId.substring(0, 8)}`,
          transaction_desc: `Savings deposit to ${groupName}`,
          callback_metadata: {
            type: 'savings_deposit',
            group_id: groupId,
            beneficiary_user_id: beneficiaryUserId,
            payer_user_id: session.session.user.id,
            saved_for_member_id: saveFor === 'other' ? selectedMemberId : null,
            is_retry: isRetry,
            existing_deposit_id: existingDepositId,
            retry_count: currentRetryCount + (isRetry ? 1 : 0),
          }
        }
      });

      if (stkError) throw stkError;

      depositId = stkData.deposit_id;
      checkoutRequestId = stkData.CheckoutRequestID;

      // Step 2: Show processing message
      toast({
        title: 'Processing Payment',
        description: 'Waiting for M-Pesa confirmation...',
        duration: 5000,
      });

      // Step 3: Poll for payment status (check every 3 seconds for up to 60 seconds)
      let attempts = 0;
      const maxAttempts = 20;
      
      const checkStatus = async (): Promise<boolean> => {
        const { data: depositStatus } = await supabase
          .from('saving_group_deposits')
          .select('status, mpesa_receipt_number, retry_count, max_retries')
          .eq('id', depositId!)
          .single();

        if (depositStatus?.status === 'completed') {
          toast({
            title: 'Deposit Successful!',
            description: (
              <div className="space-y-1">
                <p>Paid: KES {amountNum.toFixed(2)}</p>
                <p>Commission: KES {commission.toFixed(2)} (1%)</p>
                <p>Credited: KES {netAmount.toFixed(2)}</p>
                {isRetry && <p className="text-green-600">✓ Retry successful!</p>}
              </div>
            ),
          });
          setAmount('');
          setSaveFor('self');
          setSelectedMemberId('');
          onSuccess();
          return true;
        }

        if (depositStatus?.status === 'failed') {
          const canRetryAgain = canRetry(
            depositStatus.retry_count || 0,
            depositStatus.max_retries || DEFAULT_RETRY_CONFIG.maxRetries
          );

          toast({
            title: 'Payment Failed',
            description: canRetryAgain
              ? `M-Pesa payment was not completed. You can retry this payment (${depositStatus.retry_count || 0}/${depositStatus.max_retries} attempts used).`
              : 'Maximum retry attempts reached. Please contact support.',
            variant: 'destructive',
          });
          return true;
        }

        // Still pending
        attempts++;
        if (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 3000));
          return checkStatus();
        } else {
          // Timeout
          toast({
            title: 'Payment Timeout',
            description: 'Payment is taking longer than expected. Check your transaction history or retry the payment.',
            variant: 'destructive',
          });
          return true;
        }
      };

      await checkStatus();

    } catch (error: any) {
      console.error('Deposit error:', error);
      toast({
        title: isRetry ? 'Retry Failed' : 'Deposit Failed',
        description: error.message || 'Failed to process deposit',
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };

  if (!selectedPaymentMethod && paymentMethods.length === 0) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          You need to add and verify a payment method before making deposits.
          Please go to your profile to add a payment method.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Amount Input */}
      <div className="space-y-2">
        <Label htmlFor="amount">Deposit Amount (KES)</Label>
        <Input
          id="amount"
          type="number"
          placeholder="Enter amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          min={MIN_AMOUNT}
          max={MAX_AMOUNT}
          disabled={processing}
        />
        <p className="text-sm text-muted-foreground">
          Min: KES {MIN_AMOUNT.toLocaleString()} | Max: KES {MAX_AMOUNT.toLocaleString()}
        </p>
      </div>

      {/* Commission Breakdown */}
      {amount && parseFloat(amount) > 0 && (
        <Card className="bg-muted/50">
          <CardContent className="pt-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Deposit Amount:</span>
                <span className="font-medium">KES {parseFloat(amount).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Commission (1%):</span>
                <span>KES {commission.toFixed(2)}</span>
              </div>
              <div className="border-t pt-2 flex justify-between font-semibold">
                <span>Net Credited:</span>
                <span className="text-primary">KES {netAmount.toFixed(2)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Save For Options */}
      <div className="space-y-3">
        <Label>Save For</Label>
        <RadioGroup value={saveFor} onValueChange={(value: any) => setSaveFor(value)}>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="self" id="self" />
            <Label htmlFor="self" className="font-normal cursor-pointer">
              Save for myself
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="other" id="other" />
            <Label htmlFor="other" className="font-normal cursor-pointer">
              Save for another member
            </Label>
          </div>
        </RadioGroup>
      </div>

      {/* Member Selection */}
      {saveFor === 'other' && (
        <div className="space-y-2">
          <Label>Select Member</Label>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading members...
            </div>
          ) : (
            <Select value={selectedMemberId} onValueChange={setSelectedMemberId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a member" />
              </SelectTrigger>
              <SelectContent>
                {groupMembers.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.profiles.full_name} ({member.unique_member_id})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      {/* Payment Method Selection */}
      <div className="space-y-2">
        <Label>Payment Method</Label>
        <Select
          value={selectedPaymentMethod?.id || ''}
          onValueChange={(id) => {
            const method = paymentMethods.find((m) => m.id === id);
            setSelectedPaymentMethod(method || null);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select payment method" />
          </SelectTrigger>
          <SelectContent>
            {paymentMethods.map((method) => (
              <SelectItem key={method.id} value={method.id}>
                {method.method_type === 'mpesa' && `M-Pesa: ${method.phone_number}`}
                {method.method_type === 'airtel_money' && `Airtel Money: ${method.phone_number}`}
                {method.method_type === 'bank_account' && 
                  `${method.bank_name}: ${method.account_number}`}
                {method.is_default && ' (Default)'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedPaymentMethod && (
          <p className="text-sm text-muted-foreground">
            Daily limit: KES {getPaymentMethodLimit(selectedPaymentMethod.method_type as any).toLocaleString()}
          </p>
        )}
      </div>

      {/* Commission Info */}
      <Alert>
        <CheckCircle2 className="h-4 w-4" />
        <AlertDescription>
          You will pay KES {parseFloat(amount || '0').toLocaleString()}. 
          After 1% commission (KES {commission.toFixed(2)}), 
          KES {netAmount.toFixed(2)} will be added to savings.
        </AlertDescription>
      </Alert>

      {/* Submit Button */}
      <Button
        onClick={() => handleSubmit(false)}
        disabled={processing || !amount || parseFloat(amount) < MIN_AMOUNT}
        className="w-full"
        size="lg"
      >
        {processing ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Processing Payment...
          </>
        ) : (
          `Pay KES ${parseFloat(amount || '0').toLocaleString()}`
        )}
      </Button>
    </div>
  );
}
