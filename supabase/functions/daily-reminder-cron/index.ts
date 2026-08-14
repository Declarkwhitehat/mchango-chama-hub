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
          // Determine if "today" (Kenya date) equals the deadline date
          const eatToday = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().split('T')[0];
          const eatDeadlineDate = new Date(new Date(cycle.end_date).getTime() + 3 * 60 * 60 * 1000)
            .toISOString().split('T')[0];
          const isDeadlineDay = eatToday === eatDeadlineDate;
          const deadlineDateStr = new Date(cycle.end_date).toLocaleDateString('en-KE', {
            timeZone: 'Africa/Nairobi', day: 'numeric', month: 'short',
          });
          const slotLabel = isDeadlineDay
            ? (slot === '1815'
                ? `Final reminder: pay before ${dueTime} today.`
                : `Deadline: ${dueTime} today.`)
            : `Pay by ${deadlineDateStr} at ${dueTime}.`;
          const message = `Your KES ${Number(payment.amount_due).toLocaleString()} contribution to "${chama.name}" is due. ${slotLabel} Pay via Paybill 4015351, Account ${member.member_code}.`;

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

    // ---------- Welfare monthly contribution reminders (push + in-app only) ----------
    let welfareNotifications = 0;
    try {
      const { data: welfareCycles } = await supabase
        .from('welfare_contribution_cycles')
        .select('id, welfare_id, amount, end_date, welfares!inner(name)')
        .eq('status', 'active')
        .gte('end_date', today);

      for (const cycle of welfareCycles || []) {
        const welfareName = (cycle as any).welfares?.name || 'your welfare';

        const [{ data: members }, { data: contributions }] = await Promise.all([
          supabase
            .from('welfare_members')
            .select('id, user_id, member_code')
            .eq('welfare_id', cycle.welfare_id)
            .eq('status', 'active'),
          supabase
            .from('welfare_contributions')
            .select('member_id, gross_amount, category')
            .eq('cycle_id', cycle.id)
            .eq('payment_status', 'completed'),
        ]);

        const paidByMember = new Map<string, number>();
        for (const c of contributions || []) {
          if (c.category === 'registration_fee') continue;
          paidByMember.set(c.member_id, (paidByMember.get(c.member_id) || 0) + Number(c.gross_amount || 0));
        }

        const deadlineStr = new Date(cycle.end_date).toLocaleDateString('en-KE', {
          timeZone: 'Africa/Nairobi', day: 'numeric', month: 'short', year: 'numeric',
        });

        for (const member of members || []) {
          if (!member.user_id) continue;
          const paid = paidByMember.get(member.id) || 0;
          const outstanding = Number(cycle.amount || 0) - paid;
          if (outstanding <= 0) continue;

          await createNotification(supabase, {
            userId: member.user_id,
            title: `${welfareName}: contribution due`,
            message: `KES ${outstanding.toLocaleString()} is outstanding for the current cycle. Pay by ${deadlineStr} via M-Pesa Paybill 4015351, Account ${member.member_code}, or in the app.`,
            type: 'payment_reminder',
            relatedEntityId: cycle.welfare_id,
            relatedEntityType: 'welfare',
          } as any);
          welfareNotifications++;
        }
      }
    } catch (e) {
      console.error('[CRON] Welfare reminder error:', e);
    }

    // ── Welfare loans: due reminders, overdue flagging, monthly penalty, shares recovery ──
    let loansProcessed = 0;
    try {
      const { data: openLoans } = await supabase
        .from('welfare_loans')
        .select('id, welfare_id, member_id, user_id, loan_type, principal, balance, status, due_date, last_interest_at, welfares(name)')
        .in('status', ['active', 'overdue'])
        .limit(500);

      const now = Date.now();
      for (const loan of openLoans || []) {
        const due = loan.due_date ? new Date(loan.due_date).getTime() : null;
        if (!due) continue;
        const welfareName = (loan as any).welfares?.name || 'your welfare';
        const daysLeft = Math.ceil((due - now) / 86400000);

        if (daysLeft > 0 && daysLeft <= 3) {
          await createNotification(supabase, {
            userId: loan.user_id,
            title: 'Loan repayment due soon',
            message: `Your loan balance of KES ${Number(loan.balance).toLocaleString()} with ${welfareName} is due in ${daysLeft} day${daysLeft === 1 ? '' : 's'}. Repay in the app or via Paybill 4015351.`,
            type: 'warning',
            category: 'welfare',
            relatedEntityId: loan.welfare_id,
            relatedEntityType: 'welfare',
          } as any);
          loansProcessed++;
          continue;
        }

        if (daysLeft > 0) continue;

        // Overdue
        if (loan.loan_type === 'shares') {
          // Recover the outstanding balance from the member's shares
          const { data: member } = await supabase
            .from('welfare_members')
            .select('total_contributed')
            .eq('id', loan.member_id)
            .maybeSingle();
          const outstanding = Number(loan.balance || 0);
          const recovered = Math.min(outstanding, Number(member?.total_contributed || 0));
          if (recovered > 0) {
            await supabase.from('welfare_members')
              .update({ total_contributed: Number(member?.total_contributed || 0) - recovered })
              .eq('id', loan.member_id);
            await supabase.from('welfare_loan_repayments').insert({
              loan_id: loan.id, welfare_id: loan.welfare_id, member_id: loan.member_id,
              amount: recovered, source: 'shares', status: 'completed',
              balance_after: outstanding - recovered,
            });
          }
          const newBal = Math.max(0, outstanding - recovered);
          await supabase.from('welfare_loans').update({
            balance: newBal,
            status: newBal <= 0 ? 'repaid' : 'defaulted',
            closed_at: newBal <= 0 ? new Date().toISOString() : null,
          }).eq('id', loan.id);
          await createNotification(supabase, {
            userId: loan.user_id,
            title: newBal <= 0 ? 'Loan recovered from your shares' : 'Loan in default',
            message: newBal <= 0
              ? `KES ${recovered.toLocaleString()} was recovered from your shares to clear your loan with ${welfareName}.`
              : `KES ${recovered.toLocaleString()} was recovered from your shares. KES ${newBal.toLocaleString()} remains outstanding with ${welfareName}.`,
            type: newBal <= 0 ? 'info' : 'error',
            category: 'welfare',
            relatedEntityId: loan.welfare_id,
            relatedEntityType: 'welfare',
          } as any);
          loansProcessed++;
          continue;
        }

        // Multiplier loan: +5% per full month past due, charged once per month
        const lastAccrual = loan.last_interest_at ? new Date(loan.last_interest_at).getTime() : due;
        if (now - lastAccrual >= 30 * 86400000) {
          const penalty = Math.round(Number(loan.balance || 0) * 0.05 * 100) / 100;
          const newBal = Math.round((Number(loan.balance || 0) + penalty) * 100) / 100;
          await supabase.from('welfare_loans').update({
            balance: newBal,
            status: 'overdue',
            last_interest_at: new Date().toISOString(),
          }).eq('id', loan.id);
          await createNotification(supabase, {
            userId: loan.user_id,
            title: 'Late loan penalty applied',
            message: `A 5% monthly late charge of KES ${penalty.toLocaleString()} was added to your loan with ${welfareName}. New balance: KES ${newBal.toLocaleString()}.`,
            type: 'error',
            category: 'welfare',
            relatedEntityId: loan.welfare_id,
            relatedEntityType: 'welfare',
          } as any);
        } else if (loan.status !== 'overdue') {
          await supabase.from('welfare_loans').update({ status: 'overdue' }).eq('id', loan.id);
          await createNotification(supabase, {
            userId: loan.user_id,
            title: 'Loan overdue',
            message: `Your loan of KES ${Number(loan.balance).toLocaleString()} with ${welfareName} is past due. A 5% charge is added each month it stays unpaid.`,
            type: 'error',
            category: 'welfare',
            relatedEntityId: loan.welfare_id,
            relatedEntityType: 'welfare',
          } as any);
        }
        loansProcessed++;
      }
    } catch (e) {
      console.error('[CRON] Welfare loan processing error:', e);
    }

    console.log(`[CRON] Daily reminder completed. SMS Sent: ${remindersSent}, Notifications: ${notificationsCreated}, Welfare: ${welfareNotifications}, Loans: ${loansProcessed}, Errors: ${errors}`);



    return new Response(JSON.stringify({ 
      success: true, 
      remindersSent,
      notificationsCreated,
      welfareNotifications,
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