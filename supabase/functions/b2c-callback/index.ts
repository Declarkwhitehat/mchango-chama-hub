import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { createNotification, NotificationTemplates, notifyManyUsers } from "../_shared/notifications.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
};

async function sendSMS(phone: string, message: string) {
  const onfonApiKey = Deno.env.get('ONFON_API_KEY');
  const onfonClientId = Deno.env.get('ONFON_CLIENT_ID');
  const onfonAccessKey = Deno.env.get('ONFON_ACCESS_KEY');
  const onfonSenderId = Deno.env.get('ONFON_SENDER_ID') || 'OnfonInfo';

  if (!onfonApiKey || !onfonClientId || !onfonAccessKey) {
    console.error('Onfon SMS credentials not configured');
    return { success: false, error: 'SMS not configured' };
  }

  try {
    // Normalize phone: remove '+' prefix for Onfon
    let normalizedPhone = phone.replace(/^\+/, '');
    if (normalizedPhone.startsWith('0')) {
      normalizedPhone = '254' + normalizedPhone.substring(1);
    } else if (!normalizedPhone.startsWith('254')) {
      normalizedPhone = '254' + normalizedPhone;
    }

    const response = await fetch('https://api.onfonmedia.co.ke/v1/sms/SendBulkSMS', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accesskey': onfonAccessKey,
      },
      body: JSON.stringify({
        ApiKey: onfonApiKey,
        ClientId: onfonClientId,
        SenderId: onfonSenderId,
        MessageParameters: [
          {
            Number: normalizedPhone,
            Text: message,
          },
        ],
      }),
    });

    const data = await response.json();
    console.log('SMS response:', JSON.stringify(data));
    return { success: response.ok, data };
  } catch (error: any) {
    console.error('SMS error:', error);
    return { success: false, error: error.message };
  }
}

function extractOccasion(result: any): string {
  const directOccasion = result?.Occasion;
  if (typeof directOccasion === 'string' && directOccasion.trim()) {
    return directOccasion.trim();
  }

  const referenceItem = result?.ReferenceData?.ReferenceItem;
  if (Array.isArray(referenceItem)) {
    for (const item of referenceItem) {
      if (item?.Key === 'Occasion' && item?.Value) {
        return String(item.Value).trim();
      }
    }
  } else if (referenceItem?.Key === 'Occasion' && referenceItem?.Value) {
    return String(referenceItem.Value).trim();
  }

  return '';
}

