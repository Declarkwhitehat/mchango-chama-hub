import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { createNotification, NotificationTemplates } from "../_shared/notifications.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
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
        organization_id: z.string().uuid().optional(),
        amount: z.number()
          .positive('Amount must be positive')
          .min(10, 'Minimum withdrawal is KES 10')
          .max(10000000, 'Maximum withdrawal is KES 10M')
          .multipleOf(0.01, 'Amount must have max 2 decimal places'),
        notes: z.string()
          .max(500, 'Notes must be under 500 characters')
          .optional()
      }).refine(
        data => data.chama_id || data.mchango_id || data.organization_id,
        'Either chama_id, mchango_id, or organization_id required'
      );
      
      try {
        withdrawalSchema.parse(body);
      } catch (validationError) {
        return new Response(JSON.stringify({ 
          error: 'Invalid request data',
          details: (validationError as any).errors
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      const { chama_id, mchango_id, organization_id, amount, notes } = body;

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
          .select('created_by, commission_rate, available_balance, total_gross_collected, total_commission_paid, total_withdrawn')
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

        // Use available_balance (net after commission) for withdrawals
        // Fall back to calculating from contributions if available_balance is not set
        const availableBalance = Number(chama.available_balance) || 0;
        const totalWithdrawn = Number(chama.total_withdrawn) || 0;
        
        if (availableBalance > 0) {
          // Use the tracked available balance (already net of commission)
          totalAvailable = availableBalance - totalWithdrawn;
        } else {
          // Fallback: Calculate from contributions with commission deduction
          const { data: contributions } = await supabaseClient
            .from('contributions')
            .select('amount')
            .eq('chama_id', chama_id)
            .eq('status', 'completed');

          const grossTotal = contributions?.reduce((sum, c) => sum + Number(c.amount), 0) || 0;
          const commissionRate = Number(chama.commission_rate) || 0.05;
          const netTotal = grossTotal * (1 - commissionRate);
          totalAvailable = netTotal - totalWithdrawn;
        }
        
        console.log('Chama withdrawal balance check:', { 
          availableBalance, 
          totalWithdrawn, 
          totalAvailable,
          grossCollected: chama.total_gross_collected,
          commissionPaid: chama.total_commission_paid
        });

      } else if (mchango_id) {
        const { data: mchango, error: mchangoError } = await supabaseClient
          .from('mchango')
          .select('created_by, current_amount, available_balance')
          .eq('id', mchango_id)
          .single();

        if (mchangoError || !mchango) {
          return new Response(JSON.stringify({ error: 'Mchango not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        isCreator = mchango.created_by === user.id;
        // Use available_balance (which tracks net after commission and withdrawals)
        totalAvailable = Number(mchango.available_balance ?? mchango.current_amount);
      } else if (organization_id) {
        const { data: org, error: orgError } = await supabaseClient
          .from('organizations')
          .select('created_by, available_balance')
          .eq('id', organization_id)
          .single();

        if (orgError || !org) {
          return new Response(JSON.stringify({ error: 'Organization not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        isCreator = org.created_by === user.id;
        totalAvailable = Number(org.available_balance) || 0;
      }

      if (!isCreator && !isManager) {
        return new Response(JSON.stringify({ error: 'Only creators or managers can request withdrawals' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Prevent concurrent withdrawals for the same user and entity while one is active
      const filterParts = [];
      if (chama_id) filterParts.push(`chama_id.eq.${chama_id}`);
      if (mchango_id) filterParts.push(`mchango_id.eq.${mchango_id}`);
      if (organization_id) filterParts.push(`organization_id.eq.${organization_id}`);

      const { data: blockingWithdrawal } = await supabaseAdmin
        .from('withdrawals')
        .select('id, status')
        .eq('requested_by', user.id)
        .or(filterParts.join(','))
        .in('status', ['pending', 'approved', 'processing', 'pending_retry'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (blockingWithdrawal) {
        const statusMessages: Record<string, string> = {
          'pending': 'You already have a pending withdrawal request awaiting approval',
          'approved': 'Your approved withdrawal is being processed',
          'processing': 'A payout is currently being processed via M-Pesa',
          'pending_retry': 'The system is reconciling/retrying your previous payout'
        };
        return new Response(JSON.stringify({
          error: statusMessages[blockingWithdrawal.status] || 'A withdrawal is already in progress for your account',
          blocking_status: blockingWithdrawal.status
        }), {
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
      // Auto-approve for Mchango AND Organization withdrawals by creators with M-Pesa
      // All Chama withdrawals require admin approval (no auto-approve)
      const canAutoApprove = defaultPaymentMethod.method_type === 'mpesa' && 
        (mchango_id || organization_id) && isCreator;
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
          organization_id,
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

      // Balance is NOT deducted here — it will be deducted atomically
      // by process_withdrawal_completion() when the B2C callback confirms success.
      // This prevents the bug where balance is reduced but status stays "processing".

      // Get entity name for notification
      let entityName = 'your account';
      if (chama_id) {
        const { data: chamaInfo } = await supabaseAdmin
          .from('chama')
          .select('name')
          .eq('id', chama_id)
          .single();
        entityName = chamaInfo?.name || 'Chama';
      } else if (mchango_id) {
        const { data: mchangoInfo } = await supabaseAdmin
          .from('mchango')
          .select('title')
          .eq('id', mchango_id)
          .single();
        entityName = mchangoInfo?.title || 'Campaign';
      } else if (organization_id) {
        const { data: orgInfo } = await supabaseAdmin
          .from('organizations')
          .select('name')
          .eq('id', organization_id)
          .single();
        entityName = orgInfo?.name || 'Organization';
      }

      // Create notification for withdrawal request
      const notif = NotificationTemplates.withdrawalRequested(netAmount, entityName);
      await createNotification(supabaseAdmin, {
        userId: user.id,
        ...notif,
        relatedEntityId: withdrawal.id,
        relatedEntityType: 'withdrawal',
      });

      // If auto-approved and M-Pesa, trigger B2C payout immediately
      if (canAutoApprove && defaultPaymentMethod.phone_number) {
        const withdrawalType = chama_id ? 'Chama' : mchango_id ? 'Mchango' : 'Organization';
        console.log(`Auto-approved ${withdrawalType} withdrawal, triggering M-Pesa B2C payout`);
        
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        
        // Await B2C call and handle failures properly
        try {
          const b2cRes = await fetch(`${supabaseUrl}/functions/v1/b2c-payout`, {
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
          });

          const b2cResult = await b2cRes.json();
          console.log('B2C payout result for auto-approved withdrawal:', b2cResult);
          
          if (!b2cRes.ok || !b2cResult.success) {
            console.error('B2C initiation failed:', b2cResult);
            // Mark withdrawal as pending_retry for automatic recovery
            await supabaseAdmin
              .from('withdrawals')
              .update({
                status: 'pending_retry',
                b2c_error_details: { 
                  error: b2cResult.error || 'Initiation failed',
                  auto_approval_failure: true 
                },
                notes: (notes || '') + `\n[SYSTEM] Auto-approval B2C failed: ${b2cResult.error || 'Unknown error'}`
              })
              .eq('id', withdrawal.id);

            return new Response(JSON.stringify({ 
              data: { ...withdrawal, status: 'pending_retry' },
              message: 'Withdrawal approved but payout initiation failed. Will retry automatically.',
              auto_approved: true,
              payout_pending: true
            }), {
              status: 201,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }

          return new Response(JSON.stringify({ 
            data: withdrawal,
            message: 'Withdrawal approved! Money is being sent to your M-Pesa now.',
            auto_approved: true,
            payout_reference: b2cResult.payout_reference
          }), {
            status: 201,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });

        } catch (b2cError: any) {
          console.error('Exception triggering B2C payout:', b2cError);
          
          // Mark for retry so the retry cron picks it up
          await supabaseAdmin
            .from('withdrawals')
            .update({
              status: 'pending_retry',
              b2c_error_details: { 
                error: b2cError.message || 'Network error',
                auto_approval_failure: true 
              },
              notes: (notes || '') + `\n[SYSTEM] Auto-approval B2C exception: ${b2cError.message}`
            })
            .eq('id', withdrawal.id);

          return new Response(JSON.stringify({ 
            data: { ...withdrawal, status: 'pending_retry' },
            message: 'Withdrawal approved but payout encountered an error. Will retry automatically.',
            auto_approved: true,
            payout_pending: true
          }), {
            status: 201,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
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

      // Use admin client to bypass RLS for listing
      let query = supabaseAdmin
        .from('withdrawals')
        .select(`
          *,
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

      const { data: withdrawals, error } = await query;

      if (error) throw error;

      // Fetch requester/reviewer profiles + entity names + welfare approvals in parallel
      const enrichedWithdrawals = await Promise.all((withdrawals || []).map(async (w: any) => {
        const tasks: Promise<any>[] = [];

        // 0: requester profile
        tasks.push(w.requested_by
          ? supabaseAdmin.from('profiles').select('full_name, email, phone').eq('id', w.requested_by).single().then(r => r.data)
          : Promise.resolve(null));

        // 1: reviewer profile
        tasks.push(w.reviewed_by
          ? supabaseAdmin.from('profiles').select('full_name, email').eq('id', w.reviewed_by).single().then(r => r.data)
          : Promise.resolve(null));

        // 2: entity name
        let entityPromise: Promise<any> = Promise.resolve(null);
        if (w.chama_id) {
          entityPromise = supabaseAdmin.from('chama').select('name').eq('id', w.chama_id).single().then(r => ({ name: r.data?.name, type: 'Chama' }));
        } else if (w.mchango_id) {
          entityPromise = supabaseAdmin.from('mchango').select('title').eq('id', w.mchango_id).single().then(r => ({ name: r.data?.title, type: 'Mchango' }));
        } else if (w.organization_id) {
          entityPromise = supabaseAdmin.from('organizations').select('name').eq('id', w.organization_id).single().then(r => ({ name: r.data?.name, type: 'Organization' }));
        } else if (w.welfare_id) {
          entityPromise = supabaseAdmin.from('welfares').select('name').eq('id', w.welfare_id).single().then(r => ({ name: r.data?.name, type: 'Welfare' }));
        }
        tasks.push(entityPromise);

        // 3: welfare approvals (only for welfare withdrawals)
        tasks.push(w.welfare_id
          ? supabaseAdmin.from('welfare_withdrawal_approvals').select('approver_role, decision, decided_at, rejection_reason').eq('withdrawal_id', w.id).then(r => r.data || [])
          : Promise.resolve([]));

        const [requester, reviewer, entity, welfare_approvals] = await Promise.all(tasks);

        return {
          ...w,
          requester,
          reviewer,
          entity_name: entity?.name || null,
          entity_type: entity?.type || 'Unknown',
          welfare_approvals,
        };
      }));

      return new Response(JSON.stringify({ data: enrichedWithdrawals }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // PATCH / - Admin approval/rejection OR user status check
    if (req.method === 'PATCH') {
      const body = await req.json();
      const { withdrawal_id, status, rejection_reason, payment_reference, skip_to_next, action } = body;

      // User-initiated status check for their own stuck withdrawal
      if (action === 'check_status') {
        if (!withdrawal_id) {
          return new Response(JSON.stringify({ error: 'withdrawal_id is required' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Get the withdrawal
        const { data: wd, error: wdErr } = await supabaseAdmin
          .from('withdrawals')
          .select('id, status, requested_by, notes')
          .eq('id', withdrawal_id)
          .single();

        if (wdErr || !wd) {
          return new Response(JSON.stringify({ error: 'Withdrawal not found' }), {
            status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Only the requester can check their own withdrawal status
        if (wd.requested_by !== user.id) {
          return new Response(JSON.stringify({ error: 'You can only check your own withdrawals' }), {
            status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        if (!['processing', 'pending_retry'].includes(wd.status)) {
          return new Response(JSON.stringify({
            status: wd.status,
            message: `Withdrawal is ${wd.status}. Status check is only available for processing or pending_retry withdrawals.`,
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // Call b2c-status-query
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

        try {
          const statusRes = await fetch(`${supabaseUrl}/functions/v1/b2c-status-query`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${serviceRoleKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ withdrawal_id }),
          });

          const statusResult = await statusRes.json();
          return new Response(JSON.stringify({
            message: 'Status check initiated. Your withdrawal will be updated automatically when the result arrives.',
            current_status: wd.status,
            query_result: statusResult,
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

        } catch (err: any) {
          return new Response(JSON.stringify({
            error: 'Failed to query status',
            message: err.message,
          }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      }

      // Admin-initiated retry for failed/pending_retry withdrawals
      if (action === 'retry') {
        if (!withdrawal_id) {
          return new Response(JSON.stringify({ error: 'withdrawal_id is required' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const { data: retryAdminRole } = await supabaseClient
          .from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle();
        if (!retryAdminRole) {
          return new Response(JSON.stringify({ error: 'Admin access required' }), {
            status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const { data: retryWd, error: retryErr } = await supabaseAdmin
          .from('withdrawals')
          .select(`*, payment_method:payment_methods(method_type, phone_number)`)
          .eq('id', withdrawal_id).single();

        if (retryErr || !retryWd) {
          return new Response(JSON.stringify({ error: 'Withdrawal not found' }), {
            status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        if (!['failed', 'pending_retry'].includes(retryWd.status)) {
          return new Response(JSON.stringify({ error: `Cannot retry withdrawal in ${retryWd.status} status` }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const retryPhone = retryWd.payment_method?.phone_number;
        if (!retryPhone || retryWd.payment_method?.method_type !== 'mpesa') {
          return new Response(JSON.stringify({ error: 'No M-Pesa phone number on payment method' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        await supabaseAdmin.from('withdrawals').update({
          status: 'approved',
          notes: (retryWd.notes || '') + `\n[ADMIN] Retry initiated by admin on ${new Date().toISOString()}`,
          b2c_attempt_count: (retryWd.b2c_attempt_count || 0) + 1,
          last_b2c_attempt_at: new Date().toISOString(),
        }).eq('id', withdrawal_id);

        const retryUrl = Deno.env.get('SUPABASE_URL') ?? '';
        const retryKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

        try {
          const b2cRes = await fetch(`${retryUrl}/functions/v1/b2c-payout`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${retryKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ withdrawal_id, phone_number: retryPhone, amount: retryWd.net_amount }),
          });
          const b2cResult = await b2cRes.json();
          if (!b2cRes.ok || !b2cResult.success) {
            await supabaseAdmin.from('withdrawals').update({
              status: 'failed',
              b2c_error_details: b2cResult,
              notes: (retryWd.notes || '') + `\n[ADMIN] Retry failed: ${b2cResult.error || 'Unknown'}`,
            }).eq('id', withdrawal_id);
            return new Response(JSON.stringify({ error: 'Retry B2C failed', details: b2cResult }), {
              status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
          return new Response(JSON.stringify({ message: 'M-Pesa retry initiated successfully', data: b2cResult }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } catch (err: any) {
          await supabaseAdmin.from('withdrawals').update({
            status: 'pending_retry',
            notes: (retryWd.notes || '') + `\n[ADMIN] Retry exception: ${err.message}`,
          }).eq('id', withdrawal_id);
          return new Response(JSON.stringify({ error: 'Retry failed', message: err.message }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      // Admin force-approve for welfare pending_approval withdrawals
      if (action === 'force_approve') {
        if (!withdrawal_id) {
          return new Response(JSON.stringify({ error: 'withdrawal_id is required' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        const { data: faAdminRole } = await supabaseClient
          .from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle();
        if (!faAdminRole) {
          return new Response(JSON.stringify({ error: 'Admin access required' }), {
            status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        const { data: faWd } = await supabaseAdmin
          .from('withdrawals')
          .select(`*, payment_method:payment_methods(method_type, phone_number)`)
          .eq('id', withdrawal_id).single();
        if (!faWd || faWd.status !== 'pending_approval') {
          return new Response(JSON.stringify({ error: 'Withdrawal not in pending_approval status' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        await supabaseAdmin.from('withdrawals').update({
          status: 'approved',
          reviewed_at: new Date().toISOString(),
          reviewed_by: user.id,
          notes: (faWd.notes || '') + `\n[ADMIN] Force-approved by admin, bypassing multi-sig`,
        }).eq('id', withdrawal_id);

        if (faWd.payment_method?.method_type === 'mpesa' && faWd.payment_method?.phone_number) {
          const faUrl = Deno.env.get('SUPABASE_URL') ?? '';
          const faKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
          const b2cRes = await fetch(`${faUrl}/functions/v1/b2c-payout`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${faKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ withdrawal_id, phone_number: faWd.payment_method.phone_number, amount: faWd.net_amount }),
          });
          const b2cResult = await b2cRes.json();
          return new Response(JSON.stringify({ message: 'Force-approved and B2C initiated', data: b2cResult }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ message: 'Force-approved. Awaiting manual payment.' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

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
                
                fetch(`${supabaseUrl}/functions/v1/b2c-payout`, {
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

              // Create notification for rejection
              const rejectNotif = NotificationTemplates.withdrawalRejected(
                existingWithdrawal.net_amount, 
                rejection_reason || 'Payment issues detected'
              );
              await createNotification(supabaseAdmin, {
                userId: rejectedMember.user_id,
                ...rejectNotif,
                relatedEntityId: withdrawal_id,
                relatedEntityType: 'withdrawal',
              });
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

      // Handle "Send via M-Pesa" (status=approved, no payment_reference)
      // vs "Mark as Manually Paid" (status=completed, with payment_reference)
      const isMpesaApproval = status === 'approved' && !payment_reference && 
        existingWithdrawal.payment_method?.method_type === 'mpesa';
      
      const isManualCompletion = status === 'completed' && payment_reference;

      // Standard update (approval or rejection without swap)
      const { data: withdrawal, error } = await supabaseAdmin
        .from('withdrawals')
        .update({
          status: isMpesaApproval ? 'approved' : status,
          reviewed_at: new Date().toISOString(),
          reviewed_by: user.id,
          rejection_reason: status === 'rejected' ? rejection_reason : null,
          payment_reference: isManualCompletion ? payment_reference : null,
          completed_at: isManualCompletion ? new Date().toISOString() : null
        })
        .eq('id', withdrawal_id)
        .select()
        .single();

      if (error) throw error;

      console.log('Withdrawal updated:', withdrawal);

      // If manually completed, update entity total_withdrawn and available_balance
      if (isManualCompletion) {
        const netAmt = Number(existingWithdrawal.net_amount);
        if (existingWithdrawal.chama_id) {
          const { data: entity } = await supabaseAdmin.from('chama').select('total_withdrawn, available_balance').eq('id', existingWithdrawal.chama_id).single();
          if (entity) {
            await supabaseAdmin.from('chama').update({
              total_withdrawn: Number(entity.total_withdrawn || 0) + netAmt,
              available_balance: Number(entity.available_balance || 0) - netAmt,
            }).eq('id', existingWithdrawal.chama_id);
          }
        } else if (existingWithdrawal.mchango_id) {
          const { data: entity } = await supabaseAdmin.from('mchango').select('total_withdrawn, available_balance').eq('id', existingWithdrawal.mchango_id).single();
          if (entity) {
            await supabaseAdmin.from('mchango').update({
              total_withdrawn: Number(entity.total_withdrawn || 0) + netAmt,
              available_balance: Number(entity.available_balance || 0) - netAmt,
            }).eq('id', existingWithdrawal.mchango_id);
          }
        } else if (existingWithdrawal.organization_id) {
          const { data: entity } = await supabaseAdmin.from('organizations').select('total_withdrawn, available_balance').eq('id', existingWithdrawal.organization_id).single();
          if (entity) {
            await supabaseAdmin.from('organizations').update({
              total_withdrawn: Number(entity.total_withdrawn || 0) + netAmt,
              available_balance: Number(entity.available_balance || 0) - netAmt,
            }).eq('id', existingWithdrawal.organization_id);
          }
        } else if (existingWithdrawal.welfare_id) {
          const { data: entity } = await supabaseAdmin.from('welfares').select('total_withdrawn, available_balance').eq('id', existingWithdrawal.welfare_id).single();
          if (entity) {
            await supabaseAdmin.from('welfares').update({
              total_withdrawn: Number(entity.total_withdrawn || 0) + netAmt,
              available_balance: Number(entity.available_balance || 0) - netAmt,
            }).eq('id', existingWithdrawal.welfare_id);
          }
        }
        console.log('Updated entity balances for manual completion:', { withdrawal_id, net_amount: netAmt });
      }

      // If M-Pesa approval (Send via M-Pesa button), trigger B2C payout
      if (isMpesaApproval) {
        const phoneNumber = existingWithdrawal.payment_method.phone_number;
        
        if (phoneNumber) {
          console.log('Triggering M-Pesa B2C payout for:', withdrawal_id);
          
          const supabaseUrl = Deno.env.get('SUPABASE_URL');
          const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

          if (!supabaseUrl || !serviceRoleKey) {
            console.error('Missing backend configuration for B2C payout', {
              hasSupabaseUrl: !!supabaseUrl,
              hasServiceRoleKey: !!serviceRoleKey,
            });
            return new Response(JSON.stringify({ error: 'Backend payout configuration missing' }), {
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }

          // IMPORTANT: Do NOT fire-and-forget. The edge runtime may terminate the request and cancel
          // the outbound call before it completes, so we await the initiation call here.
          const payoutRes = await fetch(`${supabaseUrl}/functions/v1/b2c-payout`, {
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
          });

          const payoutText = await payoutRes.text();
          let payoutResult: any = null;
          try {
            payoutResult = payoutText ? JSON.parse(payoutText) : null;
          } catch {
            payoutResult = { raw: payoutText };
          }

          if (!payoutRes.ok || payoutResult?.success === false || payoutResult?.error) {
            console.error('Failed to initiate B2C payout:', {
              status: payoutRes.status,
              body: payoutResult,
            });

            // Ensure withdrawal is marked failed if initiation call failed before b2c-payout could update it.
            await supabaseAdmin
              .from('withdrawals')
              .update({
                status: 'failed',
                b2c_error_details: typeof payoutResult === 'string' ? payoutResult : JSON.stringify(payoutResult),
                notes: (existingWithdrawal.notes || '') + `\n[SYSTEM] Failed to initiate B2C payout (admin action).`,
              })
              .eq('id', withdrawal_id);

            return new Response(JSON.stringify({
              error: payoutResult?.error || 'Failed to initiate M-Pesa payout',
              details: payoutResult,
            }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }

          console.log('B2C payout initiated:', payoutResult);

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

          // Create notification for withdrawal approval
          const approvalNotif = NotificationTemplates.withdrawalApproved(existingWithdrawal.net_amount);
          await createNotification(supabaseAdmin, {
            userId: existingWithdrawal.requested_by,
            ...approvalNotif,
            relatedEntityId: withdrawal_id,
            relatedEntityType: 'withdrawal',
          });

          return new Response(JSON.stringify({ 
            data: withdrawal,
            message: 'M-Pesa B2C payout initiated. Withdrawal will be marked complete automatically.'
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({
          error: 'Cannot initiate M-Pesa payout: missing phone number on payment method'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ data: withdrawal }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const err = error as any;
    console.error('Error in withdrawals-crud:', {
      message: err.message,
      code: err.code,
      details: err.details
    });
    
    // Return safe error messages
    let safeMessage = 'An error occurred processing your request';
    if (err.code === '23505') safeMessage = 'Duplicate record';
    else if (err.code === '23503') safeMessage = 'Referenced record not found';
    else if (err.code === '42501') safeMessage = 'Permission denied';
    
    return new Response(JSON.stringify({ error: safeMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});