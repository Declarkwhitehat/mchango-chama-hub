import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { COMMISSION_RATES } from "../_shared/commissionRates.ts";

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

    // First, check if this is a chama contribution
    const { data: contributions } = await supabaseClient
      .from('contributions')
      .select('*, chama(commission_rate)')
      .eq('payment_reference', checkoutRequestId);

    if (contributions && contributions.length > 0) {
      const contribution = contributions[0];
      console.log('Found chama contribution record:', {
        id: contribution.id,
        member_id: contribution.member_id,
        paid_by_member_id: contribution.paid_by_member_id,
        isPaidByOther: contribution.paid_by_member_id !== contribution.member_id
      });

      // Determine commission rate (default 5%)
      const commissionRate = contribution.chama?.commission_rate || 0.05;
      const actualAmount = paidAmount || contribution.amount;

      // Update contribution status with full payment details
      const { data: updatedContribution, error: contributionError } = await supabaseClient
        .from('contributions')
        .update({
          status: status,
          ...(mpesaReceiptNumber ? { mpesa_receipt_number: mpesaReceiptNumber } : {}),
          payment_notes: `Online STK Push payment. Receipt: ${mpesaReceiptNumber || 'N/A'}. Amount: KES ${paidAmount || contribution.amount}`,
        })
        .eq('id', contribution.id)
        .select()
        .single();

      if (contributionError) {
        console.error('Error updating contribution:', contributionError);
        throw contributionError;
      }

      console.log('Contribution updated:', updatedContribution);

      // If successful, delegate financial tracking to contributions-crud settleDebts
      if (status === 'completed') {
        const actualAmount = paidAmount || contribution.amount;

        // Get member info for notifications only (NOT for financial tracking)
        const { data: member } = await supabaseClient
          .from('chama_members')
          .select('user_id')
          .eq('id', contribution.member_id)
          .single();

        // Delegate ALL financial tracking to contributions-crud settle-only
        // This is the SINGLE SOURCE OF TRUTH for chama financial updates
        try {
          const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
          const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
          const settleResponse = await fetch(`${supabaseUrl}/functions/v1/contributions-crud`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${serviceKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              action: 'settle-only',
              member_id: contribution.member_id,
              chama_id: contribution.chama_id,
              amount: actualAmount,
              contribution_id: contribution.id,
            }),
          });
          const settleResult = await settleResponse.json();
          console.log('Settlement delegated successfully:', settleResult);
        } catch (settleError) {
          console.error('Error delegating settlement:', settleError);
          // Non-fatal — the contribution is still recorded
        }

        console.log('Financial tracking delegated to contributions-crud');

        // Get beneficiary profile for notification
        const { data: beneficiaryProfile } = await supabaseClient
          .from('profiles')
          .select('full_name, phone')
          .eq('id', member?.user_id)
          .single();

        // Check if someone else paid for this member
        const paidByDifferentMember = contribution.paid_by_member_id && 
          contribution.paid_by_member_id !== contribution.member_id;

        if (paidByDifferentMember) {
          // Get payer's member info to find their user_id
          const { data: payerMember } = await supabaseClient
            .from('chama_members')
            .select('user_id')
            .eq('id', contribution.paid_by_member_id)
            .single();

          if (payerMember?.user_id) {
            const { data: payerProfile } = await supabaseClient
              .from('profiles')
              .select('full_name, phone')
              .eq('id', payerMember.user_id)
              .single();

            // Notify the payer
            if (payerProfile?.phone) {
              try {
                await supabaseClient.functions.invoke('send-transactional-sms', {
                  body: {
                    phone: payerProfile.phone,
                    message: `Payment successful! KES ${actualAmount} credited to ${beneficiaryProfile?.full_name || 'member'}'s account. Receipt: ${mpesaReceiptNumber || 'N/A'}`
                  }
                });
                console.log('SMS notification sent to payer');
              } catch (smsError) {
                console.error('Error sending SMS to payer:', smsError);
              }
            }
          }

          // Notify the beneficiary that someone paid for them
          if (beneficiaryProfile?.phone) {
            try {
              const { data: payerProfile } = await supabaseClient
                .from('profiles')
                .select('full_name')
                .eq('id', payerMember?.user_id)
                .single();
              
              await supabaseClient.functions.invoke('send-transactional-sms', {
                body: {
                  phone: beneficiaryProfile.phone,
                  message: `Good news! ${payerProfile?.full_name || 'A member'} has paid KES ${actualAmount} for your chama contribution. Receipt: ${mpesaReceiptNumber || 'N/A'}`
                }
              });
              console.log('SMS notification sent to beneficiary');
            } catch (smsError) {
              console.error('Error sending SMS to beneficiary:', smsError);
            }
          }
        } else {
          // Self-payment - notify the member directly
          if (beneficiaryProfile?.phone) {
            try {
              await supabaseClient.functions.invoke('send-transactional-sms', {
                body: {
                  phone: beneficiaryProfile.phone,
                  message: `Chama contribution confirmed! KES ${actualAmount} received. Receipt: ${mpesaReceiptNumber || 'N/A'}`
                }
              });
              console.log('SMS notification sent');
            } catch (smsError) {
              console.error('Error sending SMS:', smsError);
            }
          }
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Chama contribution callback processed',
          contribution: updatedContribution,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if this is a mchango donation
    const { data: donations } = await supabaseClient
      .from('mchango_donations')
      .select('*')
      .eq('payment_reference', checkoutRequestId);

    if (donations && donations.length > 0) {
      // This is a donation - update mchango_donations table
      const donation = donations[0];
      const grossAmount = paidAmount || donation.amount;
      
      // Calculate commission using shared constant (7%)
      const commissionRate = COMMISSION_RATES.MCHANGO;
      const commissionAmount = grossAmount * commissionRate;
      const netAmount = grossAmount - commissionAmount;
      
      // Update donation with gross/commission/net breakdown
      const { data: updatedDonation, error: donationError } = await supabaseClient
        .from('mchango_donations')
        .update({
          payment_status: status,
          gross_amount: grossAmount,
          commission_amount: commissionAmount,
          net_amount: netAmount,
          completed_at: status === 'completed' ? new Date().toISOString() : null,
          ...(mpesaReceiptNumber ? { mpesa_receipt_number: mpesaReceiptNumber } : {}),
        })
        .eq('id', donation.id)
        .select()
        .single();

      if (donationError) {
        console.error('Error updating donation:', donationError);
        throw donationError;
      }

      if (status === 'completed') {
        console.log('Donation updated with breakdown:', { grossAmount, commissionAmount, netAmount });
      } else {
        console.log('Donation payment failed, status set to:', status);
      }

      // If payment successful, credit NET amount to mchango and record commission
      if (status === 'completed') {
        // Update mchango with NET amount and financial tracking
        const { data: mchangoRow, error: mchangoFetchError } = await supabaseClient
          .from('mchango')
          .select('current_amount, total_gross_collected, total_commission_paid, available_balance')
          .eq('id', donation.mchango_id)
          .single();

        if (!mchangoFetchError && mchangoRow) {
          await supabaseClient
            .from('mchango')
            .update({ 
              current_amount: (mchangoRow.current_amount || 0) + netAmount,
              total_gross_collected: (mchangoRow.total_gross_collected || 0) + grossAmount,
              total_commission_paid: (mchangoRow.total_commission_paid || 0) + commissionAmount,
              available_balance: (mchangoRow.available_balance || 0) + netAmount
            })
            .eq('id', donation.mchango_id);
          
          console.log('Mchango financial tracking updated:', { grossAmount, commissionAmount, netAmount });
        }

        // Record commission as company earnings
        const { error: mchangoEarningsError } = await supabaseClient
          .from('company_earnings')
          .insert({
            source: 'mchango_donation',
            amount: commissionAmount,
            reference_id: donation.id,
            description: `${(commissionRate * 100)}% commission on donation of KES ${grossAmount}. Net credited: KES ${netAmount}`
          });
        
        if (mchangoEarningsError) {
          console.error('Error recording mchango company earnings:', mchangoEarningsError);
        }

        // Record in financial ledger for detailed tracking
        const { error: mchangoLedgerError } = await supabaseClient
          .from('financial_ledger')
          .insert({
            transaction_type: 'donation',
            source_type: 'mchango',
            source_id: donation.mchango_id,
            reference_id: donation.id,
            gross_amount: grossAmount,
            commission_amount: commissionAmount,
            net_amount: netAmount,
            commission_rate: commissionRate,
            payer_name: donation.display_name || 'Anonymous',
            payer_phone: donation.phone,
            description: `Donation to mchango campaign`
          });

        if (mchangoLedgerError) {
          console.error('Error recording mchango in financial ledger:', mchangoLedgerError);
        }
        
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

    // Check if this is an organization donation
    const { data: orgDonations } = await supabaseClient
      .from('organization_donations')
      .select('*')
      .eq('payment_reference', checkoutRequestId);

    if (orgDonations && orgDonations.length > 0) {
      const orgDonation = orgDonations[0];
      console.log('Found organization donation record:', orgDonation.id);

      const grossAmount = paidAmount || orgDonation.amount;
      const commissionRate = COMMISSION_RATES.ORGANIZATION;
      const commissionAmount = grossAmount * commissionRate;
      const netAmount = grossAmount - commissionAmount;

      // Update donation with gross/commission/net breakdown
      const { data: updatedOrgDonation, error: orgDonationError } = await supabaseClient
        .from('organization_donations')
        .update({
          payment_status: status,
          gross_amount: grossAmount,
          commission_amount: commissionAmount,
          net_amount: netAmount,
          completed_at: status === 'completed' ? new Date().toISOString() : null,
          ...(mpesaReceiptNumber ? { mpesa_receipt_number: mpesaReceiptNumber } : {}),
        })
        .eq('id', orgDonation.id)
        .select()
        .single();

      if (orgDonationError) {
        console.error('Error updating organization donation:', orgDonationError);
        throw orgDonationError;
      }

      console.log('Organization donation updated with breakdown:', { grossAmount, commissionAmount, netAmount });

      if (status === 'completed') {
        // Update organization totals with financial tracking
        const { data: orgRow, error: orgFetchError } = await supabaseClient
          .from('organizations')
          .select('current_amount, total_gross_collected, total_commission_paid, available_balance')
          .eq('id', orgDonation.organization_id)
          .single();

        if (orgFetchError) {
          console.error('Error fetching organization for update:', orgFetchError);
        } else {
          await supabaseClient
            .from('organizations')
            .update({ 
              current_amount: (orgRow?.current_amount || 0) + netAmount,
              total_gross_collected: (orgRow?.total_gross_collected || 0) + grossAmount,
              total_commission_paid: (orgRow?.total_commission_paid || 0) + commissionAmount,
              available_balance: (orgRow?.available_balance || 0) + netAmount
            })
            .eq('id', orgDonation.organization_id);

          console.log('Organization financial tracking updated');
        }

        // Record commission in company_earnings
        const { error: earningsError } = await supabaseClient
          .from('company_earnings')
          .insert({
            source: 'organization_donation',
            amount: commissionAmount,
            reference_id: orgDonation.id,
            description: `${commissionRate * 100}% commission on organization donation of KES ${grossAmount}. Net: KES ${netAmount}`
          });

        if (earningsError) {
          console.error('Error recording company earnings:', earningsError);
        }

        // Record in financial ledger for detailed tracking
        const { error: ledgerError } = await supabaseClient
          .from('financial_ledger')
          .insert({
            transaction_type: 'donation',
            source_type: 'organization',
            source_id: orgDonation.organization_id,
            reference_id: orgDonation.id,
            gross_amount: grossAmount,
            commission_amount: commissionAmount,
            net_amount: netAmount,
            commission_rate: commissionRate,
            payer_name: orgDonation.display_name || 'Anonymous',
            payer_phone: orgDonation.phone,
            description: `Donation to organization`
          });

        if (ledgerError) {
          console.error('Error recording in financial ledger:', ledgerError);
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Organization donation callback processed successfully',
          donation: updatedOrgDonation,
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
