import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '').trim() || null;

    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Admin client for reliable JWT verification
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Verify user with service role
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Anon client for RLS-respecting database operations
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader! },
        },
        auth: {
          persistSession: false,
        },
      }
    );

    const { chamaId } = await req.json();

    if (!chamaId) {
      return new Response(
        JSON.stringify({ error: 'Chama ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user is manager of this chama
    const { data: membership, error: memberError } = await supabaseClient
      .from('chama_members')
      .select('is_manager, chama_id')
      .eq('chama_id', chamaId)
      .eq('user_id', user.id)
      .eq('is_manager', true)
      .eq('status', 'active')
      .eq('approval_status', 'approved')
      .maybeSingle();

    if (memberError || !membership) {
      return new Response(
        JSON.stringify({ error: 'Only the Chama manager can start the group' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get chama details with all approved members
    const { data: chama, error: chamaError } = await supabaseClient
      .from('chama')
      .select(`
        *,
        chama_members!chama_members_chama_id_fkey(
          id,
          user_id,
          order_index,
          member_code,
          is_manager,
          first_payment_completed,
          first_payment_at,
          approval_status,
          status,
          joined_at,
          profiles!chama_members_user_id_fkey(full_name, phone, email)
        )
      `)
      .eq('id', chamaId)
      .single();

    if (chamaError || !chama) {
      return new Response(
        JSON.stringify({ error: 'Chama not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if chama is already active
    if (chama.status === 'active') {
      return new Response(
        JSON.stringify({ error: 'Chama is already active' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ============================================
    // GET ALL APPROVED MEMBERS (no payment requirement)
    // ============================================
    const approvedMembers = (chama.chama_members || []).filter(
      (m: any) => m.approval_status === 'approved' && m.status !== 'removed'
    );

    console.log('Start Chama Analysis:', {
      chamaId,
      chamaName: chama.name,
      totalApproved: approvedMembers.length,
      minMembers: chama.min_members
    });

    // ============================================
    // VALIDATE MINIMUM APPROVED MEMBERS
    // ============================================
    const minMembers = chama.min_members || 2;
    if (approvedMembers.length < minMembers) {
      return new Response(
        JSON.stringify({ 
          error: `Cannot start: Need at least ${minMembers} approved members`,
          details: {
            required: minMembers,
            approved: approvedMembers.length,
            message: `${minMembers - approvedMembers.length} more approved member(s) needed before you can start.`
          }
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const startDate = new Date();

    // ============================================
    // CALCULATE GRACE PERIOD END (24hrs from start, cutoff at 22:00)
    // Members get until 10:00 PM the next day to make their first payment
    // ============================================
    const graceDeadline = new Date(startDate);
    graceDeadline.setDate(graceDeadline.getDate() + 1);
    graceDeadline.setHours(22, 0, 0, 0); // 10:00 PM cutoff

    console.log('Grace period:', {
      startDate: startDate.toISOString(),
      graceDeadline: graceDeadline.toISOString(),
    });

    // ============================================
    // ASSIGN ORDER INDICES TO ALL APPROVED MEMBERS
    // Randomized via Fisher-Yates shuffle for fairness
    // ============================================
    const sortedMembers = [...approvedMembers];
    // Fisher-Yates shuffle — cryptographically fair randomization
    for (let i = sortedMembers.length - 1; i > 0; i--) {
      const randomBytes = new Uint32Array(1);
      crypto.getRandomValues(randomBytes);
      const j = randomBytes[0] % (i + 1);
      [sortedMembers[i], sortedMembers[j]] = [sortedMembers[j], sortedMembers[i]];
    }

    console.log('Randomized payout order:', sortedMembers.map((m: any, i: number) => ({
      position: i + 1,
      name: m.profiles?.full_name,
      memberId: m.id
    })));

    // Assign sequential order indices and generate member codes
    for (let i = 0; i < sortedMembers.length; i++) {
      const member = sortedMembers[i];
      const newIndex = i + 1;

      console.log('Assigning member order:', {
        memberId: member.id,
        name: member.profiles?.full_name,
        newIndex: newIndex,
        joinedAt: member.joined_at
      });

      // Generate new member code using DB function
      const { data: newMemberCode } = await supabaseClient
        .rpc('generate_member_code', {
          p_chama_id: chamaId,
          p_order_index: newIndex
        });

      await supabaseClient
        .from('chama_members')
        .update({
          order_index: newIndex,
          member_code: newMemberCode || member.member_code,
          status: 'active'
        })
        .eq('id', member.id);
    }

    // ============================================
    // UPDATE CHAMA STATUS
    // ============================================
    const { error: updateChamaError } = await supabaseClient
      .from('chama')
      .update({ 
        status: 'active',
        start_date: startDate.toISOString()
      })
      .eq('id', chamaId);

    if (updateChamaError) {
      throw updateChamaError;
    }

    // ============================================
    // CREATE FIRST CONTRIBUTION CYCLE
    // ============================================
    const cycleEndDate = calculateCycleEndDate(startDate, chama.contribution_frequency, chama.every_n_days_count, chama.monthly_contribution_day, chama.monthly_contribution_day_2);
    
    const { data: firstCycle, error: cycleError } = await supabaseClient
      .from('contribution_cycles')
      .insert({
        chama_id: chamaId,
        cycle_number: 1,
        start_date: startDate.toISOString(),
        end_date: cycleEndDate.toISOString(),
        due_amount: chama.contribution_amount,
        beneficiary_member_id: sortedMembers[0]?.id || null, // First member gets first payout
        total_expected_amount: chama.contribution_amount * sortedMembers.length,
        total_collected_amount: 0,
        members_paid_count: 0,
        members_skipped_count: 0
      })
      .select()
      .single();

    if (cycleError) {
      console.error('Error creating first cycle:', cycleError);
    }

    // ============================================
    // CREATE MEMBER CYCLE PAYMENTS FOR ALL MEMBERS
    // ============================================
    if (firstCycle) {
      const memberPayments = sortedMembers.map((member: any) => ({
        member_id: member.id,
        cycle_id: firstCycle.id,
        amount_due: chama.contribution_amount,
        amount_paid: 0,
        amount_remaining: chama.contribution_amount,
        is_paid: false,
        fully_paid: false,
        is_late_payment: false,
        payment_allocations: []
      }));

      const { error: paymentsError } = await supabaseAdmin
        .from('member_cycle_payments')
        .insert(memberPayments);

      if (paymentsError) {
        console.error('Error creating member cycle payments:', paymentsError);
      } else {
        console.log(`Created ${memberPayments.length} member_cycle_payments for cycle 1`);
      }
    }

    // ============================================
    // SEND START NOTIFICATIONS TO ALL MEMBERS
    // ============================================
    const frequencyText = chama.contribution_frequency === 'every_n_days' 
      ? `every ${chama.every_n_days_count} days`
      : chama.contribution_frequency;

    const cycleLength = getCycleLengthInDays(chama.contribution_frequency, chama.every_n_days_count);

    for (let i = 0; i < sortedMembers.length; i++) {
      const member = sortedMembers[i];
      const memberIndex = i + 1;
      
      // Calculate payout date based on position
      const daysUntilPayout = (memberIndex - 1) * cycleLength;
      const payoutDate = new Date(startDate);
      payoutDate.setDate(payoutDate.getDate() + daysUntilPayout);

      const message = `🎉 "${chama.name}" has started! You are Member #${memberIndex}. Contribute KES ${chama.contribution_amount.toLocaleString()} ${frequencyText}. Your payout date: ${payoutDate.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}. ${i === 0 ? 'You are first in line - make your contribution now!' : `${memberIndex - 1} member(s) before you.`}`;

      if (member.profiles?.phone) {
        try {
          await supabaseClient.functions.invoke('send-transactional-sms', {
            body: {
              phone: member.profiles.phone,
              message,
              eventType: 'chama_started',
            },
          });
          console.log(`SMS sent to ${member.profiles.full_name}`);
        } catch (smsError) {
          console.error(`Failed to send SMS to ${member.profiles.full_name}:`, smsError);
        }
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Chama started successfully',
        summary: {
          activeMembers: sortedMembers.length,
          removedMembers: 0,
          firstCycleId: firstCycle?.id || null,
          startDate: startDate.toISOString(),
          firstPayoutDate: cycleEndDate.toISOString(),
          firstBeneficiary: sortedMembers[0]?.profiles?.full_name || 'Unknown'
        },
        notificationsSent: sortedMembers.length
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error starting chama:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to start chama', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function getCycleLengthInDays(frequency: string, everyNDays?: number): number {
  switch (frequency) {
    case 'daily': return 1;
    case 'weekly': return 7;
    case 'monthly': return 30;
    case 'twice_monthly': return 15;
    case 'every_n_days': return everyNDays || 7;
    default: return 7;
  }
}

function calculateCycleEndDate(
  startDate: Date, 
  frequency: string, 
  everyNDays?: number,
  monthlyDay?: number | null,
  monthlyDay2?: number | null
): Date {
  const endDate = new Date(startDate);
  if (frequency === 'daily') {
    endDate.setHours(23, 59, 59, 999);
  } else if (frequency === 'monthly' && monthlyDay) {
    // Cycle runs from monthlyDay of current month to (monthlyDay - 1) of next month
    endDate.setMonth(endDate.getMonth() + 1);
    endDate.setDate(monthlyDay - 1);
    endDate.setHours(23, 59, 59, 999);
  } else if (frequency === 'twice_monthly' && monthlyDay && monthlyDay2) {
    const day1 = Math.min(monthlyDay, monthlyDay2);
    const day2 = Math.max(monthlyDay, monthlyDay2);
    const currentDay = startDate.getDate();
    if (currentDay >= day1 && currentDay < day2) {
      // Current half: day1 to day2-1
      endDate.setDate(day2 - 1);
      endDate.setHours(23, 59, 59, 999);
    } else {
      // Second half: day2 to day1-1 of next month
      if (currentDay >= day2) {
        endDate.setMonth(endDate.getMonth() + 1);
      }
      endDate.setDate(day1 - 1);
      endDate.setHours(23, 59, 59, 999);
    }
  } else {
    const cycleDays = getCycleLengthInDays(frequency, everyNDays);
    endDate.setDate(endDate.getDate() + cycleDays - 1);
    endDate.setHours(23, 59, 59, 999);
  }
  return endDate;
}
