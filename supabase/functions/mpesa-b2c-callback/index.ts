import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    // Find withdrawal by conversation ID (stored in payment_reference)
    const { data: withdrawal, error: findError } = await supabaseAdmin
      .from('withdrawals')
      .select(`
        *,
        profiles:requested_by(full_name, phone),
        chama:chama_id(name),
        mchango:mchango_id(title)
      `)
      .eq('payment_reference', conversationId)
      .single();

    if (findError || !withdrawal) {
      console.error('Withdrawal not found for conversation:', conversationId);
      // Still return success to M-Pesa
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

      // Update withdrawal as completed
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

      // Send success SMS
      if (recipientPhone) {
        const successMessage = `🎉 Your ${groupName} payout of KES ${transactionAmount.toFixed(2)} has been sent to your M-Pesa. Transaction: ${transactionId}. Thank you for being a valued member!`;
        await sendSMS(recipientPhone, successMessage);
      }

      // If it's a mchango withdrawal, update the current_amount
      if (withdrawal.mchango_id) {
        const { data: mchango } = await supabaseAdmin
          .from('mchango')
          .select('current_amount')
          .eq('id', withdrawal.mchango_id)
          .single();

        if (mchango) {
          await supabaseAdmin
            .from('mchango')
            .update({
              current_amount: Math.max(0, Number(mchango.current_amount) - withdrawal.amount)
            })
            .eq('id', withdrawal.mchango_id);
        }
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
