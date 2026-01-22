import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: authHeader ? { Authorization: authHeader } : {},
        },
        auth: {
          persistSession: false,
        },
      }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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
    // SPLIT MEMBERS INTO PAID AND UNPAID
    // ============================================
    const approvedMembers = (chama.chama_members || []).filter(
      (m: any) => m.approval_status === 'approved'
    );

    const paidMembers = approvedMembers.filter((m: any) => m.first_payment_completed === true);
    const unpaidMembers = approvedMembers.filter((m: any) => m.first_payment_completed !== true);

    console.log('Start Chama Analysis:', {
      chamaId,
      chamaName: chama.name,
      totalApproved: approvedMembers.length,
      paidCount: paidMembers.length,
      unpaidCount: unpaidMembers.length,
      minMembers: chama.min_members
    });

    // ============================================
    // VALIDATE MINIMUM MEMBERS
    // ============================================
    if (paidMembers.length < (chama.min_members || 2)) {
      return new Response(
        JSON.stringify({ 
          error: `Cannot start: Need at least ${chama.min_members || 2} members who have paid their first contribution`,
          details: {
            required: chama.min_members || 2,
            paid: paidMembers.length,
            unpaid: unpaidMembers.length,
            message: `${(chama.min_members || 2) - paidMembers.length} more members need to make their first payment before you can start.`
          }
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const startDate = new Date();
    const removedMemberIds: string[] = [];
    const removalNotifications: Promise<any>[] = [];

    // ============================================
    // REMOVE UNPAID MEMBERS
    // ============================================
    for (const member of unpaidMembers) {
      console.log('Removing unpaid member:', {
        memberId: member.id,
        userId: member.user_id,
        name: member.profiles?.full_name
      });

      // Update member status to 'removed'
      const { error: updateError } = await supabaseClient
        .from('chama_members')
        .update({
          status: 'removed',
          removal_reason: 'NO_FIRST_PAYMENT',
          removed_at: startDate.toISOString(),
          order_index: null, // Clear any order index
          member_code: null, // Clear member code
        })
        .eq('id', member.id);

      if (updateError) {
        console.error('Error updating member status:', updateError);
        continue;
      }

      removedMemberIds.push(member.id);

      // Create removal audit record
      await supabaseClient
        .from('chama_member_removals')
        .insert({
          chama_id: chamaId,
          member_id: member.id,
          user_id: member.user_id,
          removal_reason: 'NO_FIRST_PAYMENT',
          removed_at: startDate.toISOString(),
          was_manager: member.is_manager || false,
          member_name: member.profiles?.full_name || 'Unknown',
          member_phone: member.profiles?.phone || null,
          chama_name: chama.name,
          notification_sent: !!member.profiles?.phone
        });

      // Send removal SMS notification
      if (member.profiles?.phone) {
        const smsPromise = supabaseClient.functions.invoke('send-transactional-sms', {
          body: {
            phone: member.profiles.phone,
            message: `You were removed from "${chama.name}" because you did not pay your first contribution of KES ${chama.contribution_amount.toLocaleString()} before the chama started. You may request to join again in the next cycle.`,
            eventType: 'member_removed_no_payment'
          }
        }).catch(err => {
          console.error(`Failed to send removal SMS to ${member.profiles.full_name}:`, err);
        });
        
        removalNotifications.push(smsPromise);
      }
    }

    // Wait for all removal notifications to complete
    await Promise.allSettled(removalNotifications);

    // ============================================
    // VERIFY & RESEQUENCE PAID MEMBERS
    // ============================================
    // Ensure all paid members have sequential order indices
    const sortedPaidMembers = paidMembers.sort((a: any, b: any) => {
      // Sort by first_payment_at to maintain payment order
      const aTime = a.first_payment_at ? new Date(a.first_payment_at).getTime() : 0;
      const bTime = b.first_payment_at ? new Date(b.first_payment_at).getTime() : 0;
      return aTime - bTime;
    });

    // Resequence order indices to ensure no gaps
    for (let i = 0; i < sortedPaidMembers.length; i++) {
      const member = sortedPaidMembers[i];
      const expectedIndex = i + 1;

      if (member.order_index !== expectedIndex) {
        console.log('Resequencing member:', {
          memberId: member.id,
          oldIndex: member.order_index,
          newIndex: expectedIndex
        });

        // Generate new member code if needed (uses DB function with new format)
        const { data: newMemberCode } = await supabaseClient
          .rpc('generate_member_code', {
            p_chama_id: chamaId,
            p_order_index: expectedIndex
          });

        await supabaseClient
          .from('chama_members')
          .update({
            order_index: expectedIndex,
            member_code: newMemberCode || member.member_code, // Keep existing code if RPC fails
            status: 'active' // Ensure status is active
          })
          .eq('id', member.id);
      } else {
        // Ensure status is active
        await supabaseClient
          .from('chama_members')
          .update({ status: 'active' })
          .eq('id', member.id);
      }
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
    const cycleEndDate = calculateCycleEndDate(startDate, chama.contribution_frequency, chama.every_n_days_count);
    
    const { data: firstCycle, error: cycleError } = await supabaseClient
      .from('contribution_cycles')
      .insert({
        chama_id: chamaId,
        cycle_number: 1,
        start_date: startDate.toISOString(),
        end_date: cycleEndDate.toISOString(),
        due_amount: chama.contribution_amount,
        beneficiary_member_id: sortedPaidMembers[0]?.id || null, // First member gets first payout
        total_expected_amount: chama.contribution_amount * sortedPaidMembers.length,
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
    // SEND START NOTIFICATIONS TO ACTIVE MEMBERS
    // ============================================
    const frequencyText = chama.contribution_frequency === 'every_n_days' 
      ? `every ${chama.every_n_days_count} days`
      : chama.contribution_frequency;

    const cycleLength = getCycleLengthInDays(chama.contribution_frequency, chama.every_n_days_count);

    for (let i = 0; i < sortedPaidMembers.length; i++) {
      const member = sortedPaidMembers[i];
      const memberIndex = i + 1;
      
      // Calculate payout date based on position
      const daysUntilPayout = (memberIndex - 1) * cycleLength;
      const payoutDate = new Date(startDate);
      payoutDate.setDate(payoutDate.getDate() + daysUntilPayout);

      const message = `🎉 "${chama.name}" has started! You are Member #${memberIndex}. You will contribute KES ${chama.contribution_amount.toLocaleString()} ${frequencyText}. Your payout date: ${payoutDate.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}. ${i === 0 ? 'You are first in line!' : `${memberIndex - 1} member(s) before you.`}`;

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
          activeMembers: sortedPaidMembers.length,
          removedMembers: unpaidMembers.length,
          removedMemberIds,
          firstCycleId: firstCycle?.id || null,
          startDate: startDate.toISOString(),
          firstPayoutDate: cycleEndDate.toISOString(),
          firstBeneficiary: sortedPaidMembers[0]?.profiles?.full_name || 'Unknown'
        },
        notificationsSent: sortedPaidMembers.length + unpaidMembers.length
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
    case 'every_n_days': return everyNDays || 7;
    default: return 7;
  }
}

function calculateCycleEndDate(startDate: Date, frequency: string, everyNDays?: number): Date {
  const endDate = new Date(startDate);
  const cycleDays = getCycleLengthInDays(frequency, everyNDays);
  endDate.setDate(endDate.getDate() + cycleDays);
  return endDate;
}
