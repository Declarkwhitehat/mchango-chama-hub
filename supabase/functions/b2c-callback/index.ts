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

  // Method 1: Single processing withdrawal with WD- prefix
  {
    const { data: wdProcessing } = await supabaseAdmin
      .from('withdrawals')
      .select(selectQuery)
      .eq('status', 'processing')
      .like('payment_reference', 'WD-%')
      .order('last_b2c_attempt_at', { ascending: false })
      .limit(5);

    if (wdProcessing && wdProcessing.length === 1) {
      console.log('Found single processing withdrawal with WD- prefix:', wdProcessing[0].id);
      return wdProcessing[0];
    }
  }

  // Method 2: Lookup by ConversationID in payment_reference (legacy)
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

  // Method 3: Occasion-based lookup (WD-{uuid})
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
    console.log('=== B2C CALLBACK RECEIVED ===');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Full payload:', JSON.stringify(callbackData, null, 2));

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

    console.log('B2C Result:', { conversationId, resultCode, resultDesc, occasion: result.Occasion });

    // Find withdrawal using multiple fallback methods
    const withdrawal = await findWithdrawal(supabaseAdmin, result);

    if (!withdrawal) {
      console.error('CRITICAL: Withdrawal not found for callback:', { conversationId, occasion: result.Occasion });
      return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: 'Accepted' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Found withdrawal:', { id: withdrawal.id, status: withdrawal.status });

    // Idempotency: skip if already completed
    if (withdrawal.status === 'completed') {
      console.log('Withdrawal already completed, skipping:', withdrawal.id);
      return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: 'Accepted' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const groupName = withdrawal.chama?.name || withdrawal.mchango?.title || withdrawal.welfares?.name || 'your group';
    const recipientPhone = withdrawal.profiles?.phone;

    if (resultCode === 0) {
      // === PAYMENT SUCCESSFUL ===
      let transactionId = '';
      let transactionAmount = 0;

      if (result.ResultParameters?.ResultParameter) {
        for (const param of result.ResultParameters.ResultParameter) {
          if (param.Key === 'TransactionID') transactionId = param.Value;
          if (param.Key === 'TransactionAmount') transactionAmount = Number(param.Value);
        }
      }

      console.log('B2C Success - calling atomic completion:', { transactionId, transactionAmount, withdrawalId: withdrawal.id });

      // Use atomic DB function: updates status + deducts balance in one transaction
      const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc('process_withdrawal_completion', {
        p_withdrawal_id: withdrawal.id,
        p_mpesa_receipt: transactionId || conversationId,
        p_transaction_amount: transactionAmount
      });

      if (rpcError) {
        console.error('CRITICAL: Atomic completion RPC failed:', rpcError);
        // Fallback: at least update the status
        await supabaseAdmin
          .from('withdrawals')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            payment_reference: transactionId || conversationId,
            notes: (withdrawal.notes || '') + `\n[SYSTEM] RPC failed, manual status update: ${rpcError.message}`
          })
          .eq('id', withdrawal.id);
      } else {
        console.log('Atomic completion result:', rpcResult);
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

      // Send success SMS
      if (recipientPhone) {
        const successMessage = `🎉 Your ${groupName} payout of KES ${transactionAmount.toFixed(2)} has been sent to your M-Pesa. Transaction: ${transactionId}. Thank you!`;
        await sendSMS(recipientPhone, successMessage);
      }

    } else {
      // === PAYMENT FAILED ===
      console.error('B2C payment failed:', { resultCode, resultDesc });

      const attemptCount = (withdrawal.b2c_attempt_count || 0);
      const maxAttempts = 3;

      if (attemptCount >= maxAttempts) {
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

        if (recipientPhone) {
          await sendSMS(recipientPhone, `❌ Your ${groupName} payout of KES ${withdrawal.net_amount?.toFixed(2)} failed after multiple attempts. Error: ${resultDesc}. Please contact support.`);
        }
      } else {
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

        if (recipientPhone) {
          await sendSMS(recipientPhone, `⚠️ Your ${groupName} payout could not be processed. We will retry automatically. If not received within 1 hour, contact support.`);
        }
      }
    }

    return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: 'Accepted' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error in b2c-callback:', error);
    return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: 'Accepted' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
