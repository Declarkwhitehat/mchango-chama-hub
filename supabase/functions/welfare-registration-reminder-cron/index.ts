import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { corsHeaders } from "../_shared/cors.ts";

/**
 * Daily cron — runs ~09:00 EAT.
 * For each welfare_member with registration_status in ('pending','partial'):
 *  - If deadline still in the future: send SMS + push reminder with remaining amount.
 *  - If deadline passed: move any registration_fee_paid into welfare_registration_credits,
 *    mark the member removed_unpaid (status='removed') and notify them.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseAdmin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

  const summary = { reminded: 0, removed: 0, errors: 0 };

  try {
    const { data: members, error } = await supabaseAdmin
      .from('welfare_members')
      .select('id, welfare_id, user_id, member_code, status, registration_fee_due, registration_fee_paid, registration_status, registration_deadline, welfares(name, registration_fee), profiles:user_id(phone, full_name)')
      .in('registration_status', ['pending', 'partial', 'removed_unpaid']);


    if (error) throw error;

    const now = new Date();

    for (const m of (members || []) as any[]) {
      try {
        const due = Number(m.registration_fee_due || 0);
        const paid = Number(m.registration_fee_paid || 0);
        const welfareName = m.welfares?.name || 'Welfare';
        const phone = m.profiles?.phone;
        const deadline = m.registration_deadline ? new Date(m.registration_deadline) : null;
        const isRemovedUnpaid = m.registration_status === 'removed_unpaid';

        // For already-removed members: fold any open credits into "already paid" for messaging,
        // and prompt them that any top-up will reinstate their membership.
        let credits = 0;
        if (isRemovedUnpaid) {
          const { data: cRows } = await supabaseAdmin
            .from('welfare_registration_credits')
            .select('amount')
            .eq('welfare_id', m.welfare_id)
            .eq('user_id', m.user_id)
            .is('consumed_at', null);
          credits = (cRows || []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
        }
        const remaining = Math.max(0, due - paid - credits);

        if (isRemovedUnpaid) {
          if (remaining <= 0) {
            // Nothing to remind about — credits already cover the fee; a fresh join will auto-confirm.
            continue;
          }
          const inApp = `Pay KES ${remaining.toLocaleString()} via Paybill 4015351, Account ${m.member_code}, to reinstate your membership in "${welfareName}".`;
          await supabaseAdmin.from('notifications').insert({
            user_id: m.user_id,
            title: 'Reinstate your welfare membership',
            message: inApp,
            type: 'warning',
            category: 'welfare',
            related_entity_type: 'welfare',
            related_entity_id: m.welfare_id,
          });
          supabaseAdmin.functions.invoke('send-push-notification', {
            body: { user_id: m.user_id, title: 'Reinstate your welfare membership', body: inApp },
          }).catch(() => {});
          if (phone) {
            const smsBody = `${welfareName}: Pay KES ${remaining.toLocaleString()} via Paybill 4015351, Acc ${m.member_code} to reinstate your membership.`;
            await supabaseAdmin.functions.invoke('send-transactional-sms', {
              body: { phone, message: smsBody, eventType: 'welfare_registration_reinstate_reminder' },
            }).catch((e: unknown) => console.warn('SMS failed:', e));
          }
          summary.reminded++;
          continue;
        }

        if (deadline && deadline.getTime() < now.getTime()) {

          // Past deadline — remove and bank partial as credit
          if (paid > 0) {
            await supabaseAdmin.from('welfare_registration_credits').insert({
              welfare_id: m.welfare_id,
              user_id: m.user_id,
              amount: paid,
            });
          }

          await supabaseAdmin
            .from('welfare_members')
            .update({
              status: 'removed',
              registration_status: 'removed_unpaid',
            })
            .eq('id', m.id);

          await supabaseAdmin.from('notifications').insert({
            user_id: m.user_id,
            title: 'Welfare registration expired',
            message: `Your registration for "${welfareName}" expired. ${paid > 0 ? `KES ${paid.toLocaleString()} held as credit if you rejoin.` : ''}`,
            type: 'error',
            category: 'welfare',
            related_entity_type: 'welfare',
            related_entity_id: m.welfare_id,
          });

          if (phone) {
            const smsBody = `Your registration for ${welfareName} expired.${paid > 0 ? ` KES ${paid.toLocaleString()} kept as credit for rejoin.` : ''}`;
            await supabaseAdmin.functions.invoke('send-transactional-sms', {
              body: { phone, message: smsBody, eventType: 'welfare_registration_expired' },
            }).catch((e: unknown) => console.warn('SMS failed:', e));
          }

          summary.removed++;
        } else if (remaining > 0) {
          // Still within window — daily reminder
          const deadlineStr = deadline ? deadline.toLocaleDateString('en-KE') : '';
          const inApp = `Pay KES ${remaining.toLocaleString()} via Paybill 4015351, Account ${m.member_code}, before ${deadlineStr} to activate membership in "${welfareName}".`;

          await supabaseAdmin.from('notifications').insert({
            user_id: m.user_id,
            title: 'Welfare registration due',
            message: inApp,
            type: 'warning',
            category: 'welfare',
            related_entity_type: 'welfare',
            related_entity_id: m.welfare_id,
          });

          // Push (fire-and-forget)
          supabaseAdmin.functions.invoke('send-push-notification', {
            body: { user_id: m.user_id, title: 'Welfare registration due', body: inApp },
          }).catch(() => {});

          if (phone) {
            const smsBody = `${welfareName}: Pay KES ${remaining.toLocaleString()} via Paybill 4015351, Acc ${m.member_code}, by ${deadlineStr} to activate membership.`;
            await supabaseAdmin.functions.invoke('send-transactional-sms', {
              body: { phone, message: smsBody, eventType: 'welfare_registration_reminder' },
            }).catch((e: unknown) => console.warn('SMS failed:', e));
          }

          summary.reminded++;
        }
      } catch (e) {
        console.error('reminder failed for member', m.id, e);
        summary.errors++;
      }
    }

    return new Response(JSON.stringify({ success: true, summary }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('welfare-registration-reminder-cron error:', error);
    return new Response(JSON.stringify({ error: error.message, summary }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
