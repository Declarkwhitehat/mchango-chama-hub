import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const callbackData = await req.json();
    console.log('Received C2B callback:', JSON.stringify(callbackData, null, 2));

    // Extract payment details from M-Pesa C2B callback
    const {
      TransAmount: amount,
      BillRefNumber: accountNumber, // This is the member ID (e.g., "ABC7")
      TransID: mpesaReceiptNumber,
      MSISDN: phoneNumber,
      FirstName: firstName,
      MiddleName: middleName,
      LastName: lastName,
    } = callbackData;

    if (!accountNumber || !amount || !mpesaReceiptNumber) {
      console.error('Missing required fields in callback:', callbackData);
      return new Response(
        JSON.stringify({ 
          ResultCode: 1, 
          ResultDesc: 'Missing required payment information' 
        }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Parse account number: 8 characters total
    // Format: ACT5MOO1 where first 4 chars = chama code, last 4 chars = member suffix
    // Also support legacy formats for backwards compatibility
    const upperAccountNumber = accountNumber.toUpperCase();
    
    // Extract group code (first 4 characters for new format, or variable for legacy)
    let groupCode: string;
    let memberSuffix: string;
    
    if (upperAccountNumber.length === 8) {
      // New format: ACT5MOO1 (4 + 4)
      groupCode = upperAccountNumber.substring(0, 4);
      memberSuffix = upperAccountNumber.substring(4, 8);
    } else if (upperAccountNumber.length >= 4) {
      // Legacy format or mchango code - treat entire value as the lookup key
      groupCode = upperAccountNumber;
      memberSuffix = '';
    } else {
      console.error('Invalid account number length:', accountNumber);
      return new Response(
        JSON.stringify({ 
          ResultCode: 1, 
          ResultDesc: `Invalid account number format: ${accountNumber}. Expected 8-character code (e.g., ACT5MOO1)` 
        }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log(`Parsed account number - Group: ${groupCode}, Member suffix: ${memberSuffix}, Full: ${upperAccountNumber}`);

    // Check for duplicate payment (same M-Pesa receipt number) across all tables
    const [
      { data: existingContribution },
      { data: existingDeposit },
      { data: existingDonation }
    ] = await Promise.all([
      supabase.from('contributions').select('id').eq('payment_reference', mpesaReceiptNumber).maybeSingle(),
      supabase.from('saving_deposits').select('id').eq('payment_reference', mpesaReceiptNumber).maybeSingle(),
      supabase.from('mchango_donations').select('id').eq('payment_reference', mpesaReceiptNumber).maybeSingle(),
    ]);

    if (existingContribution || existingDeposit || existingDonation) {
      console.log('Duplicate payment detected:', mpesaReceiptNumber);
      return new Response(
        JSON.stringify({ 
          ResultCode: 0, 
          ResultDesc: 'Payment already processed' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Try to find member in chama first using full member code
    const { data: chamaMemberData } = await supabase
      .from('chama_members')
      .select('id, user_id, chama_id, member_code')
      .eq('member_code', upperAccountNumber)
      .maybeSingle();

    if (chamaMemberData) {
      console.log('Found Chama member:', chamaMemberData);

      // Get chama details
      const { data: chamaData } = await supabase
        .from('chama')
        .select('id, group_code, name, contribution_amount, commission_rate, total_gross_collected, total_commission_paid, available_balance')
        .eq('id', chamaMemberData.chama_id)
        .single();

      // Calculate commission (default 5% for chama)
      const commissionRate = chamaData?.commission_rate || 0.05;
      const grossAmount = parseFloat(amount);
      const commissionAmount = grossAmount * commissionRate;
      const netAmount = grossAmount - commissionAmount;

      // Record chama contribution
      const { data: contribution, error: contributionError } = await supabase
        .from('contributions')
        .insert({
          chama_id: chamaMemberData.chama_id,
          member_id: chamaMemberData.id,
          paid_by_member_id: chamaMemberData.id,
          amount: grossAmount,
          payment_reference: mpesaReceiptNumber,
          status: 'completed',
          payment_notes: `Offline payment via till number. Payer: ${firstName} ${middleName || ''} ${lastName}. Phone: ${phoneNumber}`,
        })
        .select()
        .single();

      if (contributionError) {
        console.error('Error recording contribution:', contributionError);
        throw contributionError;
      }

      console.log('Contribution recorded successfully');

      // Update chama financial tracking with NET amount as available
      if (chamaData) {
        const { error: chamaUpdateError } = await supabase
          .from('chama')
          .update({
            total_gross_collected: (chamaData.total_gross_collected || 0) + grossAmount,
            total_commission_paid: (chamaData.total_commission_paid || 0) + commissionAmount,
            available_balance: (chamaData.available_balance || 0) + netAmount,
          })
          .eq('id', chamaData.id);

        if (chamaUpdateError) {
          console.error('Error updating chama financials:', chamaUpdateError);
        } else {
          console.log('Chama financials updated:', { grossAmount, commissionAmount, netAmount });
        }
      }

      // Record commission as company earnings
      await supabase
        .from('company_earnings')
        .insert({
          source: 'chama_contribution',
          amount: commissionAmount,
          reference_id: contribution?.id,
          description: `${(commissionRate * 100)}% commission on offline chama contribution of KES ${grossAmount}. Net credited: KES ${netAmount}`
        });

      // Record in financial ledger for detailed tracking
      await supabase
        .from('financial_ledger')
        .insert({
          transaction_type: 'contribution',
          source_type: 'chama',
          source_id: chamaMemberData.chama_id,
          reference_id: contribution?.id,
          gross_amount: grossAmount,
          commission_amount: commissionAmount,
          net_amount: netAmount,
          commission_rate: commissionRate,
          payer_name: `${firstName} ${middleName || ''} ${lastName}`.trim(),
          payer_phone: phoneNumber,
          description: `Offline chama contribution with ${(commissionRate * 100)}% commission deducted`
        });

      console.log('Commission recorded:', commissionAmount, 'Net available:', netAmount);

      // Send SMS notification
      if (chamaData) {
        try {
          await supabase.functions.invoke('send-transactional-sms', {
            body: {
              phone: phoneNumber,
              message: `Payment of KSh ${grossAmount} received for ${chamaData.name}. Commission: KSh ${commissionAmount.toFixed(2)} (${(commissionRate * 100)}%). Net credited: KSh ${netAmount.toFixed(2)}. Receipt: ${mpesaReceiptNumber}`,
            },
          });
        } catch (smsError) {
          console.error('Error sending SMS:', smsError);
          // Don't fail the whole transaction if SMS fails
        }
      }

      // ============================================
      // AUTOMATIC IMMEDIATE PAYOUT TRIGGER (C2B)
      // When all members have paid, trigger payout immediately
      // ============================================
      
      // Get current cycle for this chama
      const today = new Date().toISOString().split('T')[0];
      const { data: currentCycle } = await supabase
        .from('contribution_cycles')
        .select('*')
        .eq('chama_id', chamaMemberData.chama_id)
        .lte('start_date', today)
        .gte('end_date', today)
        .eq('payout_processed', false)
        .maybeSingle();

      if (currentCycle) {
        // Check if all members have now paid
        const { data: allPaymentsCheck } = await supabase
          .from('member_cycle_payments')
          .select('is_paid, is_late_payment')
          .eq('cycle_id', currentCycle.id);

        const totalMembers = allPaymentsCheck?.length || 0;
        const paidOnTime = allPaymentsCheck?.filter((p: any) => p.is_paid && !p.is_late_payment).length || 0;
        const allMembersPaid = paidOnTime === totalMembers && totalMembers > 0;

        if (allMembersPaid) {
          console.log('🎉 C2B: All members paid! Triggering immediate payout for cycle:', currentCycle.id);

          // Get beneficiary for this cycle
          const { data: beneficiaryMember } = await supabase
            .from('chama_members')
            .select(`
              id, user_id, member_code, order_index, 
              missed_payments_count, requires_admin_verification
            `)
            .eq('id', currentCycle.beneficiary_member_id)
            .single();

          // Get beneficiary profile for phone
          const { data: beneficiaryProfile } = await supabase
            .from('profiles')
            .select('full_name, phone')
            .eq('id', beneficiaryMember?.user_id)
            .maybeSingle();

          if (beneficiaryMember && chamaData) {
            // Calculate payout: each member's contribution × number of members, minus commission
            const payoutGross = chamaData.contribution_amount * totalMembers;
            const payoutCommission = payoutGross * commissionRate;
            const netPayoutAmount = payoutGross - payoutCommission;

            console.log(`C2B Immediate payout: ${totalMembers} members × KES ${chamaData.contribution_amount} = KES ${payoutGross}, commission: KES ${payoutCommission}, net: KES ${netPayoutAmount}`);

            // Get beneficiary's payment method
            const { data: paymentMethod } = await supabase
              .from('payment_methods')
              .select('*')
              .eq('user_id', beneficiaryMember.user_id)
              .eq('is_default', true)
              .maybeSingle();

            if (paymentMethod) {
              const canAutoApprove = paymentMethod.method_type === 'mpesa' &&
                                     !beneficiaryMember.requires_admin_verification &&
                                     (beneficiaryMember.missed_payments_count || 0) === 0;

              const withdrawalStatus = canAutoApprove ? 'approved' : 'pending';

              // Create withdrawal request
              const { data: newWithdrawal, error: withdrawalError } = await supabase
                .from('withdrawals')
                .insert({
                  chama_id: chamaMemberData.chama_id,
                  requested_by: beneficiaryMember.user_id,
                  amount: payoutGross,
                  commission_amount: payoutCommission,
                  net_amount: netPayoutAmount,
                  status: withdrawalStatus,
                  payment_method_id: paymentMethod.id,
                  payment_method_type: paymentMethod.method_type,
                  notes: `Automatic immediate payout (C2B) - all ${totalMembers} members paid`,
                  requested_at: new Date().toISOString(),
                  b2c_attempt_count: 0,
                  ...(withdrawalStatus === 'approved' ? { reviewed_at: new Date().toISOString() } : {})
                })
                .select('id')
                .single();

              if (!withdrawalError && newWithdrawal) {
                // Record commission
                await supabase.rpc('record_company_earning', {
                  p_source: 'chama_commission',
                  p_amount: payoutCommission,
                  p_group_id: chamaMemberData.chama_id,
                  p_description: `Immediate C2B payout commission - ${chamaData.name}`
                });

                // Mark cycle as complete
                await supabase
                  .from('contribution_cycles')
                  .update({
                    is_complete: true,
                    payout_processed: true,
                    payout_processed_at: new Date().toISOString(),
                    payout_amount: netPayoutAmount,
                    payout_type: 'full',
                    members_paid_count: totalMembers,
                    total_collected_amount: payoutGross
                  })
                  .eq('id', currentCycle.id);

                // Trigger B2C payout if approved
                if (canAutoApprove && paymentMethod.phone_number) {
                  console.log('🚀 C2B: Triggering automatic B2C payout');

                  const beneficiaryPhone = beneficiaryProfile?.phone || paymentMethod.phone_number;
                  if (beneficiaryPhone) {
                    await supabase.functions.invoke('send-transactional-sms', {
                      body: {
                        phone: beneficiaryPhone,
                        message: `🎉 All members have paid for "${chamaData.name}". Your payout of KES ${netPayoutAmount.toFixed(2)} is being processed now!`,
                      },
                    });
                  }

                  try {
                    const b2cResponse = await fetch(`${supabaseUrl}/functions/v1/mpesa-b2c-payout`, {
                      method: 'POST',
                      headers: {
                        'Authorization': `Bearer ${supabaseServiceKey}`,
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                        withdrawal_id: newWithdrawal.id,
                        phone_number: paymentMethod.phone_number,
                        amount: netPayoutAmount
                      })
                    });

                    const b2cResult = await b2cResponse.json();
                    if (b2cResponse.ok && b2cResult.success) {
                      console.log('✅ C2B Immediate B2C payout initiated:', b2cResult.conversation_id);
                    } else {
                      console.error('⚠️ C2B B2C payout failed:', b2cResult);
                      await supabase
                        .from('withdrawals')
                        .update({
                          status: 'pending_retry',
                          b2c_attempt_count: 1,
                          last_b2c_attempt_at: new Date().toISOString(),
                          b2c_error_details: { error: b2cResult.error || 'B2C initiation failed' }
                        })
                        .eq('id', newWithdrawal.id);
                    }
                  } catch (b2cError: any) {
                    console.error('⚠️ C2B B2C request error:', b2cError);
                  }
                }

                // Create notification for beneficiary
                await supabase
                  .from('notifications')
                  .insert({
                    user_id: beneficiaryMember.user_id,
                    title: '🎉 Payout Ready!',
                    message: `All members have paid! Your payout of KES ${netPayoutAmount.toFixed(2)} from "${chamaData.name}" ${canAutoApprove ? 'is being sent to your M-Pesa' : 'requires admin approval'}.`,
                    type: 'success',
                    category: 'withdrawal'
                  });
              }
            }
          }
        }
      }

      return new Response(
        JSON.stringify({ 
          ResultCode: 0, 
          ResultDesc: 'Payment accepted and recorded for Chama',
          type: 'chama',
          gross_amount: grossAmount,
          commission_amount: commissionAmount,
          net_amount: netAmount
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Try mchango (fundraising campaign) - matches by paybill_account_id (e.g., MCAB1234) or group_code
    const { data: mchangoData } = await supabase
      .from('mchango')
      .select('id, group_code, paybill_account_id, title, current_amount, total_gross_collected, total_commission_paid, available_balance')
      .or(`paybill_account_id.eq.${upperAccountNumber},group_code.eq.${upperAccountNumber}`)
      .eq('status', 'active')
      .maybeSingle();

    if (mchangoData) {
      console.log('Found Mchango campaign:', mchangoData);

      // Calculate commission (15% for mchango)
      const commissionRate = 0.15;
      const grossAmount = parseFloat(amount);
      const commissionAmount = grossAmount * commissionRate;
      const netAmount = grossAmount - commissionAmount;

      // Create donor display name
      const displayName = `${firstName} ${middleName || ''} ${lastName}`.trim();

      // Record mchango donation with full financial tracking
      const { data: donation, error: donationError } = await supabase
        .from('mchango_donations')
        .insert({
          mchango_id: mchangoData.id,
          amount: grossAmount,
          gross_amount: grossAmount,
          commission_amount: commissionAmount,
          net_amount: netAmount,
          display_name: displayName,
          phone: phoneNumber,
          is_anonymous: false,
          payment_reference: mpesaReceiptNumber,
          payment_method: 'mpesa_offline',
          payment_status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (donationError) {
        console.error('Error recording mchango donation:', donationError);
        throw donationError;
      }

      console.log('Mchango donation recorded successfully');

      // Update mchango financial tracking
      const { error: mchangoUpdateError } = await supabase
        .from('mchango')
        .update({
          current_amount: (mchangoData.current_amount || 0) + grossAmount,
          total_gross_collected: (mchangoData.total_gross_collected || 0) + grossAmount,
          total_commission_paid: (mchangoData.total_commission_paid || 0) + commissionAmount,
          available_balance: (mchangoData.available_balance || 0) + netAmount,
        })
        .eq('id', mchangoData.id);

      if (mchangoUpdateError) {
        console.error('Error updating mchango financials:', mchangoUpdateError);
      } else {
        console.log('Mchango financials updated:', { grossAmount, commissionAmount, netAmount });
      }

      // Record commission as company earnings
      await supabase
        .from('company_earnings')
        .insert({
          source: 'mchango_donation',
          amount: commissionAmount,
          reference_id: donation?.id,
          description: `15% commission on offline mchango donation of KES ${grossAmount}. Net credited: KES ${netAmount}`
        });

      // Record in financial ledger
      await supabase
        .from('financial_ledger')
        .insert({
          transaction_type: 'donation',
          source_type: 'mchango',
          source_id: mchangoData.id,
          reference_id: donation?.id,
          gross_amount: grossAmount,
          commission_amount: commissionAmount,
          net_amount: netAmount,
          commission_rate: commissionRate,
          payer_name: displayName,
          payer_phone: phoneNumber,
          description: `Offline mchango donation with 15% commission deducted`
        });

      // Send SMS notification
      try {
        await supabase.functions.invoke('send-transactional-sms', {
          body: {
            phone: phoneNumber,
            message: `Thank you ${firstName}! Your donation of KSh ${grossAmount} to "${mchangoData.title}" was received. Commission: KSh ${commissionAmount.toFixed(2)} (15%). Net credited: KSh ${netAmount.toFixed(2)}. Receipt: ${mpesaReceiptNumber}`,
          },
        });
      } catch (smsError) {
        console.error('Error sending SMS:', smsError);
      }

      return new Response(
        JSON.stringify({ 
          ResultCode: 0, 
          ResultDesc: 'Donation accepted and recorded for Mchango',
          type: 'mchango',
          gross_amount: grossAmount,
          commission_amount: commissionAmount,
          net_amount: netAmount
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Try organization - matches by paybill_account_id (e.g., ORG-XY7890) or group_code
    const { data: orgData } = await supabase
      .from('organizations')
      .select('id, name, group_code, paybill_account_id, current_amount, total_gross_collected, total_commission_paid, available_balance')
      .or(`paybill_account_id.eq.${upperAccountNumber},group_code.eq.${upperAccountNumber}`)
      .eq('status', 'active')
      .maybeSingle();

    if (orgData) {
      console.log('Found Organization:', orgData);

      // Calculate commission (5% for organizations)
      const commissionRate = 0.05;
      const grossAmount = parseFloat(amount);
      const commissionAmount = grossAmount * commissionRate;
      const netAmount = grossAmount - commissionAmount;

      // Use the payer's real name from M-Pesa
      const displayName = `${firstName} ${middleName || ''} ${lastName}`.trim();

      // Record organization donation
      const { data: donation, error: donationError } = await supabase
        .from('organization_donations')
        .insert({
          organization_id: orgData.id,
          amount: grossAmount,
          gross_amount: grossAmount,
          commission_amount: commissionAmount,
          net_amount: netAmount,
          display_name: displayName,
          phone: phoneNumber,
          is_anonymous: false,
          payment_reference: mpesaReceiptNumber,
          payment_method: 'mpesa_offline',
          payment_status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (donationError) {
        console.error('Error recording organization donation:', donationError);
        throw donationError;
      }

      console.log('Organization donation recorded successfully');

      // Update organization financial tracking
      const { error: orgUpdateError } = await supabase
        .from('organizations')
        .update({
          current_amount: (orgData.current_amount || 0) + grossAmount,
          total_gross_collected: (orgData.total_gross_collected || 0) + grossAmount,
          total_commission_paid: (orgData.total_commission_paid || 0) + commissionAmount,
          available_balance: (orgData.available_balance || 0) + netAmount,
        })
        .eq('id', orgData.id);

      if (orgUpdateError) {
        console.error('Error updating organization financials:', orgUpdateError);
      } else {
        console.log('Organization financials updated:', { grossAmount, commissionAmount, netAmount });
      }

      // Record commission as company earnings
      await supabase
        .from('company_earnings')
        .insert({
          source: 'organization_donation',
          amount: commissionAmount,
          reference_id: donation?.id,
          description: `5% commission on offline organization donation of KES ${grossAmount}. Net credited: KES ${netAmount}`
        });

      // Record in financial ledger
      await supabase
        .from('financial_ledger')
        .insert({
          transaction_type: 'donation',
          source_type: 'organization',
          source_id: orgData.id,
          reference_id: donation?.id,
          gross_amount: grossAmount,
          commission_amount: commissionAmount,
          net_amount: netAmount,
          commission_rate: commissionRate,
          payer_name: displayName,
          payer_phone: phoneNumber,
          description: `Offline organization donation with 5% commission deducted`
        });

      // Send SMS notification
      try {
        await supabase.functions.invoke('send-transactional-sms', {
          body: {
            phone: phoneNumber,
            message: `Thank you ${firstName}! Your donation of KSh ${grossAmount} to "${orgData.name}" was received. Commission: KSh ${commissionAmount.toFixed(2)} (5%). Net credited: KSh ${netAmount.toFixed(2)}. Receipt: ${mpesaReceiptNumber}`,
          },
        });
      } catch (smsError) {
        console.error('Error sending SMS:', smsError);
      }

      return new Response(
        JSON.stringify({ 
          ResultCode: 0, 
          ResultDesc: 'Donation accepted and recorded for Organization',
          type: 'organization',
          gross_amount: grossAmount,
          commission_amount: commissionAmount,
          net_amount: netAmount
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // IMPORTANT: No matching entity found - DO NOT update anything
    // This is a critical safety check to prevent payments being credited to wrong accounts
    console.error('❌ UNMATCHED PAYMENT - Account not found:', accountNumber);
    console.error('Searched for:', {
      chama_member_code: upperAccountNumber,
      mchango_paybill_or_code: upperAccountNumber,
      org_paybill_or_code: upperAccountNumber
    });
    
    // Send SMS to payer informing them of the issue
    if (phoneNumber) {
      try {
        await supabase.functions.invoke('send-transactional-sms', {
          body: {
            phone: phoneNumber,
            message: `Payment of KSh ${amount} with ID "${accountNumber}" was NOT processed. This payment code does not exist in our system. Please contact support with receipt ${mpesaReceiptNumber} for assistance.`,
          },
        });
        console.log('Sent unmatched payment notification SMS to:', phoneNumber);
      } catch (smsError) {
        console.error('Failed to send unmatched payment SMS:', smsError);
      }
    }
    
    // Return error - M-Pesa will handle the reversal if needed
    return new Response(
      JSON.stringify({ 
        ResultCode: 1, 
        ResultDesc: `Payment code "${accountNumber}" not found. No account was credited. Please verify your payment code and try again.` 
      }),
      { 
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error processing C2B callback:', error);
    return new Response(
      JSON.stringify({ 
        ResultCode: 1, 
        ResultDesc: 'Internal server error processing payment' 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
