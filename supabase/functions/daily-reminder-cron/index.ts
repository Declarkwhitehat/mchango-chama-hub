import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { corsHeaders } from '../_shared/cors.ts';
import { createNotification, NotificationTemplates } from '../_shared/notifications.ts';

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

function formatEatDeadline(input: string): string {
  return new Date(input).toLocaleTimeString('en-KE', {
    timeZone: 'Africa/Nairobi',
    hour: 'numeric',
    minute: '2-digit',
  });
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

    // Get all active chamas (all frequencies)
    const { data: chamas, error: chamasError } = await supabase
      .from('chama')
      .select('id, name, contribution_amount, contribution_frequency')
      .eq('status', 'active');

    if (chamasError) {
      console.error('Error fetching chamas:', chamasError);
      return new Response(JSON.stringify({ error: chamasError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    let remindersSent = 0;
    let notificationsCreated = 0;
    let errors = 0;

    // Parse slot from body for slot-specific behavior (1205 = midday, 1815 = evening)
    let slot: string | null = null;
    try {
      const body = await req.clone().json();
      slot = body?.slot ?? null;
    } catch (_) { /* no body */ }
    console.log('[CRON] Slot:', slot ?? 'default');

    for (const chama of chamas || []) {
      // Get current active cycle (must include start_date for grace-period check)
      const { data: cycle } = await supabase
        .from('contribution_cycles')
        .select('id, start_date, end_date')
        .eq('chama_id', chama.id)
        .lte('start_date', today)
        .gte('end_date', today)
        .eq('payout_processed', false)
        .maybeSingle();

      if (!cycle) {
        console.log(`No cycle found for chama ${chama.name}`);
        continue;
      }

      // Skip reminders only during the first 24h after cycle start.
      // Bug-fix: previously start_date was not selected so this guard fell
      // back to today midnight UTC and silently skipped every reminder.
      if (cycle.start_date) {
        const gracePeriodEnd = new Date(new Date(cycle.start_date).getTime() + 24 * 60 * 60 * 1000);
        if (new Date() < gracePeriodEnd) {
          console.log(`Skipping reminder for ${chama.name} — still in 24h grace window`);
          continue;
        }
      }

      const cycleDeadline = new Date(cycle.end_date);
      if (new Date() >= cycleDeadline) {
        console.log(`Skipping reminder for ${chama.name} — cycle deadline already passed`);
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
        .eq('is_paid', false);
      // Note: both 12:05 and 18:15 slots should fire; rely on is_paid only.

      console.log(`Found ${unpaidPayments?.length || 0} unpaid members for ${chama.name}`);

      // Send reminders
      for (const payment of unpaidPayments || []) {
        const member = payment.chama_members;
        const profile = member?.profiles;
        const userId = member?.user_id;

        if (!profile?.full_name) {
          console.log(`No profile for member ${member?.member_code}`);
          continue;
        }

        const dueTime = formatEatDeadline(cycle.end_date);

        // Create in-app notification if user_id exists
        if (userId) {
          const notificationData = NotificationTemplates.paymentReminder(
            payment.amount_due,
            chama.name,
            dueTime
          );

          await createNotification(supabase, {
            userId,
            ...notificationData,
            relatedEntityId: chama.id,
            relatedEntityType: 'chama',
          });

          notificationsCreated++;
          console.log(`In-app notification created for ${member.member_code}`);
        }

        // Send SMS via the platform-standard send-transactional-sms (Onfon)
        if (profile?.phone) {
          const firstName = (profile.full_name || '').split(' ')[0] || 'Member';
          const slotLabel = slot === '1815'
            ? `Final reminder: pay before ${dueTime} today.`
            : `Deadline: ${dueTime} today.`;
          const message = `Hi ${firstName}, KES ${payment.amount_due} due for ${chama.name}. ${slotLabel} Pay via Paybill 4015351, Account: ${member.member_code}. Or pay in-app.`;

          try {
            const { error: smsError } = await supabase.functions.invoke('send-transactional-sms', {
              body: { phone: profile.phone, message, eventType: 'payment_reminder' },
            });
            if (smsError) {
              errors++;
              console.error(`SMS failed for ${member.member_code}:`, smsError);
            } else {
              remindersSent++;
              console.log(`SMS reminder sent to ${member.member_code}`);
            }
          } catch (e) {
            errors++;
            console.error(`SMS exception for ${member.member_code}:`, e);
          }
          await new Promise(resolve => setTimeout(resolve, 300));
        }

        // Update reminder_sent_at regardless of SMS success (notification was created)
        await supabase
          .from('member_cycle_payments')
          .update({ reminder_sent_at: new Date().toISOString() })
          .eq('id', payment.id);
      }
    }

    console.log(`[CRON] Daily reminder completed. SMS Sent: ${remindersSent}, Notifications: ${notificationsCreated}, Errors: ${errors}`);

    return new Response(JSON.stringify({ 
      success: true, 
      remindersSent,
      notificationsCreated,
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