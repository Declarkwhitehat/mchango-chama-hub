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
    
    // For POST requests, read action from body
    let action = '';
    let requestBody: any = {};
    
    if (req.method === 'POST') {
      requestBody = await req.json();
      action = requestBody.action;
    }

    // CREATE CYCLE FOR TODAY
    if (action === 'create-today' && req.method === 'POST') {
      const { chamaId } = requestBody;

      // Get chama details - work with ALL frequencies
      const { data: chama, error: chamaError } = await supabase
        .from('chama')
        .select('*, chama_members!inner(*)')
        .eq('id', chamaId)
        .eq('status', 'active')
        .single();

      if (chamaError || !chama) {
        return new Response(JSON.stringify({ error: 'Chama not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Check if today's cycle already exists
      const today = new Date().toISOString().split('T')[0];
      const { data: existingCycle } = await supabase
        .from('contribution_cycles')
        .select('*')
        .eq('chama_id', chamaId)
        .gte('start_date', today)
        .lte('end_date', today)
        .maybeSingle();

      if (existingCycle) {
        return new Response(JSON.stringify({ cycle: existingCycle }), {
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

      // Determine today's beneficiary based on payout order and cycle count
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
          endDate.setHours(23, 59, 59, 999);
          break;
        case 'weekly':
          endDate.setDate(endDate.getDate() + 6);
          endDate.setHours(23, 59, 59, 999);
          break;
        case 'monthly':
          endDate.setMonth(endDate.getMonth() + 1);
          endDate.setDate(0); // Last day of month
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

      // Create payment records for all members
      // Apply carry-forward credit to reduce amount due
      const paymentRecords = members.map(member => {
        const carryForward = member.carry_forward_credit || 0;
        const nextCycleCredit = member.next_cycle_credit || 0;
        const totalCredit = carryForward + nextCycleCredit;
        const amountDue = Math.max(0, chama.contribution_amount - totalCredit);
        const amountApplied = Math.min(totalCredit, chama.contribution_amount);
        const isFullyPaid = amountDue <= 0;
        
        return {
          member_id: member.id,
          cycle_id: newCycle.id,
          amount_due: chama.contribution_amount,
          amount_paid: amountApplied,
          amount_remaining: amountDue,
          is_paid: isFullyPaid,
          fully_paid: isFullyPaid,
          is_late_payment: false,
          payment_allocations: amountApplied > 0 ? [{
            amount: amountApplied,
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
          const appliedAmount = Math.min(totalCredit, chama.contribution_amount);
          const remainingCarryForward = Math.max(0, totalCredit - chama.contribution_amount);
          
          await supabase
            .from('chama_members')
            .update({
              carry_forward_credit: remainingCarryForward,
              next_cycle_credit: 0
            })
            .eq('id', member.id);
        }
      }

      return new Response(JSON.stringify({ cycle: newCycle, beneficiary }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // GET CURRENT CYCLE
    if (action === 'current' && req.method === 'POST') {
      const { chamaId } = requestBody;
      const today = new Date().toISOString().split('T')[0];

      const { data: cycle, error } = await supabase
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
        .lte('start_date', today)
        .gte('end_date', today)
        .maybeSingle();

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

      // Get payment status for all members
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

      // Return cycle with explicit end_date and cutoff_time for frontend countdown
      return new Response(JSON.stringify({ 
        cycle: {
          ...cycle,
          end_date: cycle.end_date,
          cutoff_time: '20:00:00'
        }, 
        payments 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // GET ALL CYCLES WITH PER-CYCLE PAYMENT STATUS
    if (action === 'all-cycles' && req.method === 'POST') {
      const { chamaId, userId } = requestBody;

      // Get all cycles for this chama, ordered by cycle_number desc
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

      // Get the member_id for this user
      const { data: memberData } = await supabase
        .from('chama_members')
        .select('id')
        .eq('chama_id', chamaId)
        .eq('user_id', userId)
        .eq('status', 'active')
        .maybeSingle();

      let memberPayments: any[] = [];
      if (memberData) {
        // Get all payment records for this member across all cycles
        const { data: payments } = await supabase
          .from('member_cycle_payments')
          .select('cycle_id, amount_due, amount_paid, amount_remaining, fully_paid, is_paid, is_late_payment, paid_at')
          .eq('member_id', memberData.id);
        
        memberPayments = payments || [];
      }

      // Build per-cycle status
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
          // Per-cycle payment status for this member
          member_payment: payment ? {
            amount_due: payment.amount_due,
            amount_paid: payment.amount_paid || 0,
            amount_remaining: payment.amount_remaining || 0,
            fully_paid: payment.fully_paid || false,
            is_paid: payment.is_paid || false,
            is_late_payment: payment.is_late_payment || false,
            paid_at: payment.paid_at,
          } : null,
          // Determine display status
          status: payment?.fully_paid 
            ? (payment.is_late_payment ? 'late' : 'paid')
            : isPastDue 
              ? 'missed' 
              : 'pending'
        };
      });

      return new Response(JSON.stringify({ cycles: cyclesWithStatus, memberId: memberData?.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
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