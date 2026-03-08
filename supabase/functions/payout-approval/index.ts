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
    const body = await req.json();
    const { action } = body;

    // ========== LIST PENDING REQUESTS ==========
    if (action === 'list') {
      const { status: filterStatus } = body;
      
      let query = supabase
        .from('payout_approval_requests')
        .select(`
          *,
          chama:chama!payout_approval_requests_chama_id_fkey(id, name, contribution_amount, group_code),
          cycle:contribution_cycles!payout_approval_requests_cycle_id_fkey(cycle_number, start_date, end_date),
          scheduled_member:chama_members!payout_approval_requests_scheduled_beneficiary_id_fkey(
            id, member_code, user_id,
            profiles!chama_members_user_id_fkey(full_name, phone)
          ),
          chosen_member_detail:chama_members!payout_approval_requests_chosen_member_id_fkey(
            id, member_code, user_id,
            profiles!chama_members_user_id_fkey(full_name, phone)
          ),
          reviewer:profiles!payout_approval_requests_reviewed_by_fkey(full_name)
        `)
        .order('created_at', { ascending: false });

      if (filterStatus) {
        query = query.eq('status', filterStatus);
      }

      const { data, error } = await query;

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ requests: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ========== GET ELIGIBLE MEMBERS FOR A CHAMA ==========
    if (action === 'get-eligible-members') {
      const { chamaId } = body;

      const { data: chama } = await supabase
        .from('chama')
        .select('contribution_amount')
        .eq('id', chamaId)
        .single();

      if (!chama) {
        return new Response(JSON.stringify({ error: 'Chama not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { data: members } = await supabase
        .from('chama_members')
        .select(`
          id, member_code, order_index, missed_payments_count, was_skipped,
          profiles!chama_members_user_id_fkey(full_name, phone)
        `)
        .eq('chama_id', chamaId)
        .eq('status', 'active')
        .eq('approval_status', 'approved')
        .order('order_index');

      const membersWithEligibility = [];
      for (const m of (members || [])) {
        const { data: unpaid } = await supabase
          .from('member_cycle_payments')
          .select('id')
          .eq('member_id', m.id)
          .eq('fully_paid', false);

        const { data: debts } = await supabase
          .from('chama_member_debts')
          .select('id')
          .eq('member_id', m.id)
          .eq('chama_id', chamaId)
          .in('status', ['outstanding', 'partial'])
          .limit(1);

        const hasDebts = (debts && debts.length > 0);
        const unpaidCount = unpaid?.length || 0;
        const isEligible = unpaidCount === 0 && !hasDebts;

        membersWithEligibility.push({
          ...m,
          is_eligible: isEligible,
          unpaid_cycles: unpaidCount,
          has_debts: hasDebts,
        });
      }

      return new Response(JSON.stringify({ members: membersWithEligibility }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ========== APPROVE ==========
    if (action === 'approve') {
      const { requestId, chosenMemberId, adminNotes, adminUserId } = body;

      if (!requestId || !chosenMemberId) {
        return new Response(JSON.stringify({ error: 'requestId and chosenMemberId required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Get the approval request
      const { data: request, error: reqError } = await supabase
        .from('payout_approval_requests')
        .select('*, chama:chama!payout_approval_requests_chama_id_fkey(id, name, available_balance)')
        .eq('id', requestId)
        .eq('status', 'pending')
        .single();

      if (reqError || !request) {
        return new Response(JSON.stringify({ error: 'Request not found or already processed' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Get chosen member details
      const { data: chosenMember } = await supabase
        .from('chama_members')
        .select(`
          id, member_code, user_id, order_index, missed_payments_count, requires_admin_verification,
          profiles!chama_members_user_id_fkey(full_name, phone)
        `)
        .eq('id', chosenMemberId)
        .single();

      if (!chosenMember) {
        return new Response(JSON.stringify({ error: 'Chosen member not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Get payment method
      const { data: paymentMethod } = await supabase
        .from('payment_methods')
        .select('*')
        .eq('user_id', chosenMember.user_id)
        .eq('is_default', true)
        .maybeSingle();

      const payoutAmount = request.chama?.available_balance || request.payout_amount || 0;

      if (payoutAmount <= 0) {
        return new Response(JSON.stringify({ error: 'No available balance for payout' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Create withdrawal
      const canAutoB2C = paymentMethod?.method_type === 'mpesa';
      const withdrawalStatus = canAutoB2C ? 'approved' : 'pending';

      const { data: withdrawal, error: wError } = await supabase
        .from('withdrawals')
        .insert({
          chama_id: request.chama_id,
          cycle_id: request.cycle_id,
          requested_by: chosenMember.user_id,
          amount: payoutAmount,
          commission_amount: 0,
          net_amount: payoutAmount,
          status: withdrawalStatus,
          payment_method_id: paymentMethod?.id,
          payment_method_type: paymentMethod?.method_type,
          notes: `Admin-approved payout. Chosen member: ${chosenMember.member_code}. ${adminNotes || ''}`,
          requested_at: new Date().toISOString(),
          reviewed_at: new Date().toISOString(),
          b2c_attempt_count: 0,
        })
        .select('id')
        .single();

      if (wError) {
        if (wError.code === '23505') {
          return new Response(JSON.stringify({ error: 'Payout already exists for this cycle' }), {
            status: 409,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        return new Response(JSON.stringify({ error: wError.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Update cycle
      await supabase
        .from('contribution_cycles')
        .update({
          beneficiary_member_id: chosenMemberId,
          payout_amount: payoutAmount,
          payout_type: 'admin_approved',
        })
        .eq('id', request.cycle_id);

      // Financial ledger entry
      await supabase.from('financial_ledger').insert({
        transaction_type: 'payout',
        source_type: 'chama',
        source_id: request.chama_id,
        gross_amount: payoutAmount,
        commission_amount: 0,
        net_amount: payoutAmount,
        commission_rate: 0,
        reference_id: withdrawal.id,
        description: `Admin-approved Cycle payout to ${chosenMember.member_code} (${chosenMember.profiles?.full_name})`,
      });

      // Trigger B2C if M-Pesa
      let b2cResult: any = null;
      if (canAutoB2C && paymentMethod?.phone_number) {
        try {
          const b2cResponse = await fetch(`${supabaseUrl}/functions/v1/b2c-payout`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseServiceKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              withdrawal_id: withdrawal.id,
              phone_number: paymentMethod.phone_number,
              amount: payoutAmount,
            }),
          });

          b2cResult = await b2cResponse.json();

          if (!b2cResponse.ok || !b2cResult.success) {
            await supabase
              .from('withdrawals')
              .update({
                status: 'pending_retry',
                b2c_attempt_count: 1,
                last_b2c_attempt_at: new Date().toISOString(),
                b2c_error_details: { error: b2cResult.error || 'B2C failed' },
              })
              .eq('id', withdrawal.id);
          } else {
            console.log(`✅ B2C initiated for admin-approved payout: ${b2cResult.conversation_id}`);
          }
        } catch (e: any) {
          console.error('B2C error:', e);
          await supabase
            .from('withdrawals')
            .update({
              status: 'pending_retry',
              b2c_attempt_count: 1,
              last_b2c_attempt_at: new Date().toISOString(),
              b2c_error_details: { error: e.message },
            })
            .eq('id', withdrawal.id);
        }
      }

      // Update approval request
      await supabase
        .from('payout_approval_requests')
        .update({
          status: 'approved',
          chosen_member_id: chosenMemberId,
          admin_notes: adminNotes || null,
          reviewed_by: adminUserId || null,
          reviewed_at: new Date().toISOString(),
          withdrawal_id: withdrawal.id,
          b2c_triggered: canAutoB2C,
          updated_at: new Date().toISOString(),
        })
        .eq('id', requestId);

      // Audit log
      await supabase.from('audit_logs').insert({
        action: 'PAYOUT_ADMIN_APPROVED',
        table_name: 'payout_approval_requests',
        record_id: requestId,
        user_id: adminUserId || null,
        new_values: {
          chosen_member: chosenMember.member_code,
          payout_amount: payoutAmount,
          withdrawal_id: withdrawal.id,
          b2c_triggered: canAutoB2C,
        },
      });

      // Notify chosen member
      if (chosenMember.user_id) {
        await supabase.from('notifications').insert({
          user_id: chosenMember.user_id,
          title: 'Payout Approved',
          message: `You have been selected to receive the chama "${request.chama?.name}" payout of KES ${payoutAmount.toFixed(2)}. ${canAutoB2C ? 'Payment is being processed via M-Pesa.' : 'Payment will be processed shortly.'}`,
          type: 'success',
          category: 'chama',
          related_entity_id: request.chama_id,
          related_entity_type: 'chama',
        });
      }

      return new Response(JSON.stringify({
        success: true,
        withdrawal_id: withdrawal.id,
        payout_amount: payoutAmount,
        b2c_triggered: canAutoB2C,
        b2c_result: b2cResult,
        chosen_member: chosenMember.member_code,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ========== REJECT ==========
    if (action === 'reject') {
      const { requestId, adminNotes, adminUserId } = body;

      const { error } = await supabase
        .from('payout_approval_requests')
        .update({
          status: 'rejected',
          admin_notes: adminNotes || 'Rejected by admin',
          reviewed_by: adminUserId || null,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', requestId)
        .eq('status', 'pending');

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      await supabase.from('audit_logs').insert({
        action: 'PAYOUT_ADMIN_REJECTED',
        table_name: 'payout_approval_requests',
        record_id: requestId,
        user_id: adminUserId || null,
        new_values: { reason: adminNotes },
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Payout approval error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
