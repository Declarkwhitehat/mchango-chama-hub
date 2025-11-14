import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const COMMISSION_RATE = 0.01; // 1% commission

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const method = req.method;

    // POST endpoint removed - deposits are now created via mpesa-stk-push function
    // Deposits are created when STK Push is initiated, then updated by callback
    if (false) { // Disabled
      const groupId = pathParts[0];
      const body = await req.json();
      const { amount, saved_for_member_id, payment_reference } = body;

      // Validation
      if (!amount || amount <= 0) {
        throw new Error('Invalid amount');
      }
      if (amount > 1000000) {
        throw new Error('Amount exceeds maximum limit');
      }
      if (!payment_reference || payment_reference.length > 100) {
        throw new Error('Invalid payment reference');
      }

      // Verify member exists and user is authorized
      const { data: member } = await supabase
        .from('saving_group_members')
        .select('*, saving_groups!saving_group_members_group_id_fkey(*)')
        .eq('group_id', groupId)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single();

      if (!member) {
        throw new Error('Member not found or not authorized');
      }

      const group = member.saving_groups as any;

      // Calculate commission and net amount
      const commissionAmount = amount * COMMISSION_RATE;
      const netAmount = amount - commissionAmount;

      // Get the member being saved for (default to self)
      let beneficiaryMemberId = member.id;
      let beneficiaryUserId = user.id;

      if (saved_for_member_id) {
        const { data: beneficiary } = await supabase
          .from('saving_group_members')
          .select('id, user_id')
          .eq('id', saved_for_member_id)
          .eq('group_id', groupId)
          .eq('status', 'active')
          .single();

        if (!beneficiary) {
          throw new Error('Beneficiary member not found');
        }

        beneficiaryMemberId = beneficiary.id;
        beneficiaryUserId = beneficiary.user_id;
      }

      // Insert deposit
      const { data: deposit, error: depositError } = await supabase
        .from('saving_group_deposits')
        .insert({
          saving_group_id: groupId,
          member_user_id: beneficiaryUserId,
          payer_user_id: user.id,
          amount,
          commission_amount: commissionAmount,
          net_amount: netAmount,
          saved_for_member_id: saved_for_member_id || null,
        })
        .select()
        .single();

      if (depositError) throw depositError;

      // Update member's savings
      const { error: memberUpdateError } = await supabase
        .from('saving_group_members')
        .update({
          current_savings: member.current_savings + netAmount,
          lifetime_deposits: member.lifetime_deposits + netAmount,
        })
        .eq('id', beneficiaryMemberId);

      if (memberUpdateError) throw memberUpdateError;

      // Update group total savings
      const { error: groupUpdateError } = await supabase
        .from('saving_groups')
        .update({
          total_savings: group.total_savings + netAmount,
        })
        .eq('id', groupId);

      if (groupUpdateError) throw groupUpdateError;

      // Record transaction
      await supabase
        .from('saving_group_transactions')
        .insert({
          group_id: groupId,
          member_id: beneficiaryMemberId,
          transaction_type: 'SAVING',
          amount: netAmount,
          reference_id: deposit.id,
          notes: saved_for_member_id ? `Saved by another member` : null,
        });

      // Record company earning
      await supabase.rpc('record_company_earning', {
        p_source: 'COMMISSION',
        p_amount: commissionAmount,
        p_group_id: groupId,
        p_reference_id: deposit.id,
        p_description: `1% commission on deposit of KES ${amount}`,
      });

      console.log(`Deposit of KES ${amount} recorded for group ${groupId}, member ${beneficiaryMemberId}`);

      // Send SMS notification to beneficiary if different from payer
      if (saved_for_member_id && beneficiaryUserId !== user.id) {
        const { data: beneficiaryProfile } = await supabase
          .from('profiles')
          .select('phone, full_name')
          .eq('id', beneficiaryUserId)
          .single();

        if (beneficiaryProfile?.phone) {
          await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-transactional-sms`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
            },
            body: JSON.stringify({
              phone: beneficiaryProfile.phone,
              message: `KES ${netAmount.toLocaleString()} has been saved on your behalf in ${group.name}. New balance: KES ${(member.current_savings + netAmount).toLocaleString()}`,
            }),
          });
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          deposit,
          commission: commissionAmount,
          net_amount: netAmount,
          new_balance: member.current_savings + netAmount,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // GET /members/:memberId/savings - Get savings history
    if (method === 'GET' && pathParts.length === 2 && pathParts[1] === 'savings') {
      const memberId = pathParts[0];

      // Verify member belongs to user
      const { data: member } = await supabase
        .from('saving_group_members')
        .select('*')
        .eq('id', memberId)
        .eq('user_id', user.id)
        .single();

      if (!member) {
        throw new Error('Member not found or unauthorized');
      }

      // Get all deposits for this member
      const { data: deposits } = await supabase
        .from('saving_group_deposits')
        .select(`
          *,
          payer:profiles!saving_group_deposits_payer_user_id_fkey(full_name, phone)
        `)
        .eq('member_user_id', user.id)
        .eq('saving_group_id', member.group_id)
        .order('created_at', { ascending: false });

      // Get deposits made by this user for others
      const { data: depositsForOthers } = await supabase
        .from('saving_group_deposits')
        .select(`
          *,
          beneficiary:profiles!saving_group_deposits_member_user_id_fkey(full_name, phone)
        `)
        .eq('payer_user_id', user.id)
        .eq('saving_group_id', member.group_id)
        .neq('member_user_id', user.id)
        .order('created_at', { ascending: false });

      const totalSaved = deposits?.reduce((sum, d) => sum + Number(d.net_amount), 0) || 0;
      const totalSavedForOthers = depositsForOthers?.reduce((sum, d) => sum + Number(d.net_amount), 0) || 0;

      console.log(`Savings history retrieved for member ${memberId}`);

      return new Response(
        JSON.stringify({
          success: true,
          deposits,
          deposits_for_others: depositsForOthers,
          statistics: {
            total_saved: totalSaved,
            total_saved_for_others: totalSavedForOthers,
            current_balance: member.current_savings,
            lifetime_deposits: member.lifetime_deposits,
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    throw new Error('Invalid endpoint');

  } catch (error) {
    console.error('Error:', error);
    const message = error instanceof Error ? error.message : 'An error occurred';
    return new Response(
      JSON.stringify({ error: message }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
