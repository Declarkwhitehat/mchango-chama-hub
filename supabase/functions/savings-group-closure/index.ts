import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const now = new Date();

    // Get all active groups
    const { data: groups, error: groupsError } = await supabase
      .from('saving_groups')
      .select('*, saving_group_members!saving_group_members_group_id_fkey(*, profiles!saving_group_members_user_id_fkey(phone, full_name))')
      .eq('status', 'active');

    if (groupsError) throw groupsError;

    const results = [];

    for (const group of groups || []) {
      const cycleEndDate = new Date(group.cycle_end_date);
      const daysUntilEnd = Math.floor((cycleEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      const monthsUntilEnd = daysUntilEnd / 30;

      // Check if we need to disable loans (3 months before end)
      if (monthsUntilEnd <= 90 && monthsUntilEnd > 30) {
        // Check if we already sent notification
        const { data: existingNotification } = await supabase
          .from('saving_group_transactions')
          .select('*')
          .eq('group_id', group.id)
          .eq('transaction_type', 'LOAN_DISABLED_NOTIFICATION')
          .maybeSingle();

        if (!existingNotification) {
          // Send notifications to all members
          const members = group.saving_group_members || [];
          const smsPromises = members.map((member: any) => {
            const profile = member.profiles;
            if (profile?.phone) {
              const message = `${group.name}: Loan requests are now disabled as we approach the cycle end date on ${cycleEndDate.toLocaleDateString()}. Continue saving to maximize your profits!`;
              
              return fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-transactional-sms`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
                },
                body: JSON.stringify({
                  phone: profile.phone,
                  message,
                }),
              });
            }
            return Promise.resolve();
          });

          await Promise.all(smsPromises);

          // Record notification sent
          await supabase
            .from('saving_group_transactions')
            .insert({
              group_id: group.id,
              transaction_type: 'LOAN_DISABLED_NOTIFICATION',
              amount: 0,
              notes: 'Loan requests disabled - 3 months before closure',
            });

          results.push({ group_id: group.id, action: 'LOANS_DISABLED_NOTIFICATION_SENT' });
        }
      }

      // Check if we need to enter CLOSING phase (1 month before end)
      if (monthsUntilEnd <= 30 && monthsUntilEnd > 0 && group.status === 'active') {
        // Update group status to CLOSING
        await supabase
          .from('saving_groups')
          .update({ status: 'closing' })
          .eq('id', group.id);

        // Check for active loans
        const { data: activeLoans } = await supabase
          .from('saving_group_loans')
          .select(`
            *,
            saving_group_members!saving_group_loans_borrower_user_id_fkey(
              user_id,
              unique_member_id,
              profiles!saving_group_members_user_id_fkey(full_name, phone)
            )
          `)
          .eq('saving_group_id', group.id)
          .in('status', ['PENDING_APPROVAL', 'APPROVED', 'DISBURSED']);

        // Send closing phase notifications
        const members = group.saving_group_members || [];
        const smsPromises = members.map((member: any) => {
          const profile = member.profiles;
          if (profile?.phone) {
            let message = `${group.name} is entering the CLOSING phase. Cycle ends ${cycleEndDate.toLocaleDateString()}. `;
            
            // Check if this member has active loans
            const memberLoans = activeLoans?.filter((loan: any) => 
              loan.saving_group_members.user_id === member.user_id
            );
            
            if (memberLoans && memberLoans.length > 0) {
              const totalDebt = memberLoans.reduce((sum: number, loan: any) => sum + loan.balance_remaining, 0);
              message += `You have KES ${totalDebt.toLocaleString()} in outstanding loans. Please repay before closure.`;
            } else {
              message += `Your savings: KES ${member.current_savings.toLocaleString()}. Final profit distribution coming soon!`;
            }
            
            return fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-transactional-sms`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
              },
              body: JSON.stringify({
                phone: profile.phone,
                message,
              }),
            });
          }
          return Promise.resolve();
        });

        await Promise.all(smsPromises);

        results.push({ 
          group_id: group.id, 
          action: 'CLOSING_PHASE_STARTED',
          active_loans: activeLoans?.length || 0 
        });
      }

      // Check if cycle has ended (time to distribute)
      if (daysUntilEnd <= 0 && group.status !== 'closed') {
        // Check if all loans are repaid
        const { data: activeLoans } = await supabase
          .from('saving_group_loans')
          .select('*')
          .eq('saving_group_id', group.id)
          .in('status', ['PENDING_APPROVAL', 'APPROVED', 'DISBURSED']);

        if (activeLoans && activeLoans.length > 0) {
          // Force repayment from savings if possible
          for (const loan of activeLoans) {
            const { data: borrowerMember } = await supabase
              .from('saving_group_members')
              .select('*')
              .eq('user_id', loan.borrower_user_id)
              .eq('group_id', group.id)
              .single();

            if (borrowerMember && borrowerMember.current_savings >= loan.balance_remaining) {
              // Deduct from savings
              await supabase
                .from('saving_group_members')
                .update({
                  current_savings: borrowerMember.current_savings - loan.balance_remaining,
                  status: 'active',
                })
                .eq('id', borrowerMember.id);

              // Mark loan as repaid
              await supabase
                .from('saving_group_loans')
                .update({
                  status: 'FULLY_REPAID',
                  balance_remaining: 0,
                  repaid_at: now.toISOString(),
                })
                .eq('id', loan.id);

              // Record repayment transaction
              await supabase
                .from('saving_group_transactions')
                .insert({
                  group_id: group.id,
                  member_id: borrowerMember.id,
                  transaction_type: 'LOAN_REPAYMENT',
                  amount: loan.balance_remaining,
                  reference_id: loan.id,
                  notes: 'Auto-repayment from savings at closure',
                });
            } else {
              // Mark member as defaulter
              await supabase
                .from('saving_group_members')
                .update({ status: 'defaulted' })
                .eq('user_id', loan.borrower_user_id)
                .eq('group_id', group.id);
            }
          }
        }

        // Now calculate and distribute profits
        const cyclePeriod = cycleEndDate.toISOString().substring(0, 7);
        
        // Check if profits already calculated
        const { data: existingProfit } = await supabase
          .from('saving_group_profits')
          .select('*')
          .eq('group_id', group.id)
          .eq('cycle_period', cyclePeriod)
          .maybeSingle();

        if (!existingProfit) {
          const totalProfit = group.total_profits || 0;

          // Create profit record
          const { data: profit, error: profitError } = await supabase
            .from('saving_group_profits')
            .insert({
              group_id: group.id,
              cycle_period: cyclePeriod,
              total_profit: totalProfit,
              distributed: false,
            })
            .select()
            .single();

          if (profitError) throw profitError;

          // Get all active members (exclude defaulters)
          const { data: activeMembers } = await supabase
            .from('saving_group_members')
            .select('*')
            .eq('group_id', group.id)
            .eq('status', 'active')
            .eq('is_approved', true);

          if (activeMembers && activeMembers.length > 0) {
            const totalSavings = activeMembers.reduce((sum, m) => sum + (m.current_savings || 0), 0);

            if (totalSavings > 0) {
              // Calculate profit shares
              const profitShares = activeMembers.map(member => ({
                profit_id: profit.id,
                member_id: member.id,
                share_amount: totalProfit * ((member.current_savings || 0) / totalSavings),
                savings_ratio: (member.current_savings || 0) / totalSavings,
              }));

              // Insert profit shares
              await supabase
                .from('saving_group_profit_shares')
                .insert(profitShares);

              // Mark as distributed
              await supabase
                .from('saving_group_profits')
                .update({
                  distributed: true,
                  distribution_date: now.toISOString(),
                })
                .eq('id', profit.id);

              // Send final payout notifications
              const notificationPromises = activeMembers.map(member => {
                const share = profitShares.find(ps => ps.member_id === member.id);
                const totalPayout = member.current_savings + (share?.share_amount || 0);
                
                const memberData = (group.saving_group_members || []).find((m: any) => m.id === member.id);
                const profile = memberData?.profiles;

                if (profile?.phone) {
                  const message = `${group.name} cycle completed! Your final payout: KES ${totalPayout.toLocaleString()} (Savings: KES ${member.current_savings.toLocaleString()} + Profit: KES ${(share?.share_amount || 0).toLocaleString()}). Thank you for participating!`;
                  
                  return fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-transactional-sms`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
                    },
                    body: JSON.stringify({
                      phone: profile.phone,
                      message,
                    }),
                  });
                }
                return Promise.resolve();
              });

              await Promise.all(notificationPromises);
            }
          }
        }

        // Mark group as CLOSED
        await supabase
          .from('saving_groups')
          .update({ status: 'closed' })
          .eq('id', group.id);

        results.push({ 
          group_id: group.id, 
          action: 'FINAL_DISTRIBUTION_COMPLETED',
          status: 'CLOSED'
        });
      }
    }

    console.log('Closure automation completed:', results);

    return new Response(
      JSON.stringify({
        success: true,
        results,
        checked_groups: groups?.length || 0,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in closure automation:', error);
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
