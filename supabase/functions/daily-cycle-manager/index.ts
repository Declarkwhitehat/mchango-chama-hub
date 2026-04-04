import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { corsHeaders } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    let action = '';
    let requestBody: any = {};
    
    if (req.method === 'POST') {
      requestBody = await req.json();
      action = requestBody.action;
    }

    // CREATE CYCLE FOR TODAY
    if (action === 'create-today' && req.method === 'POST') {
      const { chamaId } = requestBody;

      const { data: chama, error: chamaError } = await supabase
        .from('chama')
        .select('*')
        .eq('id', chamaId)
        .eq('status', 'active')
        .maybeSingle();

      if (chamaError || !chama) {
        return new Response(JSON.stringify({ error: 'Chama not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Check if today's cycle already exists (robust: check for any cycle overlapping today)
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);
      
      const { data: existingCycles } = await supabase
        .from('contribution_cycles')
        .select('*')
        .eq('chama_id', chamaId)
        .lte('start_date', todayEnd.toISOString())
        .gte('end_date', todayStart.toISOString());

      if (existingCycles && existingCycles.length > 0) {
        return new Response(JSON.stringify({ cycle: existingCycles[0] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Get approved members with their credit balances
      const { data: members } = await supabase
        .from('chama_members')
        .select('*, carry_forward_credit, next_cycle_credit')
        .eq('chama_id', chamaId)
        .eq('approval_status', 'approved')
        .eq('status', 'active')
        .order('order_index');

      if (!members || members.length === 0) {
        return new Response(JSON.stringify({ error: 'No approved members' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Determine today's beneficiary
      const { data: latestCycle } = await supabase
        .from('contribution_cycles')
        .select('cycle_number')
        .eq('chama_id', chamaId)
        .order('cycle_number', { ascending: false })
        .limit(1)
        .maybeSingle();

      const cycleNumber = (latestCycle?.cycle_number || 0) + 1;
      const beneficiaryIndex = (cycleNumber - 1) % members.length;
      const beneficiary = members[beneficiaryIndex];

      // Calculate cycle dates based on contribution frequency
      const startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date();
      
      switch (chama.contribution_frequency) {
        case 'daily':
          endDate.setHours(22, 0, 0, 0);
          break;
        case 'weekly':
          endDate.setDate(endDate.getDate() + 6);
          endDate.setHours(23, 59, 59, 999);
          break;
        case 'monthly':
          endDate.setMonth(endDate.getMonth() + 1);
          endDate.setDate(0);
          endDate.setHours(23, 59, 59, 999);
          break;
        case 'every_n_days':
          endDate.setDate(endDate.getDate() + (chama.every_n_days_count || 7) - 1);
          endDate.setHours(23, 59, 59, 999);
          break;
        default:
          endDate.setDate(endDate.getDate() + 6);
          endDate.setHours(23, 59, 59, 999);
      }

      const { data: newCycle, error: cycleError } = await supabase
        .from('contribution_cycles')
        .insert({
          chama_id: chamaId,
          cycle_number: cycleNumber,
          start_date: startDate.toISOString(),
          end_date: endDate.toISOString(),
          due_amount: chama.contribution_amount,
          beneficiary_member_id: beneficiary.id,
          is_complete: false,
          payout_processed: false
        })
        .select()
        .single();

      if (cycleError) {
        console.error('Error creating cycle:', cycleError);
        return new Response(JSON.stringify({ error: cycleError.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Create payment records with carry-forward credit applied
      // Commission is deducted NOW when credit is consumed (deferred from overpayment time)
      const COMMISSION_RATE = 0.05;
      let totalCreditCommission = 0;
      let totalNetCreditApplied = 0;

      const paymentRecords = members.map((member: any) => {
        const carryForward = member.carry_forward_credit || 0;
        const nextCycleCredit = member.next_cycle_credit || 0;
        const totalCredit = carryForward + nextCycleCredit;
        const creditToUse = Math.min(totalCredit, chama.contribution_amount);
        const commission = creditToUse * COMMISSION_RATE;
        const netFromCredit = creditToUse - commission;
        const amountRemaining = Math.max(0, chama.contribution_amount - netFromCredit);
        const isFullyPaid = amountRemaining <= 0;
        
        if (creditToUse > 0) {
          totalCreditCommission += commission;
          totalNetCreditApplied += netFromCredit;
        }
        
        return {
          member_id: member.id,
          cycle_id: newCycle.id,
          amount_due: chama.contribution_amount,
          amount_paid: netFromCredit,
          amount_remaining: amountRemaining,
          is_paid: isFullyPaid,
          fully_paid: isFullyPaid,
          is_late_payment: false,
          payment_allocations: creditToUse > 0 ? [{
            amount: netFromCredit,
            gross_credit_used: creditToUse,
            commission,
            commission_rate: COMMISSION_RATE,
            timestamp: new Date().toISOString(),
            source: 'carry_forward'
          }] : []
        };
      });

      const { error: paymentError } = await supabase
        .from('member_cycle_payments')
        .insert(paymentRecords);

      if (paymentError) {
        console.error('Error creating payment records:', paymentError);
      }

      // Reset carry-forward and next_cycle_credit for members where it was applied
      for (const member of members) {
        const carryForward = member.carry_forward_credit || 0;
        const nextCycleCredit = member.next_cycle_credit || 0;
        const totalCredit = carryForward + nextCycleCredit;
        
        if (totalCredit > 0) {
          const creditUsed = Math.min(totalCredit, chama.contribution_amount);
          const remainingCarryForward = Math.max(0, totalCredit - creditUsed);
          
          await supabase
            .from('chama_members')
            .update({
              carry_forward_credit: remainingCarryForward,
              next_cycle_credit: 0
            })
            .eq('id', member.id);
        }
      }

      // Add net credit (after commission) to chama's available_balance and record commission
      if (totalNetCreditApplied > 0 || totalCreditCommission > 0) {
        const { data: chamaBalance } = await supabase
          .from('chama')
          .select('available_balance, total_commission_paid')
          .eq('id', chamaId)
          .single();

        if (chamaBalance) {
          await supabase
            .from('chama')
            .update({
              available_balance: (chamaBalance.available_balance || 0) + totalNetCreditApplied,
              total_commission_paid: (chamaBalance.total_commission_paid || 0) + totalCreditCommission
            })
            .eq('id', chamaId);
          
          console.log(`Applied carry-forward: net=${totalNetCreditApplied}, commission=${totalCreditCommission}`);
        }

        // Record commission in company_earnings
        if (totalCreditCommission > 0) {
          await supabase.from('company_earnings').insert({
            source: 'chama_commission',
            amount: totalCreditCommission,
            group_id: chamaId,
            description: `Commission on carry-forward credit applied to Cycle #${newCycle.cycle_number}`
          });
        }
      }

      return new Response(JSON.stringify({ cycle: newCycle, beneficiary }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // GET CURRENT CYCLE
    if (action === 'current' && req.method === 'POST') {
      const { chamaId } = requestBody;
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      const { data: cycles, error } = await supabase
        .from('contribution_cycles')
        .select(`
          *,
          beneficiary:chama_members!beneficiary_member_id(
            id,
            member_code,
            user_id,
            profiles!chama_members_user_id_fkey(full_name)
          )
        `)
        .eq('chama_id', chamaId)
        .lte('start_date', todayEnd.toISOString())
        .gte('end_date', todayStart.toISOString())
        .order('cycle_number', { ascending: false })
        .limit(1);

      const cycle = cycles?.[0] || null;

      if (error) {
        console.error('Error fetching cycle:', error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (!cycle) {
        return new Response(JSON.stringify({ cycle: null }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { data: payments } = await supabase
        .from('member_cycle_payments')
        .select(`
          *,
          chama_members!member_id(
            id,
            member_code,
            user_id,
            profiles!chama_members_user_id_fkey(full_name)
          )
        `)
        .eq('cycle_id', cycle.id);

      return new Response(JSON.stringify({ 
        cycle: {
          ...cycle,
          end_date: cycle.end_date,
          cutoff_time: '22:00:00'
        }, 
        payments 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // GET ALL CYCLES WITH PER-CYCLE PAYMENT STATUS
    if (action === 'all-cycles' && req.method === 'POST') {
      const { chamaId, userId } = requestBody;

      const { data: cycles, error: cyclesError } = await supabase
        .from('contribution_cycles')
        .select(`
          *,
          beneficiary:chama_members!beneficiary_member_id(
            id,
            member_code,
            user_id,
            profiles!chama_members_user_id_fkey(full_name)
          )
        `)
        .eq('chama_id', chamaId)
        .order('cycle_number', { ascending: false })
        .limit(50);

      if (cyclesError) {
        return new Response(JSON.stringify({ error: cyclesError.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { data: memberData } = await supabase
        .from('chama_members')
        .select('id')
        .eq('chama_id', chamaId)
        .eq('user_id', userId)
        .eq('status', 'active')
        .maybeSingle();

      let memberPayments: any[] = [];
      if (memberData) {
        const { data: payments } = await supabase
          .from('member_cycle_payments')
          .select('cycle_id, amount_due, amount_paid, amount_remaining, fully_paid, is_paid, is_late_payment, paid_at')
          .eq('member_id', memberData.id);
        
        memberPayments = payments || [];
      }

      const cyclesWithStatus = (cycles || []).map((cycle: any) => {
        const payment = memberPayments.find((p: any) => p.cycle_id === cycle.id);
        const now = new Date();
        const endDate = new Date(cycle.end_date);
        const isPastDue = now > endDate;

        return {
          id: cycle.id,
          cycle_number: cycle.cycle_number,
          start_date: cycle.start_date,
          end_date: cycle.end_date,
          due_amount: cycle.due_amount,
          beneficiary_name: cycle.beneficiary?.profiles?.full_name || 'Unknown',
          beneficiary_code: cycle.beneficiary?.member_code || '',
          is_complete: cycle.is_complete,
          payout_processed: cycle.payout_processed,
          payout_type: cycle.payout_type,
          member_payment: payment ? {
            amount_due: payment.amount_due,
            amount_paid: payment.amount_paid || 0,
            amount_remaining: payment.amount_remaining || 0,
            fully_paid: payment.fully_paid || false,
            is_paid: payment.is_paid || false,
            is_late_payment: payment.is_late_payment || false,
            paid_at: payment.paid_at,
          } : null,
          commission_rate: isPastDue && !(payment?.fully_paid) ? 0.10 : 0.05,
          commission_label: isPastDue && !(payment?.fully_paid) ? '10% (late)' : '5% (on-time)',
          status: payment?.fully_paid 
            ? (payment.is_late_payment ? 'late' : 'paid')
            : isPastDue 
              ? 'missed' 
              : 'pending' as const
        };
      });

      return new Response(JSON.stringify({ cycles: cyclesWithStatus, memberId: memberData?.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // AUTO-ADVANCE: Delegate expired cycle processing to daily-payout-cron
    // This action now only triggers the payout cron for a specific chama,
    // ensuring all cycle completions go through the single payout processing path.
    if (action === 'auto-advance' && req.method === 'POST') {
      const { chamaId } = requestBody;
      const now = new Date();

      // Check if there are expired incomplete cycles
      const { data: expiredCycles } = await supabase
        .from('contribution_cycles')
        .select('id, cycle_number, end_date')
        .eq('chama_id', chamaId)
        .eq('payout_processed', false)
        .lt('end_date', now.toISOString())
        .order('cycle_number', { ascending: true });

      if (!expiredCycles || expiredCycles.length === 0) {
        return new Response(JSON.stringify({ message: 'No expired cycles to advance' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      console.log(`[AUTO-ADVANCE] Found ${expiredCycles.length} expired cycle(s) for chama ${chamaId}. Delegating to daily-payout-cron...`);

      // Delegate to daily-payout-cron which handles:
      // - Row-level locking (claim_cycle_for_processing)
      // - Duplicate payout prevention (cycle_id unique index)
      // - Eligibility checks & skip logic
      // - Debt accrual for non-payers
      // - Financial ledger entries
      // - B2C payout initiation
      // - Next cycle creation
      try {
        const payoutResponse = await fetch(`${supabaseUrl}/functions/v1/daily-payout-cron`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ time: now.toISOString() })
        });

        if (!payoutResponse.ok) {
          const errText = await payoutResponse.text();
          console.error(`[AUTO-ADVANCE] Payout cron failed (${payoutResponse.status}):`, errText);
          return new Response(JSON.stringify({ 
            error: `Payout processing failed: ${payoutResponse.status}`,
            details: errText
          }), {
            status: 502,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const payoutResult = await payoutResponse.json();
        console.log(`[AUTO-ADVANCE] Payout cron result:`, payoutResult);

        // Now create today's cycle if needed
        const createResponse = await fetch(`${supabaseUrl}/functions/v1/daily-cycle-manager`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ action: 'create-today', chamaId }),
        });
        
        if (!createResponse.ok) {
          console.error(`[AUTO-ADVANCE] Cycle creation failed (${createResponse.status})`);
        }
        const createResult = await createResponse.json();

        return new Response(JSON.stringify({ 
          advanced_cycles: expiredCycles.length,
          payout_result: payoutResult,
          new_cycle: createResult.cycle || null 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (error: any) {
        console.error('[AUTO-ADVANCE] Error delegating to payout cron:', error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    return new Response(JSON.stringify({ error: 'Invalid endpoint' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error in daily-cycle-manager:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
