import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // NOTE: verify_jwt is disabled at the gateway level; we validate the JWT here.
    const authHeader = req.headers.get('Authorization') ?? req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '').trim();

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    // Client scoped to the end-user (RLS will apply)
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: `Bearer ${token}` },
      },
    });

    // Admin client used only to verify the JWT reliably
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    const user = userData?.user;
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(req.url);

    // POST / - Create withdrawal request
    if (req.method === 'POST') {
      const body = await req.json();
      
      // Validate input with Zod
      const withdrawalSchema = z.object({
        chama_id: z.string().uuid().optional(),
        mchango_id: z.string().uuid().optional(),
        amount: z.number()
          .positive('Amount must be positive')
          .min(10, 'Minimum withdrawal is KES 10')
          .max(10000000, 'Maximum withdrawal is KES 10M')
          .multipleOf(0.01, 'Amount must have max 2 decimal places'),
        notes: z.string()
          .max(500, 'Notes must be under 500 characters')
          .optional()
      }).refine(
        data => data.chama_id || data.mchango_id,
        'Either chama_id or mchango_id required'
      );
      
      try {
        withdrawalSchema.parse(body);
      } catch (validationError: any) {
        return new Response(JSON.stringify({ 
          error: 'Invalid request data',
          details: validationError.errors
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      const { chama_id, mchango_id, amount, notes } = body;

      console.log('Creating withdrawal request:', body);
      
      // Verify KYC status
      const { data: profile } = await supabaseClient
        .from('profiles')
        .select('kyc_status')
        .eq('id', user.id)
        .single();

      if (!profile || profile.kyc_status !== 'approved') {
        return new Response(JSON.stringify({ 
          error: 'KYC verification required',
          kyc_status: profile?.kyc_status || 'unknown'
        }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Fetch user's default payment method
      const { data: defaultPaymentMethod, error: pmError } = await supabaseClient
        .from('payment_methods')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_default', true)
        .maybeSingle();

      if (!defaultPaymentMethod) {
        return new Response(JSON.stringify({ 
          error: 'No payment method configured',
          message: 'Please add a default payment method in your profile settings'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Payment method transaction limits
      const TRANSACTION_LIMITS: Record<string, number> = {
        'mpesa': 150000,
        'airtel_money': 150000,
        'bank_account': 500000
      };

      const dailyLimit = TRANSACTION_LIMITS[defaultPaymentMethod.method_type];

      // Commission is already deducted at payment time, so withdrawal is full amount
      // No commission deduction needed here - user receives full withdrawal amount
      const commissionAmount = 0;
      const netAmount = amount;

      // Check if net withdrawal amount exceeds single transaction limit
      if (netAmount > dailyLimit) {
        return new Response(JSON.stringify({ 
          error: 'Transaction limit exceeded',
          message: `${defaultPaymentMethod.method_type.replace('_', ' ').toUpperCase()} has a maximum transaction limit of KES ${dailyLimit.toLocaleString()}. Your withdrawal of KES ${netAmount.toLocaleString()} (after commission) exceeds this limit.`,
          limit: dailyLimit,
          requested: netAmount,
          payment_method_type: defaultPaymentMethod.method_type
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check daily cumulative limit (including pending + completed today)
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const { data: dailyTotals } = await supabaseClient
        .from('withdrawals')
        .select('net_amount')
        .eq('payment_method_id', defaultPaymentMethod.id)
        .in('status', ['pending', 'completed'])
        .gte('requested_at', todayStart.toISOString());

      const todayTotal = dailyTotals?.reduce((sum, w) => sum + Number(w.net_amount), 0) || 0;
      const projectedTotal = todayTotal + netAmount;

      if (projectedTotal > dailyLimit) {
        return new Response(JSON.stringify({ 
          error: 'Daily limit exceeded',
          message: `You have already withdrawn KES ${todayTotal.toLocaleString()} today. Adding KES ${netAmount.toLocaleString()} would exceed your daily limit of KES ${dailyLimit.toLocaleString()} for ${defaultPaymentMethod.method_type.replace('_', ' ').toUpperCase()}.`,
          daily_limit: dailyLimit,
          used_today: todayTotal,
          available: dailyLimit - todayTotal,
          payment_method_type: defaultPaymentMethod.method_type
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Verify creator ownership
      let isCreator = false;
      let isManager = false;
      let totalAvailable = 0;
      let membershipData: any = null;
      let hasPaymentIssues = false;

      if (chama_id) {
        const { data: chama, error: chamaError } = await supabaseClient
          .from('chama')
          .select('created_by, commission_rate')
          .eq('id', chama_id)
          .single();

        if (chamaError || !chama) {
          return new Response(JSON.stringify({ error: 'Chama not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        isCreator = chama.created_by === user.id;

        // Check if user is a manager and get their membership details
        const { data: membership } = await supabaseClient
          .from('chama_members')
          .select('is_manager, id, order_index, missed_payments_count, balance_deficit')
          .eq('chama_id', chama_id)
          .eq('user_id', user.id)
          .eq('approval_status', 'approved')
          .maybeSingle();

        membershipData = membership;
        isManager = membership?.is_manager || false;

        // Check for payment issues (missed payments or outstanding deficit)
        if (membership) {
          const missedPayments = membership.missed_payments_count || 0;
          const balanceDeficit = Number(membership.balance_deficit) || 0;
          
          // Also check for late payments in member_cycle_payments
          const { data: latePayments } = await supabaseClient
            .from('member_cycle_payments')
            .select('id')
            .eq('member_id', membership.id)
            .eq('is_late_payment', true)
            .limit(1);

          hasPaymentIssues = missedPayments > 0 || balanceDeficit > 0 || (latePayments !== null && latePayments.length > 0);
          
          if (hasPaymentIssues) {
            console.log('Member has payment issues:', { missedPayments, balanceDeficit, latePayments: latePayments?.length || 0 });
          }
        }

        // If not a manager, check if it's their turn
        if (!isManager) {
          // Get all approved members
          const { data: members } = await supabaseClient
            .from('chama_members')
            .select('id, order_index')
            .eq('chama_id', chama_id)
            .eq('approval_status', 'approved')
            .order('order_index', { ascending: true });

          if (members && members.length > 0) {
            // Get completed withdrawals
            const { data: completedWithdrawals } = await supabaseClient
              .from('withdrawals')
              .select('id')
              .eq('chama_id', chama_id)
              .eq('status', 'completed')
              .order('completed_at', { ascending: true });

            const withdrawalCount = completedWithdrawals?.length || 0;
            const currentTurnIndex = withdrawalCount % members.length;
            const currentTurnMember = members[currentTurnIndex];

            if (membership && membership.id !== currentTurnMember.id) {
              return new Response(JSON.stringify({ 
                error: 'It is not your turn to withdraw. Please wait for your turn or contact the manager.',
                current_turn_member_id: currentTurnMember.id
              }), {
                status: 403,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            }
          }
        }

        // Calculate available balance from contributions
        const { data: contributions } = await supabaseClient
          .from('contributions')
          .select('amount')
          .eq('chama_id', chama_id)
          .eq('status', 'completed');

        totalAvailable = contributions?.reduce((sum, c) => sum + Number(c.amount), 0) || 0;

      } else if (mchango_id) {
        const { data: mchango, error: mchangoError } = await supabaseClient
          .from('mchango')
          .select('created_by, current_amount')
          .eq('id', mchango_id)
          .single();

        if (mchangoError || !mchango) {
          return new Response(JSON.stringify({ error: 'Mchango not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        isCreator = mchango.created_by === user.id;
        totalAvailable = Number(mchango.current_amount);
      }

      if (!isCreator && !isManager) {
        return new Response(JSON.stringify({ error: 'Only creators or managers can request withdrawals' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check for pending withdrawals
      const { data: pendingWithdrawals } = await supabaseClient
        .from('withdrawals')
        .select('id')
        .or(`chama_id.eq.${chama_id},mchango_id.eq.${mchango_id}`)
        .eq('status', 'pending')
        .maybeSingle();

      if (pendingWithdrawals) {
        return new Response(JSON.stringify({ error: 'There is already a pending withdrawal request' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (amount > totalAvailable) {
        return new Response(JSON.stringify({ 
          error: 'Insufficient funds',
          available: totalAvailable 
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Determine if auto-approval is allowed
      // Auto-approve if payment method is M-Pesa AND:
      // - Chama withdrawal: member has no payment issues
      // - Mchango withdrawal: user is the creator
      const canAutoApprove = defaultPaymentMethod.method_type === 'mpesa' && (
        (chama_id && !hasPaymentIssues) ||
        (mchango_id && isCreator)
      );
      const initialStatus = canAutoApprove ? 'approved' : 'pending';

      console.log('Auto-approval check:', { 
        chama_id: !!chama_id, 
        mchango_id: !!mchango_id,
        isCreator,
        hasPaymentIssues, 
        paymentMethod: defaultPaymentMethod.method_type,
        canAutoApprove 
      });

      // Create withdrawal request with payment method details
      const { data: withdrawal, error } = await supabaseClient
        .from('withdrawals')
        .insert({
          chama_id,
          mchango_id,
          requested_by: user.id,
          amount,
          commission_amount: commissionAmount,
          net_amount: netAmount,
          payment_method_id: defaultPaymentMethod.id,
          payment_method_type: defaultPaymentMethod.method_type,
          status: initialStatus,
          notes: hasPaymentIssues ? (notes || '') + ' [Requires admin review: payment issues detected]' : notes,
          reviewed_at: canAutoApprove ? new Date().toISOString() : null,
        })
        .select()
        .single();

      if (error) throw error;

      console.log('Withdrawal request created:', withdrawal);

      // If auto-approved and M-Pesa, trigger B2C payout immediately
      if (canAutoApprove && defaultPaymentMethod.phone_number) {
        const withdrawalType = chama_id ? 'Chama' : 'Mchango';
        console.log(`Auto-approved ${withdrawalType} withdrawal, triggering M-Pesa B2C payout`);
        
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        
        // Fire and forget - don't wait for B2C to complete
        fetch(`${supabaseUrl}/functions/v1/mpesa-b2c-payout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            withdrawal_id: withdrawal.id,
            phone_number: defaultPaymentMethod.phone_number,
            amount: netAmount
          })
        }).then(async (res) => {
          const result = await res.json();
          console.log('B2C payout triggered for auto-approved withdrawal:', result);
        }).catch((err) => {
          console.error('Failed to trigger B2C payout:', err);
        });

        return new Response(JSON.stringify({ 
          data: withdrawal,
          message: 'Withdrawal approved! Money is being sent to your M-Pesa now.',
          auto_approved: true
        }), {
          status: 201,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // For pending withdrawals (members with payment issues or non-M-Pesa)
      return new Response(JSON.stringify({ 
        data: withdrawal,
        message: hasPaymentIssues 
          ? 'Withdrawal request submitted. Requires admin approval due to payment history.'
          : 'Withdrawal request submitted for review.',
        requires_approval: true
      }), {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // GET / - List withdrawals
    if (req.method === 'GET') {
      const chamaId = url.searchParams.get('chama_id');
      const mchangoId = url.searchParams.get('mchango_id');

      let query = supabaseClient
        .from('withdrawals')
        .select(`
          *,
          requester:profiles!withdrawals_requested_by_fkey(full_name, email),
          reviewer:profiles!withdrawals_reviewed_by_fkey(full_name, email),
          payment_method:payment_methods(
            method_type,
            phone_number,
            bank_name,
            account_number,
            account_name
          )
        `)
        .order('created_at', { ascending: false });

      if (chamaId) {
        query = query.eq('chama_id', chamaId);
      } else if (mchangoId) {
        query = query.eq('mchango_id', mchangoId);
      }

      const { data, error } = await query;

      if (error) throw error;

      return new Response(JSON.stringify({ data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // PATCH / - Admin approval/rejection
    if (req.method === 'PATCH') {
      const body = await req.json();
      const { withdrawal_id, status, rejection_reason, payment_reference, skip_to_next } = body;

      if (!withdrawal_id) {
        return new Response(JSON.stringify({ 
          error: 'Missing withdrawal_id',
          details: 'withdrawal_id is required'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log('Updating withdrawal status:', { withdrawal_id, status, skip_to_next });

      // Verify admin role
      const { data: adminRole } = await supabaseClient
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .maybeSingle();

      if (!adminRole) {
        return new Response(JSON.stringify({ error: 'Admin access required' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get the withdrawal with payment method details
      const { data: existingWithdrawal, error: fetchError } = await supabaseAdmin
        .from('withdrawals')
        .select(`
          *,
          payment_method:payment_methods(
            method_type,
            phone_number,
            bank_name,
            account_number
          )
        `)
        .eq('id', withdrawal_id)
        .single();

      if (fetchError || !existingWithdrawal) {
        return new Response(JSON.stringify({ error: 'Withdrawal not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Handle rejection with skip-to-next logic
      if (status === 'rejected' && skip_to_next && existingWithdrawal.chama_id) {
        console.log('Processing rejection with skip-to-next for chama:', existingWithdrawal.chama_id);
        
        // Get the rejected member
        const { data: rejectedMember } = await supabaseAdmin
          .from('chama_members')
          .select('id, order_index, user_id')
          .eq('chama_id', existingWithdrawal.chama_id)
          .eq('user_id', existingWithdrawal.requested_by)
          .single();

        if (rejectedMember) {
          // Find next eligible member
          const { data: nextMembers } = await supabaseAdmin
            .from('chama_members')
            .select(`
              id, 
              order_index, 
              user_id, 
              missed_payments_count, 
              balance_deficit,
              first_payment_completed,
              profiles:user_id(full_name, phone)
            `)
            .eq('chama_id', existingWithdrawal.chama_id)
            .eq('approval_status', 'approved')
            .eq('status', 'active')
            .eq('first_payment_completed', true)
            .gt('order_index', rejectedMember.order_index)
            .order('order_index', { ascending: true });

          let nextEligibleMember = null;
          
          // Find first member with no payment issues
          for (const member of nextMembers || []) {
            if ((member.missed_payments_count || 0) === 0 && (Number(member.balance_deficit) || 0) === 0) {
              nextEligibleMember = member;
              break;
            }
          }

          // If no eligible found after, wrap around
          if (!nextEligibleMember) {
            const { data: firstMembers } = await supabaseAdmin
              .from('chama_members')
              .select(`
                id, 
                order_index, 
                user_id, 
                missed_payments_count, 
                balance_deficit,
                first_payment_completed,
                profiles:user_id(full_name, phone)
              `)
              .eq('chama_id', existingWithdrawal.chama_id)
              .eq('approval_status', 'approved')
              .eq('status', 'active')
              .eq('first_payment_completed', true)
              .lt('order_index', rejectedMember.order_index)
              .order('order_index', { ascending: true });

            for (const member of firstMembers || []) {
              if ((member.missed_payments_count || 0) === 0 && (Number(member.balance_deficit) || 0) === 0) {
                nextEligibleMember = member;
                break;
              }
            }
          }

          if (nextEligibleMember) {
            const originalRejectedIndex = rejectedMember.order_index;
            const originalNextIndex = nextEligibleMember.order_index;

            // Swap positions
            await supabaseAdmin
              .from('chama_members')
              .update({
                order_index: originalNextIndex,
                original_order_index: originalRejectedIndex,
                position_swapped_at: new Date().toISOString(),
                swapped_with_member_id: nextEligibleMember.id,
                was_skipped: true,
                skipped_at: new Date().toISOString(),
                skip_reason: rejection_reason || 'Payment issues detected'
              })
              .eq('id', rejectedMember.id);

            await supabaseAdmin
              .from('chama_members')
              .update({
                order_index: originalRejectedIndex,
                original_order_index: originalNextIndex,
                position_swapped_at: new Date().toISOString(),
                swapped_with_member_id: rejectedMember.id
              })
              .eq('id', nextEligibleMember.id);

            // Record in payout_skips
            await supabaseAdmin
              .from('payout_skips')
              .insert({
                chama_id: existingWithdrawal.chama_id,
                member_id: rejectedMember.id,
                skip_reason: rejection_reason || 'Admin rejected withdrawal',
                rescheduled_to_position: originalNextIndex,
                swap_performed: true,
                swapped_with_member_id: nextEligibleMember.id,
                original_withdrawal_id: withdrawal_id
              });

            // Get next member's payment method
            const { data: nextPaymentMethod } = await supabaseAdmin
              .from('payment_methods')
              .select('*')
              .eq('user_id', nextEligibleMember.user_id)
              .eq('is_default', true)
              .maybeSingle();

            // Create new withdrawal for next member
            const { data: newWithdrawal, error: newWdError } = await supabaseAdmin
              .from('withdrawals')
              .insert({
                chama_id: existingWithdrawal.chama_id,
                requested_by: nextEligibleMember.user_id,
                amount: existingWithdrawal.amount,
                commission_amount: 0,
                net_amount: existingWithdrawal.amount,
                payment_method_id: nextPaymentMethod?.id,
                payment_method_type: nextPaymentMethod?.method_type,
                status: nextPaymentMethod?.method_type === 'mpesa' ? 'approved' : 'pending',
                notes: `Auto-created after rejection of previous member. Original position #${originalRejectedIndex}`
              })
              .select()
              .single();

            // Update original payout_skips with new withdrawal id
            if (newWithdrawal) {
              await supabaseAdmin
                .from('payout_skips')
                .update({ new_withdrawal_id: newWithdrawal.id })
                .eq('original_withdrawal_id', withdrawal_id)
                .eq('member_id', rejectedMember.id);

              // If M-Pesa and auto-approved, trigger B2C payout
              if (nextPaymentMethod?.method_type === 'mpesa' && nextPaymentMethod.phone_number) {
                console.log('Triggering B2C payout for next eligible member');
                
                const supabaseUrl = Deno.env.get('SUPABASE_URL');
                const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
                
                fetch(`${supabaseUrl}/functions/v1/mpesa-b2c-payout`, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    withdrawal_id: newWithdrawal.id,
                    phone_number: nextPaymentMethod.phone_number,
                    amount: existingWithdrawal.amount
                  })
                }).then(async (res) => {
                  const result = await res.json();
                  console.log('B2C payout triggered for next member:', result);
                }).catch((err) => {
                  console.error('Failed to trigger B2C payout for next member:', err);
                });
              }

              // Send SMS notifications
              const supabaseUrl = Deno.env.get('SUPABASE_URL');
              const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

              // Notify rejected member
              const rejectedProfile = await supabaseAdmin
                .from('profiles')
                .select('phone, full_name')
                .eq('id', rejectedMember.user_id)
                .single();

              if (rejectedProfile?.data?.phone) {
                fetch(`${supabaseUrl}/functions/v1/send-transactional-sms`, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    phone: rejectedProfile.data.phone,
                    message: `Your withdrawal request has been declined due to payment issues. You have been moved to position #${originalNextIndex}. Please clear any outstanding payments.`,
                    event_type: 'withdrawal_rejected'
                  })
                }).catch(err => console.error('Failed to send rejection SMS:', err));
              }

              // Notify next member
              const nextProfile = nextEligibleMember.profiles as any;
              if (nextProfile?.phone) {
                fetch(`${supabaseUrl}/functions/v1/send-transactional-sms`, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    phone: nextProfile.phone,
                    message: `Good news! You are now eligible for payout. Your withdrawal of KES ${existingWithdrawal.amount.toLocaleString()} is being processed.`,
                    event_type: 'withdrawal_next_in_line'
                  })
                }).catch(err => console.error('Failed to send next-in-line SMS:', err));
              }
            }

            // Log audit trail
            await supabaseAdmin
              .from('audit_logs')
              .insert({
                user_id: user.id,
                action: 'withdrawal_rejected_with_swap',
                table_name: 'withdrawals',
                record_id: withdrawal_id,
                old_values: { 
                  rejected_member_position: originalRejectedIndex,
                  next_member_position: originalNextIndex
                },
                new_values: { 
                  rejected_member_new_position: originalNextIndex,
                  next_member_new_position: originalRejectedIndex,
                  new_withdrawal_id: newWithdrawal?.id
                }
              });
          }
        }

        // Update original withdrawal as rejected
        const { data: withdrawal, error } = await supabaseAdmin
          .from('withdrawals')
          .update({
            status: 'rejected',
            reviewed_at: new Date().toISOString(),
            reviewed_by: user.id,
            rejection_reason: rejection_reason || 'Payment issues detected'
          })
          .eq('id', withdrawal_id)
          .select()
          .single();

        if (error) throw error;

        return new Response(JSON.stringify({ 
          data: withdrawal,
          message: 'Withdrawal rejected. Positions swapped and next eligible member notified.',
          swapped: true
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Standard update (approval or rejection without swap)
      const { data: withdrawal, error } = await supabaseAdmin
        .from('withdrawals')
        .update({
          status,
          reviewed_at: new Date().toISOString(),
          reviewed_by: user.id,
          rejection_reason: status === 'rejected' ? rejection_reason : null,
          payment_reference: status === 'completed' ? payment_reference : null,
          completed_at: status === 'completed' ? new Date().toISOString() : null
        })
        .eq('id', withdrawal_id)
        .select()
        .single();

      if (error) throw error;

      console.log('Withdrawal updated:', withdrawal);

      // If approved and payment method is M-Pesa, trigger automatic B2C payout
      if (status === 'approved' && existingWithdrawal.payment_method?.method_type === 'mpesa') {
        const phoneNumber = existingWithdrawal.payment_method.phone_number;
        
        if (phoneNumber) {
          console.log('Triggering automatic M-Pesa B2C payout for:', withdrawal_id);
          
          const supabaseUrl = Deno.env.get('SUPABASE_URL');
          const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
          
          fetch(`${supabaseUrl}/functions/v1/mpesa-b2c-payout`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${serviceRoleKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              withdrawal_id: withdrawal_id,
              phone_number: phoneNumber,
              amount: existingWithdrawal.net_amount
            })
          }).then(async (res) => {
            const result = await res.json();
            console.log('B2C payout triggered:', result);
          }).catch((err) => {
            console.error('Failed to trigger B2C payout:', err);
          });

          // Send approval SMS
          const { data: requesterProfile } = await supabaseAdmin
            .from('profiles')
            .select('phone')
            .eq('id', existingWithdrawal.requested_by)
            .single();

          if (requesterProfile?.phone) {
            fetch(`${supabaseUrl}/functions/v1/send-transactional-sms`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                phone: requesterProfile.phone,
                message: `Your withdrawal of KES ${existingWithdrawal.net_amount.toLocaleString()} has been approved and is being sent to your M-Pesa.`,
                event_type: 'withdrawal_approved'
              })
            }).catch(err => console.error('Failed to send approval SMS:', err));
          }

          return new Response(JSON.stringify({ 
            data: withdrawal,
            message: 'Withdrawal approved. M-Pesa B2C payout initiated automatically.'
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      return new Response(JSON.stringify({ data: withdrawal }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error in withdrawals-crud:', {
      message: error.message,
      code: error.code,
      details: error.details
    });
    
    // Return safe error messages
    let safeMessage = 'An error occurred processing your request';
    if (error.code === '23505') safeMessage = 'Duplicate record';
    else if (error.code === '23503') safeMessage = 'Referenced record not found';
    else if (error.code === '42501') safeMessage = 'Permission denied';
    
    return new Response(JSON.stringify({ error: safeMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});