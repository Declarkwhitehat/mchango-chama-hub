import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { corsHeaders } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const celcomApiKey = Deno.env.get('CELCOM_API_KEY');
const celcomPartnerId = Deno.env.get('CELCOM_PARTNER_ID');
const celcomShortcode = Deno.env.get('CELCOM_SHORTCODE');

async function sendSMS(phone: string, message: string) {
  if (!celcomApiKey || !celcomPartnerId || !celcomShortcode) {
    console.error('SMS credentials not configured');
    return { success: false, error: 'SMS not configured' };
  }

  try {
    const response = await fetch('https://api.celcomafrica.com/v1/sms/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${celcomApiKey}`
      },
      body: JSON.stringify({
        partnerID: celcomPartnerId,
        shortCode: celcomShortcode,
        mobile: phone.startsWith('254') ? phone : `254${phone.replace(/^0+/, '')}`,
        message: message
      })
    });

    const data = await response.json();
    return { success: response.ok, messageId: data.messageId };
  } catch (error: any) {
    console.error('SMS error:', error);
    return { success: false, error: error.message };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    console.log('[CRON] Daily payout started at:', new Date().toISOString());

    const today = new Date().toISOString().split('T')[0];

    // Get all active daily chamas
    const { data: chamas, error: chamasError } = await supabase
      .from('chama')
      .select('id, name, contribution_amount, commission_rate')
      .eq('contribution_frequency', 'daily')
      .eq('status', 'active');

    if (chamasError) {
      console.error('Error fetching chamas:', chamasError);
      return new Response(JSON.stringify({ error: chamasError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    let payoutsProcessed = 0;
    let errors = 0;

    for (const chama of chamas || []) {
      // Get today's cycle
      const { data: cycle } = await supabase
        .from('contribution_cycles')
        .select(`
          *,
          beneficiary:chama_members!beneficiary_member_id(
            id,
            member_code,
            user_id,
            missed_payments_count,
            requires_admin_verification,
            profiles!chama_members_user_id_fkey(full_name, phone)
          )
        `)
        .eq('chama_id', chama.id)
        .gte('start_date', today)
        .lte('end_date', today)
        .eq('payout_processed', false)
        .maybeSingle();

      if (!cycle) {
        console.log(`No unprocessed cycle for chama ${chama.name}`);
        continue;
      }

      // Get payment status
      const { data: payments } = await supabase
        .from('member_cycle_payments')
        .select('*, chama_members!member_id(*)')
        .eq('cycle_id', cycle.id);

      const totalMembers = payments?.length || 0;
      const paidMembers = payments?.filter(p => p.is_paid && !p.is_late_payment) || [];
      const paidCount = paidMembers.length;
      const unpaidMembers = payments?.filter(p => !p.is_paid) || [];

      // Calculate payout amount
      const collectedAmount = paidMembers.reduce((sum, p) => sum + (p.amount_paid || 0), 0);
      const commissionRate = chama.commission_rate || 0.05;
      const commissionAmount = collectedAmount * commissionRate;
      const payoutAmount = collectedAmount - commissionAmount;

      const isFullPayout = paidCount === totalMembers;
      const payoutType = isFullPayout ? 'full' : 'partial';

      console.log(`Processing ${payoutType} payout for ${chama.name}: ${paidCount}/${totalMembers} paid, amount: ${payoutAmount}`);

      // Get beneficiary payment method
      const { data: paymentMethod } = await supabase
        .from('payment_methods')
        .select('*')
        .eq('user_id', cycle.beneficiary.user_id)
        .eq('is_default', true)
        .maybeSingle();

      if (!paymentMethod && payoutAmount > 0) {
        console.error(`No payment method for beneficiary ${cycle.beneficiary.member_code}`);
        errors++;
        continue;
      }

      // Create withdrawal request
      if (payoutAmount > 0) {
        const withdrawalStatus = cycle.beneficiary.requires_admin_verification ? 'pending' : 'approved';
        
        const { error: withdrawalError } = await supabase
          .from('withdrawals')
          .insert({
            chama_id: chama.id,
            requested_by: cycle.beneficiary.user_id,
            amount: collectedAmount,
            commission_amount: commissionAmount,
            net_amount: payoutAmount,
            status: withdrawalStatus,
            payment_method_id: paymentMethod?.id,
            payment_method_type: paymentMethod?.method_type,
            notes: `Daily payout - ${payoutType} (${paidCount}/${totalMembers} members paid)`,
            requested_at: new Date().toISOString(),
            ...(withdrawalStatus === 'approved' ? { reviewed_at: new Date().toISOString() } : {})
          });

        if (withdrawalError) {
          console.error('Error creating withdrawal:', withdrawalError);
          errors++;
          continue;
        }

        // Record commission earning
        await supabase.rpc('record_company_earning', {
          p_source: 'chama_commission',
          p_amount: commissionAmount,
          p_group_id: chama.id,
          p_description: `Daily payout commission - ${chama.name}`
        });
      }

      // Update cycle
      await supabase
        .from('contribution_cycles')
        .update({
          payout_processed: true,
          payout_processed_at: new Date().toISOString(),
          payout_amount: payoutAmount,
          payout_type: payoutType
        })
        .eq('id', cycle.id);

      // Send payout notification to beneficiary
      const beneficiaryPhone = cycle.beneficiary.profiles?.phone;
      if (beneficiaryPhone) {
        const message = isFullPayout
          ? `Your chama "${chama.name}" payout of KES ${payoutAmount.toFixed(2)} has been processed. Full payout - all members contributed! ${cycle.beneficiary.requires_admin_verification ? 'Pending admin approval.' : "You'll receive it shortly."}`
          : `Your chama "${chama.name}" payout of KES ${payoutAmount.toFixed(2)} has been processed. Partial payout (${paidCount}/${totalMembers} members paid). ${cycle.beneficiary.requires_admin_verification ? 'Pending admin approval.' : "You'll receive it shortly."}`;
        
        await sendSMS(beneficiaryPhone, message);
      }

      // Update missed payment counts for unpaid members
      for (const unpaid of unpaidMembers) {
        const member = unpaid.chama_members;
        const newMissedCount = (member.missed_payments_count || 0) + 1;

        await supabase
          .from('chama_members')
          .update({
            missed_payments_count: newMissedCount,
            requires_admin_verification: newMissedCount >= 1
          })
          .eq('id', member.id);

        // Alert manager if member missed 2 payments
        if (newMissedCount >= 2) {
          const { data: manager } = await supabase
            .from('chama_members')
            .select('profiles!chama_members_user_id_fkey(phone)')
            .eq('chama_id', chama.id)
            .eq('is_manager', true)
            .maybeSingle();

          if (manager?.profiles?.phone) {
            const alertMessage = `Alert: Member ${member.profiles?.full_name} (${member.member_code}) has missed ${newMissedCount} contributions in your Chama "${chama.name}". Please follow up.`;
            await sendSMS(manager.profiles.phone, alertMessage);
          }
        }
      }

      payoutsProcessed++;
    }

    console.log(`[CRON] Daily payout completed. Processed: ${payoutsProcessed}, Errors: ${errors}`);

    return new Response(JSON.stringify({
      success: true,
      payoutsProcessed,
      errors,
      processedChamas: chamas?.length || 0
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error in daily-payout-cron:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});