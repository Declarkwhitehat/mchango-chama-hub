import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { corsHeaders } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const celcomApiKey = Deno.env.get('CELCOM_API_KEY');
const celcomPartnerId = Deno.env.get('CELCOM_PARTNER_ID');
const celcomShortcode = Deno.env.get('CELCOM_SHORTCODE');

const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MINUTES = 30;
const STUCK_APPROVED_THRESHOLD_HOURS = 1;

function extractConversationId(notes?: string | null): string | null {
  if (!notes) return null;
  const convMatch = notes.match(/ConvID=([^,\s]+)/);
  if (convMatch?.[1]) return convMatch[1];
  const agMatch = notes.match(/AG_[A-Za-z0-9_]+/);
  if (agMatch?.[0]) return agMatch[0];
  return null;
}

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    console.log('[RETRY] Starting failed payout retry at:', new Date().toISOString());

    const retryThreshold = new Date(Date.now() - RETRY_DELAY_MINUTES * 60 * 1000).toISOString();
    const stuckApprovedThreshold = new Date(Date.now() - STUCK_APPROVED_THRESHOLD_HOURS * 60 * 60 * 1000).toISOString();

    let retriedCount = 0;
    let finalFailureCount = 0;
    let stuckApprovedCount = 0;
    let reconciledProcessingCount = 0;
    let reconciliationFailedCount = 0;
    let statusQueryCount = 0;

    // 1. Handle stuck "approved" withdrawals (B2C was never triggered or failed silently)
    const { data: stuckApproved, error: stuckError } = await supabase
      .from('withdrawals')
      .select(`
        id, status, net_amount, notes, b2c_attempt_count, chama_id, mchango_id, requested_by, payment_method_id,
        payment_methods!payment_method_id(method_type, phone_number, account_number)
      `)
      .eq('status', 'approved')
      .lt('reviewed_at', stuckApprovedThreshold)
      .eq('b2c_attempt_count', 0);

    if (stuckError) {
      console.error('Error fetching stuck approved withdrawals:', stuckError);
    }

    console.log(`Found ${stuckApproved?.length || 0} stuck approved withdrawals`);

    for (const stuck of stuckApproved || []) {
      console.log(`Recovering stuck approved withdrawal ${stuck.id}`);
      
      await supabase
        .from('withdrawals')
        .update({
          status: 'pending_retry',
          notes: (stuck.notes || '') + `\n[SYSTEM] Stuck approved withdrawal recovered at ${new Date().toISOString()}`
        })
        .eq('id', stuck.id);

      stuckApprovedCount++;
    }

    // 2. Reconcile all currently processing withdrawals via Transaction Status Query
    try {
      const reconcileRes = await fetch(`${supabaseUrl}/functions/v1/b2c-status-query`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reconcile_all_processing: true,
          max_records: 500,
        }),
      });

      const reconcileJson = await reconcileRes.json();
      if (reconcileRes.ok) {
        reconciledProcessingCount = Number(reconcileJson.reconciled || 0);
        reconciliationFailedCount = Number(reconcileJson.failed_queries || 0);
        console.log(`[RETRY] Processing reconciliation done:`, reconcileJson);
      } else {
        reconciliationFailedCount += 1;
        console.error(`[RETRY] Processing reconciliation failed:`, reconcileJson);
      }
    } catch (reconcileError: any) {
      reconciliationFailedCount += 1;
      console.error('[RETRY] Processing reconciliation exception:', reconcileError);
    }

    // 3. Find withdrawals that need retry
    const { data: failedWithdrawals, error: fetchError } = await supabase
      .from('withdrawals')
      .select(`
        id, status, net_amount, notes, b2c_attempt_count, chama_id, mchango_id, requested_by, payment_method_id, last_b2c_attempt_at, created_at,
        payment_methods!payment_method_id(method_type, phone_number, account_number)
      `)
      .in('status', ['failed', 'pending_retry'])
      .lt('b2c_attempt_count', MAX_RETRY_ATTEMPTS)
      .or(`last_b2c_attempt_at.is.null,last_b2c_attempt_at.lt.${retryThreshold}`)
      .order('created_at', { ascending: true });

    if (fetchError) {
      console.error('Error fetching failed withdrawals:', fetchError);
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`Found ${failedWithdrawals?.length || 0} withdrawals to retry`);

    for (const withdrawal of failedWithdrawals || []) {
      const paymentMethod = withdrawal.payment_methods;
      const attemptNumber = (withdrawal.b2c_attempt_count || 0) + 1;

      // Only retry M-Pesa payments
      if (paymentMethod?.method_type !== 'mpesa' || !paymentMethod?.phone_number) {
        console.log(`Skipping non-M-Pesa withdrawal: ${withdrawal.id}`);
        continue;
      }

      // KEY FIX: If this withdrawal already has a ConversationID from a previous
      // B2C attempt, query Safaricom's Transaction Status API FIRST instead of
      // blindly re-sending money. The original B2C may have succeeded.
      const existingConvId = extractConversationId(withdrawal.notes);

      if (existingConvId) {
        console.log(`[RETRY] Withdrawal ${withdrawal.id} has existing ConvID=${existingConvId}. Querying status first instead of re-sending B2C.`);

        try {
          const statusRes = await fetch(`${supabaseUrl}/functions/v1/b2c-status-query`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseServiceKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ withdrawal_id: withdrawal.id }),
          });

          const statusJson = await statusRes.json();
          console.log(`[RETRY] Status query result for ${withdrawal.id}:`, statusJson);

          // Update notes with status query result
          await supabase
            .from('withdrawals')
            .update({
              notes: (withdrawal.notes || '') + `\n[SYSTEM] Retry status-query at ${new Date().toISOString()} for ConvID=${existingConvId}: ${JSON.stringify(statusJson).substring(0, 250)}`,
            })
            .eq('id', withdrawal.id);

          statusQueryCount++;
          // The b2c-status-query sends a TransactionStatusQuery to Safaricom.
          // The result will arrive via the b2c-callback, which will complete or
          // fail the withdrawal automatically. Do NOT re-send B2C here.
          continue;

        } catch (statusError: any) {
          console.error(`[RETRY] Status query failed for ${withdrawal.id}:`, statusError);
          // If status query itself fails, still don't blindly re-send B2C.
          // Just note it and move on; next retry cycle will try again.
          await supabase
            .from('withdrawals')
            .update({
              notes: (withdrawal.notes || '') + `\n[SYSTEM] Retry status-query exception at ${new Date().toISOString()}: ${statusError.message}`,
            })
            .eq('id', withdrawal.id);
          continue;
        }
      }

      // No existing ConversationID — safe to attempt B2C
      console.log(`Retrying withdrawal ${withdrawal.id} (attempt ${attemptNumber}/${MAX_RETRY_ATTEMPTS})`);

      try {
        const b2cResponse = await fetch(`${supabaseUrl}/functions/v1/b2c-payout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            withdrawal_id: withdrawal.id,
            phone_number: paymentMethod.phone_number,
            amount: withdrawal.net_amount
          })
        });

        const b2cResult = await b2cResponse.json();

        if (b2cResponse.ok && b2cResult.success) {
          console.log(`B2C initiated for withdrawal ${withdrawal.id}: ${b2cResult.conversation_id || b2cResult.payout_reference}`);
          retriedCount++;
        } else {
          console.error(`B2C failed for withdrawal ${withdrawal.id}:`, b2cResult);

          if (attemptNumber >= MAX_RETRY_ATTEMPTS) {
            await supabase
              .from('withdrawals')
              .update({
                status: 'failed',
                b2c_error_details: {
                  final_failure: true,
                  last_error: b2cResult.error || 'Unknown error',
                  total_attempts: attemptNumber
                },
                notes: (withdrawal.notes || '') + `\n[SYSTEM] FINAL FAILURE after ${attemptNumber} attempts: ${b2cResult.error || 'Unknown error'}`
              })
              .eq('id', withdrawal.id);

            const phone = paymentMethod?.phone_number;
            if (phone) {
              const chamaName = withdrawal.chama_id ? 'your Chama' : 'your Mchango';
              const message = `❌ Your ${chamaName} payout of KES ${withdrawal.net_amount?.toFixed(2)} failed after multiple attempts. Error: ${b2cResult.error || 'Payment provider error'}. Please update your payment method or contact support.`;
              await sendSMS(phone, message);
            }

            finalFailureCount++;
          }
        }
      } catch (error: any) {
        console.error(`Error triggering B2C for ${withdrawal.id}:`, error);

        if (attemptNumber >= MAX_RETRY_ATTEMPTS) {
          await supabase
            .from('withdrawals')
            .update({
              status: 'failed',
              b2c_error_details: {
                final_failure: true,
                last_error: error.message,
                total_attempts: attemptNumber
              },
              notes: (withdrawal.notes || '') + `\n[SYSTEM] FINAL FAILURE (exception): ${error.message}`
            })
            .eq('id', withdrawal.id);
          finalFailureCount++;
        } else {
          await supabase
            .from('withdrawals')
            .update({
              status: 'pending_retry',
              b2c_error_details: { last_error: error.message, attempt: attemptNumber },
              notes: (withdrawal.notes || '') + `\n[SYSTEM] Retry failed (exception): ${error.message}`
            })
            .eq('id', withdrawal.id);
        }
      }
    }

    console.log(`[RETRY] Completed. Retried: ${retriedCount}, Status queries: ${statusQueryCount}, Final failures: ${finalFailureCount}, Stuck approved recovered: ${stuckApprovedCount}, Reconciled processing: ${reconciledProcessingCount}, Reconcile failures: ${reconciliationFailedCount}`);

    return new Response(JSON.stringify({
      success: true,
      retried: retriedCount,
      statusQueries: statusQueryCount,
      finalFailures: finalFailureCount,
      stuckApprovedRecovered: stuckApprovedCount,
      reconciledProcessing: reconciledProcessingCount,
      reconciliationFailures: reconciliationFailedCount,
      totalProcessed: (failedWithdrawals?.length || 0) + stuckApprovedCount + reconciledProcessingCount
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('[RETRY] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
