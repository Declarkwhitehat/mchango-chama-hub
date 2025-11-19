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
    console.log('[CRON] Daily reminder started at:', new Date().toISOString());

    // Get today's date
    const today = new Date().toISOString().split('T')[0];

    // Get all active daily chamas
    const { data: chamas, error: chamasError } = await supabase
      .from('chama')
      .select('id, name, contribution_amount')
      .eq('contribution_frequency', 'daily')
      .eq('status', 'active');

    if (chamasError) {
      console.error('Error fetching chamas:', chamasError);
      return new Response(JSON.stringify({ error: chamasError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    let remindersSent = 0;
    let errors = 0;

    for (const chama of chamas || []) {
      // Get today's cycle
      const { data: cycle } = await supabase
        .from('contribution_cycles')
        .select('id')
        .eq('chama_id', chama.id)
        .gte('start_date', today)
        .lte('end_date', today)
        .maybeSingle();

      if (!cycle) {
        console.log(`No cycle found for chama ${chama.name}`);
        continue;
      }

      // Get unpaid members
      const { data: unpaidPayments } = await supabase
        .from('member_cycle_payments')
        .select(`
          *,
          chama_members!member_id(
            id,
            member_code,
            user_id,
            profiles!chama_members_user_id_fkey(full_name, phone)
          )
        `)
        .eq('cycle_id', cycle.id)
        .eq('is_paid', false)
        .is('reminder_sent_at', null);

      console.log(`Found ${unpaidPayments?.length || 0} unpaid members for ${chama.name}`);

      // Send reminders
      for (const payment of unpaidPayments || []) {
        const member = payment.chama_members;
        const profile = member?.profiles;

        if (!profile?.phone) {
          console.log(`No phone for member ${member?.member_code}`);
          continue;
        }

        const message = `Hi ${profile.full_name}, reminder: Your contribution of KES ${payment.amount_due} is due today. Pay via M-Pesa or online. Member ID: ${member.member_code}`;

        const smsResult = await sendSMS(profile.phone, message);
        
        if (smsResult.success) {
          // Update reminder_sent_at
          await supabase
            .from('member_cycle_payments')
            .update({ reminder_sent_at: new Date().toISOString() })
            .eq('id', payment.id);

          remindersSent++;
          console.log(`Reminder sent to ${member.member_code}`);
        } else {
          errors++;
          console.error(`Failed to send reminder to ${member.member_code}:`, smsResult.error);
        }

        // Rate limit - wait 500ms between SMS
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.log(`[CRON] Daily reminder completed. Sent: ${remindersSent}, Errors: ${errors}`);

    return new Response(JSON.stringify({ 
      success: true, 
      remindersSent,
      errors,
      processedChamas: chamas?.length || 0
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error in daily-reminder-cron:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});