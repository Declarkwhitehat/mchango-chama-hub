import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
};

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

async function findWithdrawal(supabaseAdmin: any, result: any) {
  const conversationId = result.ConversationID;
  const originatorConversationId = result.OriginatorConversationID;
  const occasion = result.Occasion || '';

  console.log('Finding withdrawal:', { conversationId, originatorConversationId, occasion });

  const selectQuery = `
    *,
    profiles:requested_by(full_name, phone),
    chama:chama_id(name),
    mchango:mchango_id(title),
    welfares:welfare_id(name)
  `;

  // --- Extract recipient phone from callback for phone-based lookups ---
  let recipientPhoneLast9 = '';
  if (result.ResultParameters?.ResultParameter) {
    for (const param of result.ResultParameters.ResultParameter) {
      if (param.Key === 'ReceiverPartyPublicName') {
        const parts = String(param.Value).split(' - ');
        recipientPhoneLast9 = (parts[0] || '').replace(/\D/g, '').slice(-9);
        break;
      }
    }
  }

  // Method 0 (PRIMARY): Find processing withdrawal with WD- payment_reference matching by phone
  // This is the most reliable method because b2c-payout sets payment_reference = 'WD-<uuid>'
  // BEFORE making the API call, so it's always present when the callback arrives.
  if (recipientPhoneLast9) {
    const { data: wd0list } = await supabaseAdmin
      .from('withdrawals')
      .select(selectQuery)
      .eq('status', 'processing')
      .like('payment_reference', 'WD-%')
      .order('last_b2c_attempt_at', { ascending: false })
      .limit(10);

    if (wd0list && wd0list.length > 0) {
      for (const wd of wd0list) {
        const profilePhone = (wd.profiles?.phone || '').replace(/\D/g, '').slice(-9);
        if (profilePhone === recipientPhoneLast9) {
          console.log('Found withdrawal by WD- prefix + phone match:', wd.id);
          return wd;
        }
      }
    }
  }

  // Method 1: Direct ID extraction from WD- payment_reference
  // Search all processing withdrawals with WD- prefix and extract the UUID to match
  {
    const { data: wdProcessing } = await supabaseAdmin
      .from('withdrawals')
      .select(selectQuery)
      .eq('status', 'processing')
      .like('payment_reference', 'WD-%')
      .order('last_b2c_attempt_at', { ascending: false })
      .limit(5);

    if (wdProcessing && wdProcessing.length === 1) {
      // If only one processing withdrawal exists, it's almost certainly the right one
      console.log('Found single processing withdrawal with WD- prefix:', wdProcessing[0].id);
      return wdProcessing[0];
    }
  }

  // Method 2: Lookup by ConversationID in payment_reference (legacy fallback)
  if (conversationId) {
    const { data: wd1 } = await supabaseAdmin
      .from('withdrawals')
      .select(selectQuery)
      .eq('payment_reference', conversationId)
      .maybeSingle();

    if (wd1) {
      console.log('Found withdrawal by ConversationID in payment_reference:', wd1.id);
      return wd1;
    }
  }

  // Method 3: Occasion-based lookup (WD-{uuid} format) - works if Safaricom echoes Occasion
  if (occasion && occasion.startsWith('WD-')) {
    const withdrawalId = occasion.substring(3);
    if (withdrawalId) {
      const { data: wd3 } = await supabaseAdmin
        .from('withdrawals')
        .select(selectQuery)
        .eq('id', withdrawalId)
        .maybeSingle();

      if (wd3) {
        console.log('Found withdrawal by extracted ID from Occasion:', wd3.id);
        return wd3;
      }
    }
  }

  // Method 4: Search notes for ConversationID
  if (conversationId) {
    const { data: wd4list } = await supabaseAdmin
      .from('withdrawals')
      .select(selectQuery)
      .eq('status', 'processing')
      .ilike('notes', `%${conversationId}%`)
      .limit(1);

    if (wd4list && wd4list.length > 0) {
      console.log('Found withdrawal by ConversationID in notes:', wd4list[0].id);
      return wd4list[0];
    }
  }

  console.error('Could not find withdrawal with any method');
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const callbackData = await req.json();
    console.log('B2C Callback received:', JSON.stringify(callbackData, null, 2));

    const result = callbackData.Result;
    
    if (!result) {
      console.error('Invalid callback data - no Result field');
      return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: 'Accepted' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const conversationId = result.ConversationID;
    const resultCode = result.ResultCode;
    const resultDesc = result.ResultDesc;

    console.log('B2C Result:', { conversationId, resultCode, resultDesc });

    // Find withdrawal using multiple fallback methods
    const withdrawal = await findWithdrawal(supabaseAdmin, result);

    if (!withdrawal) {
      console.error('Withdrawal not found for callback:', { conversationId, occasion: result.Occasion });
      // Still return success to M-Pesa to prevent retries
      return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: 'Accepted' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const groupName = withdrawal.chama?.name || withdrawal.mchango?.title || withdrawal.welfares?.name || 'your group';
    const recipientPhone = withdrawal.profiles?.phone;

    if (resultCode === 0) {
      // Payment successful
      let transactionId = '';
      let transactionAmount = 0;
      let mpesaRecipientPhone = '';

      // Extract result parameters
      if (result.ResultParameters?.ResultParameter) {
        for (const param of result.ResultParameters.ResultParameter) {
          switch (param.Key) {
            case 'TransactionID':
              transactionId = param.Value;
              break;
            case 'TransactionAmount':
              transactionAmount = Number(param.Value);
              break;
            case 'ReceiverPartyPublicName':
              mpesaRecipientPhone = param.Value;
              break;
          }
        }
      }

      console.log('B2C Success:', { transactionId, transactionAmount, mpesaRecipientPhone });

      // Update withdrawal as completed with M-Pesa transaction ID
      const { error: updateError } = await supabaseAdmin
        .from('withdrawals')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          payment_reference: transactionId || conversationId,
          b2c_error_details: null, // Clear any previous errors
          notes: (withdrawal.notes || '') + `\n[SYSTEM] B2C completed: ${transactionId}, Amount: ${transactionAmount}`
        })
        .eq('id', withdrawal.id);

      if (updateError) {
        console.error('Failed to update withdrawal:', updateError);
      }

      // Update chama total_withdrawn atomically using database function
      if (withdrawal.chama_id && transactionAmount > 0) {
        const { error: chamaError } = await supabaseAdmin.rpc('update_chama_withdrawn', {
          p_chama_id: withdrawal.chama_id,
          p_amount: transactionAmount
        });
        
        if (chamaError) {
          console.error('Failed to update chama withdrawn:', chamaError);
          // Fallback to direct update
          const { data: chama } = await supabaseAdmin
            .from('chama')
            .select('total_withdrawn')
            .eq('id', withdrawal.chama_id)
            .single();
          
          if (chama) {
            await supabaseAdmin
              .from('chama')
              .update({ total_withdrawn: (Number(chama.total_withdrawn) || 0) + transactionAmount })
              .eq('id', withdrawal.chama_id);
          }
        } else {
          console.log('Updated chama total_withdrawn atomically:', { 
            chama_id: withdrawal.chama_id, 
            amount: transactionAmount
          });
        }
      }

      // Update mchango balance atomically using database function
      if (withdrawal.mchango_id && transactionAmount > 0) {
        const { error: mchangoError } = await supabaseAdmin.rpc('update_mchango_withdrawn', {
          p_mchango_id: withdrawal.mchango_id,
          p_amount: transactionAmount
        });
        
        if (mchangoError) {
          console.error('Failed to update mchango withdrawn:', mchangoError);
          // Fallback to direct update
          const { data: mchango } = await supabaseAdmin
            .from('mchango')
            .select('current_amount, available_balance')
            .eq('id', withdrawal.mchango_id)
            .single();

          if (mchango) {
            await supabaseAdmin
              .from('mchango')
              .update({
                current_amount: Math.max(0, Number(mchango.current_amount) - transactionAmount),
                available_balance: Math.max(0, Number(mchango.available_balance) - transactionAmount)
              })
              .eq('id', withdrawal.mchango_id);
          }
        } else {
          console.log('Updated mchango balance atomically:', {
            mchango_id: withdrawal.mchango_id,
            amount: transactionAmount
          });
        }
      }

      // Update organization balance atomically using database function
      if (withdrawal.organization_id && transactionAmount > 0) {
        const { error: orgError } = await supabaseAdmin.rpc('update_organization_withdrawn', {
          p_organization_id: withdrawal.organization_id,
          p_amount: transactionAmount
        });
        
        if (orgError) {
          console.error('Failed to update organization withdrawn:', orgError);
          const { data: org } = await supabaseAdmin
            .from('organizations')
            .select('current_amount, available_balance')
            .eq('id', withdrawal.organization_id)
            .single();

          if (org) {
            await supabaseAdmin
              .from('organizations')
              .update({
                current_amount: Math.max(0, Number(org.current_amount) - transactionAmount),
                available_balance: Math.max(0, Number(org.available_balance) - transactionAmount)
              })
              .eq('id', withdrawal.organization_id);
          }
        } else {
          console.log('Updated organization balance atomically:', {
            organization_id: withdrawal.organization_id,
            amount: transactionAmount
          });
        }
      }

      // Update welfare balance atomically using database function
      if (withdrawal.welfare_id && transactionAmount > 0) {
        const { error: welfareError } = await supabaseAdmin.rpc('update_welfare_withdrawn', {
          p_welfare_id: withdrawal.welfare_id,
          p_amount: transactionAmount
        });
        
        if (welfareError) {
          console.error('Failed to update welfare withdrawn:', welfareError);
          const { data: wf } = await supabaseAdmin
            .from('welfares')
            .select('current_amount, available_balance, total_withdrawn')
            .eq('id', withdrawal.welfare_id)
            .single();

          if (wf) {
            await supabaseAdmin
              .from('welfares')
              .update({
                current_amount: Math.max(0, Number(wf.current_amount) - transactionAmount),
                available_balance: Math.max(0, Number(wf.available_balance) - transactionAmount),
                total_withdrawn: (Number(wf.total_withdrawn) || 0) + transactionAmount
              })
              .eq('id', withdrawal.welfare_id);
          }
        } else {
          console.log('Updated welfare balance atomically:', {
            welfare_id: withdrawal.welfare_id,
            amount: transactionAmount
          });
        }
      }

      // Send success SMS
      if (recipientPhone) {
        const successMessage = `🎉 Your ${groupName} payout of KES ${transactionAmount.toFixed(2)} has been sent to your M-Pesa. Transaction: ${transactionId}. Thank you for being a valued member!`;
        await sendSMS(recipientPhone, successMessage);
      }

      // Record commission as company earning
      if (withdrawal.commission_amount > 0) {
        const sourceType = withdrawal.chama_id ? 'chama_withdrawal' : withdrawal.mchango_id ? 'mchango_withdrawal' : withdrawal.organization_id ? 'organization_withdrawal' : 'welfare_withdrawal';
        const sourceLabel = withdrawal.chama_id ? 'Chama' : withdrawal.mchango_id ? 'Mchango' : withdrawal.organization_id ? 'Organization' : 'Welfare';
        await supabaseAdmin.rpc('record_company_earning', {
          p_source: sourceType,
          p_amount: withdrawal.commission_amount,
          p_group_id: null,
          p_reference_id: withdrawal.id,
          p_description: `Withdrawal commission from ${sourceLabel}`
        });
      }

    } else {
      // Payment failed
      console.error('B2C payment failed:', resultDesc);

      const attemptCount = (withdrawal.b2c_attempt_count || 0);
      const maxAttempts = 3;

      if (attemptCount >= maxAttempts) {
        // Final failure - mark as failed and notify user
        await supabaseAdmin
          .from('withdrawals')
          .update({
            status: 'failed',
            b2c_error_details: {
              final_failure: true,
              last_error: resultDesc,
              result_code: resultCode,
              total_attempts: attemptCount
            },
            notes: (withdrawal.notes || '') + `\n[SYSTEM] FINAL B2C FAILURE: ${resultDesc} (Code: ${resultCode})`
          })
          .eq('id', withdrawal.id);

        // Send final failure SMS
        if (recipientPhone) {
          const failureMessage = `❌ Your ${groupName} payout of KES ${withdrawal.net_amount?.toFixed(2)} failed after multiple attempts. Error: ${resultDesc}. Please update your payment method or contact support.`;
          await sendSMS(recipientPhone, failureMessage);
        }
      } else {
        // Mark for retry
        await supabaseAdmin
          .from('withdrawals')
          .update({
            status: 'pending_retry',
            b2c_error_details: {
              last_error: resultDesc,
              result_code: resultCode,
              attempt: attemptCount
            },
            notes: (withdrawal.notes || '') + `\n[SYSTEM] B2C failed (attempt ${attemptCount}): ${resultDesc}. Will retry.`
          })
          .eq('id', withdrawal.id);

        // Send retry notification SMS
        if (recipientPhone) {
          const retryMessage = `⚠️ Your ${groupName} payout of KES ${withdrawal.net_amount?.toFixed(2)} could not be processed. We will retry automatically. If you don't receive it within 1 hour, please contact support.`;
          await sendSMS(recipientPhone, retryMessage);
        }
      }
    }

    // Return success to M-Pesa
    return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: 'Accepted' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error in b2c-callback:', error);
    // Always return success to M-Pesa to avoid retries
    return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: 'Accepted' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
