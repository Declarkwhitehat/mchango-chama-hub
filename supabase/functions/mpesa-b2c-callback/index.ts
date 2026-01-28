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
  const occasion = result.Occasion || '';

  console.log('Finding withdrawal:', { conversationId, occasion });

  // Method 1: Lookup by payment_reference matching our predictable reference (WD-{uuid})
  if (occasion && occasion.startsWith('WD-')) {
    const { data: wd1, error: err1 } = await supabaseAdmin
      .from('withdrawals')
      .select(`
        *,
        profiles:requested_by(full_name, phone),
        chama:chama_id(name),
        mchango:mchango_id(title)
      `)
      .eq('payment_reference', occasion)
      .maybeSingle();

    if (wd1) {
      console.log('Found withdrawal by payment_reference (Occasion):', wd1.id);
      return wd1;
    }

    // Method 2: Extract withdrawal ID from Occasion format WD-{uuid}
    const withdrawalId = occasion.substring(3);
    if (withdrawalId && withdrawalId.length > 0) {
      const { data: wd2, error: err2 } = await supabaseAdmin
        .from('withdrawals')
        .select(`
          *,
          profiles:requested_by(full_name, phone),
          chama:chama_id(name),
          mchango:mchango_id(title)
        `)
        .eq('id', withdrawalId)
        .maybeSingle();

      if (wd2) {
        console.log('Found withdrawal by extracted ID from Occasion:', wd2.id);
        return wd2;
      }
    }
  }

  // Method 3: Fallback - lookup by ConversationID in payment_reference
  if (conversationId) {
    const { data: wd3, error: err3 } = await supabaseAdmin
      .from('withdrawals')
      .select(`
        *,
        profiles:requested_by(full_name, phone),
        chama:chama_id(name),
        mchango:mchango_id(title)
      `)
      .eq('payment_reference', conversationId)
      .maybeSingle();

    if (wd3) {
      console.log('Found withdrawal by ConversationID:', wd3.id);
      return wd3;
    }
  }

  // Method 4: Look for processing withdrawals without ConversationID match (race condition recovery)
  // Find the most recent processing withdrawal that matches the phone number
  if (result.ResultParameters?.ResultParameter) {
    let recipientPhone = '';
    for (const param of result.ResultParameters.ResultParameter) {
      if (param.Key === 'ReceiverPartyPublicName') {
        recipientPhone = param.Value.split(' - ')[0] || param.Value;
        break;
      }
    }

    if (recipientPhone) {
      const formattedPhone = recipientPhone.replace(/\D/g, '');
      const { data: wd4 } = await supabaseAdmin
        .from('withdrawals')
        .select(`
          *,
          profiles:requested_by(full_name, phone),
          chama:chama_id(name),
          mchango:mchango_id(title),
          payment_methods:payment_method_id(phone_number)
        `)
        .eq('status', 'processing')
        .order('last_b2c_attempt_at', { ascending: false })
        .limit(5);

      for (const wd of wd4 || []) {
        const pmPhone = wd.payment_methods?.phone_number?.replace(/\D/g, '') || '';
        if (pmPhone.endsWith(formattedPhone.slice(-9)) || formattedPhone.endsWith(pmPhone.slice(-9))) {
          console.log('Found withdrawal by phone number match:', wd.id);
          return wd;
        }
      }
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

    const groupName = withdrawal.chama?.name || withdrawal.mchango?.title || 'your group';
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

      // Send success SMS
      if (recipientPhone) {
        const successMessage = `🎉 Your ${groupName} payout of KES ${transactionAmount.toFixed(2)} has been sent to your M-Pesa. Transaction: ${transactionId}. Thank you for being a valued member!`;
        await sendSMS(recipientPhone, successMessage);
      }

      // Record commission as company earning
      if (withdrawal.commission_amount > 0) {
        await supabaseAdmin.rpc('record_company_earning', {
          p_source: withdrawal.chama_id ? 'chama_withdrawal' : 'mchango_withdrawal',
          p_amount: withdrawal.commission_amount,
          p_group_id: null,
          p_reference_id: withdrawal.id,
          p_description: `Withdrawal commission from ${withdrawal.chama_id ? 'Chama' : 'Mchango'}`
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
    console.error('Error in mpesa-b2c-callback:', error);
    // Always return success to M-Pesa to avoid retries
    return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: 'Accepted' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
