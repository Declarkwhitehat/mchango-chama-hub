import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
};

const PROFIT_FEE_RATE = 0.05; // 5% profit fee
const COMMISSION_RATE = 0.015; // 1.5% commission

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

    // POST /groups/:groupId/members/:memberId/loans - Request loan
    if (method === 'POST' && pathParts.length === 4 && pathParts[2] === 'loans') {
      const groupId = pathParts[0];
      const body = await req.json();
      const { amount } = body;

      // Validation
      if (!amount || amount <= 0) {
        throw new Error('Invalid loan amount');
      }

      // Get member details
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

      // Check if group is closing soon (within 3 months)
      const cycleEndDate = new Date(group.cycle_end_date);
      const threeMonthsFromNow = new Date();
      threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3);

      if (cycleEndDate <= threeMonthsFromNow) {
        throw new Error('Cannot request loan within 3 months of group closure');
      }

      // Check for active loans
      const { data: activeLoan } = await supabase
        .from('saving_group_loans')
        .select('*')
        .eq('borrower_user_id', user.id)
        .eq('saving_group_id', groupId)
        .in('status', ['PENDING_APPROVAL', 'APPROVED', 'DISBURSED'])
        .maybeSingle();

      if (activeLoan) {
        throw new Error('You already have an active loan');
      }

      // Check loan eligibility (at least 2000 per month for last 3 months)
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

      const { data: recentDeposits } = await supabase
        .from('saving_group_deposits')
        .select('created_at, net_amount')
        .eq('member_user_id', user.id)
        .eq('saving_group_id', groupId)
        .gte('created_at', threeMonthsAgo.toISOString());

      const monthlyTotals = new Map<string, number>();
      recentDeposits?.forEach(deposit => {
        const monthKey = new Date(deposit.created_at).toISOString().substring(0, 7);
        monthlyTotals.set(monthKey, (monthlyTotals.get(monthKey) || 0) + Number(deposit.net_amount));
      });

      const isEligible = monthlyTotals.size >= 3 && 
        Array.from(monthlyTotals.values()).every(total => total >= 2000);

      if (!isEligible) {
        throw new Error('Not eligible: Must save at least KES 2,000 per month for the last 3 months');
      }

      // Validate loan amount
      const personalSavings = member.current_savings || 0;
      const maxLoanFromSavings = personalSavings * 1.5; // 50% above savings
      const maxLoanFromGroup = (group.total_savings || 0) * 0.30; // Max 30% of group

      if (amount > maxLoanFromSavings) {
        throw new Error(`Loan amount cannot exceed KES ${maxLoanFromSavings.toFixed(2)} (150% of your savings)`);
      }

      if (amount > maxLoanFromGroup) {
        throw new Error(`Loan amount exceeds maximum allowed from group pool: KES ${maxLoanFromGroup.toFixed(2)}`);
      }

      // Calculate deductions
      const profitFee = amount * PROFIT_FEE_RATE;
      const commission = amount * COMMISSION_RATE;
      const disbursedAmount = amount - profitFee - commission;
      const totalRepayment = amount; // Principal only, no interest added

      // Check if instant approval (<100% of personal savings)
      const isInstantApproval = amount <= personalSavings;

      // Check available loan pool
      const { data: activeLoans } = await supabase
        .from('saving_group_loans')
        .select('balance_remaining')
        .eq('saving_group_id', groupId)
        .in('status', ['APPROVED', 'DISBURSED']);

      const activeLoanAmount = activeLoans?.reduce((sum, loan) => sum + (loan.balance_remaining || 0), 0) || 0;
      const availableLoanPool = (group.total_savings * 0.30) - activeLoanAmount;

      const needsWaitlist = amount > availableLoanPool;

      // Determine status
      let status = 'PENDING_APPROVAL';
      if (isInstantApproval && !needsWaitlist) {
        status = 'APPROVED';
      }

      // Set due date (30 days from approval)
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30);

      // Create loan
      const { data: loan, error: loanError } = await supabase
        .from('saving_group_loans')
        .insert({
          saving_group_id: groupId,
          borrower_user_id: user.id,
          requested_amount: amount,
          disbursed_amount: disbursedAmount,
          principal_amount: amount,
          commission_deducted: commission,
          profit_deducted: profitFee,
          total_repayment_amount: totalRepayment,
          balance_remaining: totalRepayment,
          status,
          waitlist: needsWaitlist,
          due_date: dueDate.toISOString().split('T')[0],
          repayment_due_date: dueDate.toISOString().split('T')[0],
        })
        .select()
        .single();

      if (loanError) throw loanError;

      // If instant approval, disburse immediately
      if (status === 'APPROVED') {
        // Add profit to group profit pool
        await supabase
          .from('saving_groups')
          .update({
            total_profits: group.total_profits + profitFee,
          })
          .eq('id', groupId);

        // Record company earning
        await supabase.rpc('record_company_earning', {
          p_source: 'LOAN_FEES',
          p_amount: commission,
          p_group_id: groupId,
          p_reference_id: loan.id,
          p_description: `1.5% commission on loan of KES ${amount}`,
        });

        // Record transaction
        await supabase
          .from('saving_group_transactions')
          .insert({
            group_id: groupId,
            member_id: member.id,
            transaction_type: 'LOAN',
            amount: disbursedAmount,
            reference_id: loan.id,
            notes: 'Instant loan approval',
          });

        // Send SMS notification
        const { data: profile } = await supabase
          .from('profiles')
          .select('phone, full_name')
          .eq('id', user.id)
          .single();

        if (profile?.phone) {
          await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-transactional-sms`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
            },
            body: JSON.stringify({
              phone: profile.phone,
              message: `Loan APPROVED! KES ${disbursedAmount.toLocaleString()} has been disbursed. Repay KES ${totalRepayment.toLocaleString()} by ${dueDate.toLocaleDateString()}. Deductions: Profit KES ${profitFee}, Commission KES ${commission}.`,
            }),
          });
        }
      }

      console.log(`Loan request of KES ${amount} for user ${user.id} in group ${groupId}. Status: ${status}, Waitlist: ${needsWaitlist}`);

      return new Response(
        JSON.stringify({
          success: true,
          loan,
          deductions: {
            profit_fee: profitFee,
            commission,
          },
          disbursed_amount: disbursedAmount,
          total_repayment: totalRepayment,
          status,
          on_waitlist: needsWaitlist,
          message: needsWaitlist 
            ? 'Loan request placed on waitlist due to insufficient funds' 
            : isInstantApproval 
              ? 'Loan approved and disbursed instantly' 
              : 'Loan request submitted for approval',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // PATCH /loans/:loanId/approve - Approve loan
    if (method === 'PATCH' && pathParts.length === 2 && pathParts[1] === 'approve') {
      const loanId = pathParts[0];

      // Get loan details
      const { data: loan } = await supabase
        .from('saving_group_loans')
        .select('*, saving_groups!saving_group_loans_saving_group_id_fkey(*)')
        .eq('id', loanId)
        .single();

      if (!loan) {
        throw new Error('Loan not found');
      }

      const group = loan.saving_groups as any;

      // Verify user is manager
      if (group.manager_id !== user.id) {
        throw new Error('Only the group manager can approve loans');
      }

      if (loan.status !== 'PENDING_APPROVAL') {
        throw new Error('Loan is not pending approval');
      }

      // Update loan status
      await supabase
        .from('saving_group_loans')
        .update({
          status: 'APPROVED',
          approved_at: new Date().toISOString(),
        })
        .eq('id', loanId);

      // Add profit to group
      await supabase
        .from('saving_groups')
        .update({
          total_profits: group.total_profits + loan.profit_deducted,
        })
        .eq('id', loan.saving_group_id);

      // Record company earning
      await supabase.rpc('record_company_earning', {
        p_source: 'LOAN_FEES',
        p_amount: loan.commission_deducted,
        p_group_id: loan.saving_group_id,
        p_reference_id: loan.id,
        p_description: `1.5% commission on approved loan`,
      });

      // Send notification
      const { data: borrower } = await supabase
        .from('profiles')
        .select('phone')
        .eq('id', loan.borrower_user_id)
        .single();

      if (borrower?.phone) {
        await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-transactional-sms`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
          },
          body: JSON.stringify({
            phone: borrower.phone,
            message: `Your loan of KES ${loan.disbursed_amount.toLocaleString()} has been APPROVED and disbursed! Repay KES ${loan.total_repayment_amount.toLocaleString()} by ${new Date(loan.due_date).toLocaleDateString()}.`,
          }),
        });
      }

      console.log(`Loan ${loanId} approved by manager ${user.id}`);

      return new Response(
        JSON.stringify({ success: true, message: 'Loan approved and disbursed' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // POST /loans/:loanId/repay - Repay loan
    if (method === 'POST' && pathParts.length === 2 && pathParts[1] === 'repay') {
      const loanId = pathParts[0];
      const body = await req.json();
      const { amount, payment_reference } = body;

      // Validation
      if (!amount || amount <= 0) {
        throw new Error('Invalid repayment amount');
      }

      if (!payment_reference) {
        throw new Error('Payment reference required');
      }

      // Get loan details
      const { data: loan } = await supabase
        .from('saving_group_loans')
        .select('*')
        .eq('id', loanId)
        .eq('borrower_user_id', user.id)
        .single();

      if (!loan) {
        throw new Error('Loan not found or unauthorized');
      }

      if (loan.status !== 'APPROVED' && loan.status !== 'DISBURSED') {
        throw new Error('Loan is not active');
      }

      if (amount > loan.balance_remaining) {
        throw new Error(`Repayment amount exceeds balance. Balance: KES ${loan.balance_remaining}`);
      }

      // Update loan balance
      const newBalance = loan.balance_remaining - amount;
      const isPaidOff = newBalance <= 0;

      await supabase
        .from('saving_group_loans')
        .update({
          balance_remaining: newBalance,
          status: isPaidOff ? 'REPAID' : 'DISBURSED',
          repaid_at: isPaidOff ? new Date().toISOString() : null,
        })
        .eq('id', loanId);

      // Record repayment
      await supabase
        .from('saving_group_loan_repayments')
        .insert({
          loan_id: loanId,
          amount,
        });

      // Record transaction
      const { data: member } = await supabase
        .from('saving_group_members')
        .select('id')
        .eq('user_id', user.id)
        .eq('group_id', loan.saving_group_id)
        .single();

      if (member) {
        await supabase
          .from('saving_group_transactions')
          .insert({
            group_id: loan.saving_group_id,
            member_id: member.id,
            transaction_type: 'LOAN_REPAYMENT',
            amount,
            reference_id: loanId,
            notes: payment_reference,
          });
      }

      console.log(`Loan repayment of KES ${amount} for loan ${loanId}. Paid off: ${isPaidOff}`);

      return new Response(
        JSON.stringify({
          success: true,
          new_balance: newBalance,
          paid_off: isPaidOff,
          message: isPaidOff ? 'Loan fully repaid!' : `Repayment recorded. Remaining balance: KES ${newBalance}`,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // POST /loans/process-waitlist - Process loan waitlist (cron job or manual trigger)
    if (method === 'POST' && pathParts.length === 2 && pathParts[0] === 'loans' && pathParts[1] === 'process-waitlist') {
      const { groupId } = await req.json();

      if (!groupId) {
        throw new Error('Group ID required');
      }

      // Get group
      const { data: group } = await supabase
        .from('saving_groups')
        .select('*')
        .eq('id', groupId)
        .single();

      if (!group) {
        throw new Error('Group not found');
      }

      // Calculate available loan pool
      const { data: activeLoans } = await supabase
        .from('saving_group_loans')
        .select('balance_remaining')
        .eq('saving_group_id', groupId)
        .in('status', ['APPROVED', 'DISBURSED']);

      const activeLoanAmount = activeLoans?.reduce((sum, loan) => sum + (loan.balance_remaining || 0), 0) || 0;
      const availableLoanPool = (group.total_savings * 0.30) - activeLoanAmount;

      if (availableLoanPool <= 0) {
        return new Response(
          JSON.stringify({ success: true, message: 'No funds available for waitlist', processed: 0 }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get waitlisted loans
      const { data: waitlistedLoans } = await supabase
        .from('saving_group_loans')
        .select('*')
        .eq('saving_group_id', groupId)
        .eq('waitlist', true)
        .eq('status', 'PENDING_APPROVAL')
        .order('requested_at', { ascending: true });

      let processed = 0;
      let remainingPool = availableLoanPool;

      for (const loan of waitlistedLoans || []) {
        if (loan.requested_amount <= remainingPool) {
          // Approve and disburse
          await supabase
            .from('saving_group_loans')
            .update({
              status: 'APPROVED',
              waitlist: false,
              approved_at: new Date().toISOString(),
            })
            .eq('id', loan.id);

          // Update group profits
          await supabase
            .from('saving_groups')
            .update({
              total_profits: group.total_profits + loan.profit_deducted,
            })
            .eq('id', groupId);

          // Send notification
          const { data: borrower } = await supabase
            .from('profiles')
            .select('phone')
            .eq('id', loan.borrower_user_id)
            .single();

          if (borrower?.phone) {
            await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-transactional-sms`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
              },
              body: JSON.stringify({
                phone: borrower.phone,
                message: `Great news! Your waitlisted loan of KES ${loan.disbursed_amount.toLocaleString()} is now APPROVED and disbursed!`,
              }),
            });
          }

          remainingPool -= loan.requested_amount;
          processed++;
        }
      }

      console.log(`Processed ${processed} waitlisted loans for group ${groupId}`);

      return new Response(
        JSON.stringify({ success: true, processed, remaining_pool: remainingPool }),
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