async function findWithdrawal(supabaseAdmin: any, result: any) {
  const conversationId = result?.ConversationID || '';
  const originatorConversationId = result?.OriginatorConversationID || '';
  const occasion = extractOccasion(result);

  console.log('Finding withdrawal:', { conversationId, originatorConversationId, occasion });

  const selectQuery = '*';

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

  // Method 0 (PRIMARY): Occasion-based lookup (WD-{uuid})
  if (occasion && occasion.startsWith('WD-')) {
    const withdrawalId = occasion.substring(3);
    if (withdrawalId) {
      const { data: wd0 } = await supabaseAdmin
        .from('withdrawals')
        .select(selectQuery)
        .eq('id', withdrawalId)
        .maybeSingle();

      if (wd0) {
        console.log('Found withdrawal by Occasion withdrawal ID:', wd0.id);
        return wd0;
      }
    }
  }

  // Method 1: Lookup by ConversationID in payment_reference (legacy)
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

  // Method 1.5: Lookup by OriginatorConversationID logged in notes
  if (originatorConversationId) {
    const { data: wd15list } = await supabaseAdmin
      .from('withdrawals')
      .select(selectQuery)
      .eq('status', 'processing')
      .ilike('notes', `%OrigConvID=${originatorConversationId}%`)
      .limit(1);

    if (wd15list && wd15list.length > 0) {
      console.log('Found withdrawal by OriginatorConversationID in notes:', wd15list[0].id);
      return wd15list[0];
    }
  }

  // Method 2: Find processing withdrawal with WD- payment_reference matching by phone
  if (recipientPhoneLast9) {
    const { data: wd2list } = await supabaseAdmin
      .from('withdrawals')
      .select(selectQuery)
      .eq('status', 'processing')
      .like('payment_reference', 'WD-%')
      .order('last_b2c_attempt_at', { ascending: false })
      .limit(20);

    if (wd2list && wd2list.length > 0) {
      for (const wd of wd2list) {
        const profilePhone = (wd.profiles?.phone || '').replace(/\D/g, '').slice(-9);
        if (profilePhone === recipientPhoneLast9) {
          console.log('Found withdrawal by WD- prefix + phone match:', wd.id);
          return wd;
        }
      }
    }
  }

  // Method 3: Single processing withdrawal with WD- prefix
  {
    const { data: wd3Processing } = await supabaseAdmin
      .from('withdrawals')
      .select(selectQuery)
      .eq('status', 'processing')
      .like('payment_reference', 'WD-%')
      .order('last_b2c_attempt_at', { ascending: false })
      .limit(5);

    if (wd3Processing && wd3Processing.length === 1) {
      console.log('Found single processing withdrawal with WD- prefix:', wd3Processing[0].id);
      return wd3Processing[0];
    }
  }

  // Method 4: Search notes for conversation IDs
  if (conversationId) {
    const { data: wd4list } = await supabaseAdmin
      .from('withdrawals')
      .select(selectQuery)
      .eq('status', 'processing')
      .or(`notes.ilike.%ConvID=${conversationId}%,notes.ilike.%${conversationId}%`)
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
    const callbackOccasion = extractOccasion(result);

    console.log('B2C Result:', { conversationId, resultCode, resultDesc, occasion: callbackOccasion });

    // Find withdrawal using multiple fallback methods
    const withdrawal = await findWithdrawal(supabaseAdmin, result);

    if (!withdrawal) {
      console.error('CRITICAL: Withdrawal not found for callback:', { conversationId, occasion: callbackOccasion });
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

    // Determine source entity type and name
    let sourceType = 'Group';
    let sourceName = 'your group';
    if (withdrawal.chama_id) {
      sourceType = 'Chama';
      // Fetch chama name
      const { data: chamaData } = await supabaseAdmin.from('chama').select('name').eq('id', withdrawal.chama_id).maybeSingle();
      sourceName = chamaData?.name || 'your Chama';
    } else if (withdrawal.mchango_id) {
      sourceType = 'Mchango';
      const { data: mchangoData } = await supabaseAdmin.from('mchango').select('title').eq('id', withdrawal.mchango_id).maybeSingle();
      sourceName = mchangoData?.title || 'your Mchango';
    } else if (withdrawal.organization_id) {
      sourceType = 'Organization';
      const { data: orgData } = await supabaseAdmin.from('organizations').select('name').eq('id', withdrawal.organization_id).maybeSingle();
      sourceName = orgData?.name || 'your Organization';
    } else if (withdrawal.welfare_id) {
      sourceType = 'Welfare';
      const { data: welfareData } = await supabaseAdmin.from('welfares').select('name').eq('id', withdrawal.welfare_id).maybeSingle();
      sourceName = welfareData?.name || 'your Welfare';
    }

    // Get recipient phone from profile
    let recipientPhone = '';
    if (withdrawal.requested_by) {
      const { data: profileData } = await supabaseAdmin.from('profiles').select('phone').eq('id', withdrawal.requested_by).maybeSingle();
      recipientPhone = profileData?.phone || '';
    }

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

      if (rpcError || !rpcResult?.success) {
        const atomicError = rpcError?.message || rpcResult?.error || 'Atomic completion failed';
        console.error('CRITICAL: Atomic completion failed, not marking as completed:', {
          withdrawalId: withdrawal.id,
          atomicError,
          rpcResult,
        });

        await supabaseAdmin
          .from('withdrawals')
          .update({
            status: 'failed',
            b2c_error_details: {
              atomic_completion_failed: true,
              reason: atomicError,
              callback_result_code: resultCode,
              callback_result_desc: resultDesc,
            },
            notes: (withdrawal.notes || '') + `\n[SYSTEM] Callback success received but atomic completion failed: ${atomicError}`,
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

      // Send detailed payout confirmation SMS
      if (recipientPhone) {
        const now = new Date();
        const eatTime = new Date(now.getTime() + 3 * 60 * 60 * 1000); // UTC+3
        const dateStr = eatTime.toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' });
        const timeStr = eatTime.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', hour12: true });
        const successMessage = `✅ Pamojanova Payout Confirmed!\nAmount: KES ${transactionAmount.toFixed(2)}\nRef: ${transactionId}\nFrom: ${sourceType} - ${sourceName}\nDate: ${dateStr} ${timeStr}\n\nSisi tuko pamoja, je wewe?`;
        await sendSMS(recipientPhone, successMessage);
      }

      // Push + in-app notification to the requester
      try {
        if (withdrawal.requested_by) {
          await createNotification(supabaseAdmin, {
            userId: withdrawal.requested_by,
            ...NotificationTemplates.withdrawalCompleted(transactionAmount || withdrawal.net_amount || withdrawal.amount),
            relatedEntityId: withdrawal.id,
            relatedEntityType: 'withdrawal',
          });
        }

        // Donor fan-out for campaign / organization withdrawals
        if (withdrawal.mchango_id) {
          const { data: donors } = await supabaseAdmin
            .from('mchango_donations')
            .select('phone')
            .eq('mchango_id', withdrawal.mchango_id)
            .eq('payment_status', 'completed');
          const phones = Array.from(new Set((donors || []).map((d: any) => d.phone).filter(Boolean)));
          if (phones.length) {
            const { data: donorProfiles } = await supabaseAdmin
              .from('profiles').select('id').in('phone', phones);
            await notifyManyUsers(supabaseAdmin, (donorProfiles || []).map((p: any) => p.id), {
              ...NotificationTemplates.campaignWithdrawal(sourceName, transactionAmount || withdrawal.net_amount || withdrawal.amount),
              relatedEntityId: withdrawal.mchango_id,
              relatedEntityType: 'mchango',
            });
          }
        } else if (withdrawal.organization_id) {
          const { data: donors } = await supabaseAdmin
            .from('organization_donations')
            .select('phone')
            .eq('organization_id', withdrawal.organization_id)
            .eq('payment_status', 'completed');
          const phones = Array.from(new Set((donors || []).map((d: any) => d.phone).filter(Boolean)));
          if (phones.length) {
            const { data: donorProfiles } = await supabaseAdmin
              .from('profiles').select('id').in('phone', phones);
            await notifyManyUsers(supabaseAdmin, (donorProfiles || []).map((p: any) => p.id), {
              ...NotificationTemplates.campaignWithdrawal(sourceName, transactionAmount || withdrawal.net_amount || withdrawal.amount),
              category: 'organization',
              relatedEntityId: withdrawal.organization_id,
              relatedEntityType: 'organization',
            });
          }
        }
      } catch (notifErr) {
        console.error('Error sending withdrawal notifications:', notifErr);
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
          await sendSMS(recipientPhone, `❌ Your ${sourceType} "${sourceName}" payout of KES ${withdrawal.net_amount?.toFixed(2)} failed after multiple attempts. Error: ${resultDesc}. Please contact support.`);
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
          await sendSMS(recipientPhone, `⚠️ Your ${sourceType} "${sourceName}" payout could not be processed. We will retry automatically. If not received within 1 hour, contact support.`);
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
