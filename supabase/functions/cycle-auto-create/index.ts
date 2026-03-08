import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { corsHeaders } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const celcomApiKey = Deno.env.get('CELCOM_API_KEY');
const celcomPartnerId = Deno.env.get('CELCOM_PARTNER_ID');
const celcomShortcode = Deno.env.get('CELCOM_SHORTCODE');

async function sendSMS(phone: string, message: string) {
  if (!celcomApiKey || !celcomPartnerId || !celcomShortcode) {
    console.log('SMS credentials not configured');
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

function getCycleLengthInDays(frequency: string, everyNDays?: number): number {
  switch (frequency) {
    case 'daily':
      return 1;
    case 'weekly':
      return 7;
    case 'monthly':
      return 30;
    case 'twice_monthly':
      return 15;
    case 'every_n_days':
      return everyNDays || 7;
    default:
      return 7;
  }
}

function calculateNextCycleDates(
  lastEndDate: Date, 
  frequency: string, 
  everyNDays?: number,
  monthlyDay?: number | null,
  monthlyDay2?: number | null
): { startDate: Date; endDate: Date } {
  const startDate = new Date(lastEndDate);
  startDate.setDate(startDate.getDate() + 1);
  startDate.setHours(0, 0, 0, 0);

  const endDate = new Date(startDate);
  
  switch (frequency) {
    case 'daily':
      endDate.setHours(22, 0, 0, 0);
      break;
    case 'weekly':
      endDate.setDate(endDate.getDate() + 6);
      endDate.setHours(23, 59, 59, 999);
      break;
    case 'monthly':
      if (monthlyDay) {
        // Next cycle ends on the day before monthlyDay of the following month
        endDate.setMonth(endDate.getMonth() + 1);
        endDate.setDate(monthlyDay - 1);
        endDate.setHours(23, 59, 59, 999);
      } else {
        endDate.setMonth(endDate.getMonth() + 1);
        endDate.setDate(0);
        endDate.setHours(23, 59, 59, 999);
      }
      break;
    case 'twice_monthly':
      if (monthlyDay && monthlyDay2) {
        const day1 = Math.min(monthlyDay, monthlyDay2);
        const day2 = Math.max(monthlyDay, monthlyDay2);
        const currentDay = startDate.getDate();
        if (currentDay >= day1 && currentDay < day2) {
          endDate.setDate(day2 - 1);
          endDate.setHours(23, 59, 59, 999);
        } else {
          if (currentDay >= day2) {
            endDate.setMonth(endDate.getMonth() + 1);
          }
          endDate.setDate(day1 - 1);
          endDate.setHours(23, 59, 59, 999);
        }
      } else {
        endDate.setDate(endDate.getDate() + 14);
        endDate.setHours(23, 59, 59, 999);
      }
      break;
    case 'every_n_days':
      endDate.setDate(endDate.getDate() + (everyNDays || 7) - 1);
      endDate.setHours(23, 59, 59, 999);
      break;
    default:
      endDate.setDate(endDate.getDate() + 6);
      endDate.setHours(23, 59, 59, 999);
  }

  return { startDate, endDate };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { chamaId, lastCycleId } = await req.json();

    console.log(`[CYCLE-AUTO-CREATE] Creating next cycle for chama: ${chamaId}`);

    // Get chama details
    const { data: chama, error: chamaError } = await supabase
      .from('chama')
      .select('*')
      .eq('id', chamaId)
      .single();

    if (chamaError || !chama) {
      console.error('Chama not found:', chamaError);
      return new Response(JSON.stringify({ error: 'Chama not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get the last completed cycle
    const { data: lastCycle, error: lastCycleError } = await supabase
      .from('contribution_cycles')
      .select('*')
      .eq('id', lastCycleId)
      .single();

    if (lastCycleError || !lastCycle) {
      console.error('Last cycle not found:', lastCycleError);
      return new Response(JSON.stringify({ error: 'Last cycle not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check if next cycle already exists
    const nextCycleNumber = lastCycle.cycle_number + 1;
    const { data: existingCycle } = await supabase
      .from('contribution_cycles')
      .select('id')
      .eq('chama_id', chamaId)
      .eq('cycle_number', nextCycleNumber)
      .maybeSingle();

    if (existingCycle) {
      console.log(`Cycle ${nextCycleNumber} already exists for chama ${chamaId}`);
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Cycle already exists',
        cycleId: existingCycle.id 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get approved, active members
    const { data: members, error: membersError } = await supabase
      .from('chama_members')
      .select(`
        *,
        profiles!chama_members_user_id_fkey(full_name, phone)
      `)
      .eq('chama_id', chamaId)
      .eq('approval_status', 'approved')
      .eq('status', 'active')
      .order('order_index');

    if (membersError || !members || members.length === 0) {
      console.error('No approved members:', membersError);
      return new Response(JSON.stringify({ error: 'No approved members' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Determine next beneficiary based on cycle number
    const beneficiaryIndex = (nextCycleNumber - 1) % members.length;
    const beneficiary = members[beneficiaryIndex];

    // Calculate next cycle dates
    const lastEndDate = new Date(lastCycle.end_date);
    const { startDate, endDate } = calculateNextCycleDates(
      lastEndDate,
      chama.contribution_frequency,
      chama.every_n_days_count,
      chama.monthly_contribution_day,
      chama.monthly_contribution_day_2
    );

    // Create new cycle
    const { data: newCycle, error: cycleError } = await supabase
      .from('contribution_cycles')
      .insert({
        chama_id: chamaId,
        cycle_number: nextCycleNumber,
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

    console.log(`Created cycle ${nextCycleNumber} for chama ${chama.name}, beneficiary: ${beneficiary.member_code}`);

    // Create payment records for all members, applying carry-forward credits
    // Commission is deducted NOW when credit is consumed (deferred from overpayment time)
    const COMMISSION_RATE = 0.05;
    let totalCreditCommission = 0;
    let totalNetCreditApplied = 0;

    const paymentRecords = members.map(member => {
      const carryForward = member.carry_forward_credit || 0;
      const nextCycleCredit = member.next_cycle_credit || 0;
      const totalCredit = carryForward + nextCycleCredit;
      const creditToUse = Math.min(totalCredit, chama.contribution_amount);
      const commission = creditToUse * COMMISSION_RATE;
      const netFromCredit = creditToUse - commission;
      const amountRemaining = Math.max(0, chama.contribution_amount - netFromCredit);
      const isFullyPaid = amountRemaining <= 0;

      if (creditToUse > 0) {
        totalCreditCommission += commission;
        totalNetCreditApplied += netFromCredit;
      }
      
      return {
        member_id: member.id,
        cycle_id: newCycle.id,
        amount_due: chama.contribution_amount,
        amount_paid: netFromCredit,
        amount_remaining: amountRemaining,
        is_paid: isFullyPaid,
        fully_paid: isFullyPaid,
        is_late_payment: false,
        payment_allocations: creditToUse > 0 ? [{
          amount: netFromCredit,
          gross_credit_used: creditToUse,
          commission,
          commission_rate: COMMISSION_RATE,
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

    // Reset carry-forward credits
    for (const member of members) {
      const totalCredit = (member.carry_forward_credit || 0) + (member.next_cycle_credit || 0);
      
      if (totalCredit > 0) {
        const creditUsed = Math.min(totalCredit, chama.contribution_amount);
        const remainingCredit = Math.max(0, totalCredit - creditUsed);
        
        await supabase
          .from('chama_members')
          .update({
            carry_forward_credit: remainingCredit,
            next_cycle_credit: 0
          })
          .eq('id', member.id);
      }
    }

    // Record commission from carry-forward credit application
    if (totalCreditCommission > 0) {
      const { data: chamaData } = await supabase
        .from('chama')
        .select('total_commission_paid, available_balance')
        .eq('id', chamaId)
        .single();

      if (chamaData) {
        await supabase.from('chama').update({
          total_commission_paid: (chamaData.total_commission_paid || 0) + totalCreditCommission,
          available_balance: (chamaData.available_balance || 0) + totalNetCreditApplied
        }).eq('id', chamaId);
      }

      await supabase.from('company_earnings').insert({
        source: 'chama_commission',
        amount: totalCreditCommission,
        group_id: chamaId,
        description: `Commission on carry-forward credit applied to Cycle #${nextCycleNumber}`
      });

      console.log(`[CYCLE-AUTO-CREATE] Carry-forward commission: ${totalCreditCommission}, net to pool: ${totalNetCreditApplied}`);
    }

    // Format dates for SMS
    const formatDate = (date: Date) => {
      return date.toLocaleDateString('en-KE', { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric' 
      });
    };

    // Send SMS notifications to all members about new cycle
    const smsPromises = members.map(async (member) => {
      const phone = member.profiles?.phone;
      if (!phone) return { success: false, memberId: member.id };

      const isBeneficiary = member.id === beneficiary.id;
      const paymentRecord = paymentRecords.find(p => p.member_id === member.id);
      const amountDue = paymentRecord?.amount_remaining || chama.contribution_amount;

      let message: string;
      if (isBeneficiary) {
        message = `🎯 You're the beneficiary for the next cycle in "${chama.name}"! Members contribute KES ${chama.contribution_amount} by ${formatDate(endDate)} at 8 PM. You'll receive the payout after all contributions. ${amountDue > 0 ? `Your contribution due: KES ${amountDue}` : 'Your credit covers this cycle! ✅'}`;
      } else {
        message = `📅 New cycle started in "${chama.name}". Contribute KES ${amountDue > 0 ? amountDue : 0} by ${formatDate(endDate)} at 8 PM. ${beneficiary.profiles?.full_name || 'Member #' + beneficiary.order_index} will receive the payout.${amountDue <= 0 ? ' Your credit covers this cycle! ✅' : ''}`;
      }

      const result = await sendSMS(phone, message);
      return { success: result.success, memberId: member.id };
    });

    const smsResults = await Promise.all(smsPromises);
    const smsSent = smsResults.filter(r => r.success).length;

    console.log(`[CYCLE-AUTO-CREATE] Cycle ${nextCycleNumber} created. SMS sent: ${smsSent}/${members.length}`);

    return new Response(JSON.stringify({
      success: true,
      cycle: newCycle,
      beneficiary: {
        id: beneficiary.id,
        name: beneficiary.profiles?.full_name,
        memberCode: beneficiary.member_code,
        orderIndex: beneficiary.order_index
      },
      smsSent,
      totalMembers: members.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error in cycle-auto-create:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
