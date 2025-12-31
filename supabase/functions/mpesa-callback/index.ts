import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const callbackData = await req.json();
    console.log('M-PESA Callback received:', JSON.stringify(callbackData, null, 2));

    const { Body } = callbackData;
    const { stkCallback } = Body;

    const merchantRequestId = stkCallback.MerchantRequestID;
    const checkoutRequestId = stkCallback.CheckoutRequestID;
    const resultCode = stkCallback.ResultCode;
    const resultDesc = stkCallback.ResultDesc;

    // Determine transaction status based on result code
    let status = resultCode === 0 ? 'completed' : 'failed';
    let mpesaReceiptNumber = null;
    let paidAmount = null;

    if (resultCode === 0) {
      // Extract M-PESA details from callback items
      const callbackMetadata = stkCallback.CallbackMetadata?.Item || [];
      const receiptItem = callbackMetadata.find((item: any) => item.Name === 'MpesaReceiptNumber');
      const amountItem = callbackMetadata.find((item: any) => item.Name === 'Amount');
      
      if (receiptItem) {
        mpesaReceiptNumber = receiptItem.Value;
      }
      if (amountItem) {
        paidAmount = amountItem.Value;
      }
      
      console.log('Payment details:', { mpesaReceiptNumber, paidAmount });
    }

    // First, check if this is a donation by looking up mchango_donations table
    const { data: donations } = await supabaseClient
      .from('mchango_donations')
      .select('*')
      .eq('payment_reference', checkoutRequestId);

    // First, check if this is a savings group deposit
    const { data: deposits } = await supabaseClient
      .from('saving_group_deposits')
      .select('*')
      .eq('payment_reference', checkoutRequestId);

    if (deposits && deposits.length > 0) {
      const deposit = deposits[0];
      console.log('Found savings deposit record:', deposit.id);

      // Update deposit record
      const { data: updatedDeposit, error: depositError } = await supabaseClient
        .from('saving_group_deposits')
        .update({
          status: status,
          mpesa_receipt_number: mpesaReceiptNumber,
          completed_at: status === 'completed' ? new Date().toISOString() : null,
          failed_reason: status === 'failed' ? resultDesc : null,
        })
        .eq('id', deposit.id)
        .select()
        .single();

      if (depositError) {
        console.error('Error updating deposit:', depositError);
        throw depositError;
      }

      // Only update balances if payment was successful
      if (status === 'completed') {
        console.log('Payment successful, updating balances');

        // Get member data
        const { data: member } = await supabaseClient
          .from('saving_group_members')
          .select('current_savings, lifetime_deposits')
          .eq('user_id', deposit.member_user_id)
          .eq('group_id', deposit.saving_group_id)
          .single();

        if (member) {
          // Update member savings
          await supabaseClient
            .from('saving_group_members')
            .update({
              current_savings: member.current_savings + deposit.net_amount,
              lifetime_deposits: member.lifetime_deposits + deposit.net_amount,
            })
            .eq('user_id', deposit.member_user_id)
            .eq('group_id', deposit.saving_group_id);

          console.log('Member savings updated');
        }

        // Get group data
        const { data: group } = await supabaseClient
          .from('saving_groups')
          .select('total_savings')
          .eq('id', deposit.saving_group_id)
          .single();

        if (group) {
          // Update group total savings
          await supabaseClient
            .from('saving_groups')
            .update({
              total_savings: group.total_savings + deposit.net_amount,
            })
            .eq('id', deposit.saving_group_id);

          console.log('Group total savings updated');
        }

        // Record commission as company earnings
        await supabaseClient
          .from('company_earnings')
          .insert({
            source: 'savings_deposit',
            amount: deposit.commission_amount,
            group_id: deposit.saving_group_id,
            reference_id: deposit.id,
            description: `1% commission on savings deposit of KES ${deposit.amount}`
          });

        console.log('Commission recorded as company earnings');

        // Optional: Send SMS notification
        const { data: profile } = await supabaseClient
          .from('profiles')
          .select('full_name, phone')
          .eq('id', deposit.member_user_id)
          .single();

        if (profile?.phone) {
          try {
            await supabaseClient.functions.invoke('send-transactional-sms', {
              body: {
                phone: profile.phone,
                message: `Deposit confirmed! KES ${deposit.net_amount.toFixed(2)} added to your savings. Receipt: ${mpesaReceiptNumber}`
              }
            });
            console.log('SMS notification sent');
          } catch (smsError) {
            console.error('Error sending SMS:', smsError);
          }
        }
      } else {
        console.log('Payment failed:', resultDesc);
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Savings deposit callback processed',
          deposit: updatedDeposit,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if this is a donation
    if (donations && donations.length > 0) {
      // This is a donation - update mchango_donations table
      const donation = donations[0];
      
      const { data: updatedDonation, error: donationError } = await supabaseClient
        .from('mchango_donations')
        .update({
          payment_status: status,
          completed_at: status === 'completed' ? new Date().toISOString() : null,
        })
        .eq('id', donation.id)
        .select()
        .single();

      if (donationError) {
        console.error('Error updating donation:', donationError);
        throw donationError;
      }

      console.log('Donation updated:', updatedDonation);

      // If payment successful, update mchango current_amount
      if (status === 'completed') {
        const actualAmount = paidAmount || donation.amount;
        
        const { data: mchango } = await supabaseClient
          .from('mchango')
          .select('current_amount')
          .eq('id', donation.mchango_id)
          .single();

        if (mchango) {
          const newAmount = (mchango.current_amount || 0) + actualAmount;
          
          const { error: updateError } = await supabaseClient
            .from('mchango')
            .update({ current_amount: newAmount })
            .eq('id', donation.mchango_id);

          if (updateError) {
            console.error('Error updating mchango amount:', updateError);
          } else {
            console.log(`Mchango current_amount updated: ${mchango.current_amount} -> ${newAmount}`);
          }
        }
        
        // Record commission as company earnings (15%)
        const commissionAmount = actualAmount * 0.15;
        await supabaseClient
          .from('company_earnings')
          .insert({
            source: 'mchango_donation',
            amount: commissionAmount,
            reference_id: donation.id,
            description: `15% commission on donation of KES ${actualAmount}`
          });
        
        console.log('Commission recorded:', commissionAmount);
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Donation callback processed successfully',
          donation: updatedDonation,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Original transaction handling code (for non-donation payments)
    // Find the transaction by checkout request ID
    const { data: transactions } = await supabaseClient
      .from('transactions')
      .select('*')
      .eq('metadata->>checkout_request_id', checkoutRequestId);

    if (!transactions || transactions.length === 0) {
      console.error('Transaction not found for checkout request:', checkoutRequestId);
      // Return 200 so M-Pesa doesn't keep retrying; we already logged the issue.
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Callback received but no matching record found',
          checkoutRequestId,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const transaction = transactions[0];

    // Update transaction with proper status
    const transactionStatus = resultCode === 0 ? 'confirmed' : 'failed';

    // Update transaction
    const { data: updatedTransaction, error: updateError } = await supabaseClient
      .from('transactions')
      .update({
        status: transactionStatus,
        mpesa_receipt_number: mpesaReceiptNumber,
        metadata: {
          ...transaction.metadata,
          result_code: resultCode,
          result_desc: resultDesc,
          callback_metadata: stkCallback.CallbackMetadata,
        },
      })
      .eq('id', transaction.id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating transaction:', updateError);
      throw updateError;
    }

    // If payment confirmed, update contribution and mchango totals
    if (transactionStatus === 'confirmed' && transaction.mchango_id) {
      // Update contribution record
      const { data: contribution } = await supabaseClient
        .from('contributions')
        .select('*')
        .eq('user_id', transaction.user_id)
        .eq('mchango_id', transaction.mchango_id)
        .single();

      if (contribution) {
        await supabaseClient
          .from('contributions')
          .update({
            amount_contributed: (contribution.amount_contributed || 0) + transaction.amount,
          })
          .eq('id', contribution.id);
      } else {
        // Create new contribution record
        await supabaseClient
          .from('contributions')
          .insert({
            user_id: transaction.user_id,
            mchango_id: transaction.mchango_id,
            amount_contributed: transaction.amount,
          });
      }

      // Update mchango total_collected
      const { data: mchango } = await supabaseClient
        .from('mchango')
        .select('*')
        .eq('id', transaction.mchango_id)
        .single();

      if (mchango) {
        await supabaseClient
          .from('mchango')
          .update({
            total_collected: (mchango.total_collected || 0) + transaction.amount,
          })
          .eq('id', transaction.mchango_id);
      }
    }

    console.log('Transaction updated:', updatedTransaction);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Callback processed successfully',
        transaction: updatedTransaction,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Callback error:', {
      message: error.message,
      code: error.code,
      details: error.details
    });
    
    let safeMessage = 'An error occurred processing your request';
    if (error.code === '23505') safeMessage = 'Duplicate record';
    else if (error.code === '23503') safeMessage = 'Referenced record not found';
    else if (error.code === '42501') safeMessage = 'Permission denied';
    
    return new Response(
      JSON.stringify({ error: safeMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
