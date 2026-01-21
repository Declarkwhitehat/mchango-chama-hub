import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { corsHeaders } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const celcomApiKey = Deno.env.get('CELCOM_API_KEY');
const celcomPartnerId = Deno.env.get('CELCOM_PARTNER_ID');
const celcomShortcode = Deno.env.get('CELCOM_SHORTCODE');

const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MINUTES = 30; // Minimum time between retries

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

    // Find withdrawals that need retry:
    // - Status is 'failed' or 'pending_retry'
    // - Less than MAX_RETRY_ATTEMPTS
    // - Last attempt was more than RETRY_DELAY_MINUTES ago (or never attempted)
    const retryThreshold = new Date(Date.now() - RETRY_DELAY_MINUTES * 60 * 1000).toISOString();

    const { data: failedWithdrawals, error: fetchError } = await supabase
      .from('withdrawals')
      .select(`
        *,
        profiles:requested_by(full_name, phone),
        payment_methods:payment_method_id(method_type, phone_number, account_number)
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

    let retriedCount = 0;
    let successCount = 0;
    let finalFailureCount = 0;

    for (const withdrawal of failedWithdrawals || []) {
      const paymentMethod = withdrawal.payment_methods;
      const attemptNumber = (withdrawal.b2c_attempt_count || 0) + 1;

      console.log(`Retrying withdrawal ${withdrawal.id} (attempt ${attemptNumber}/${MAX_RETRY_ATTEMPTS})`);

      // Only retry M-Pesa payments
      if (paymentMethod?.method_type !== 'mpesa' || !paymentMethod?.phone_number) {
        console.log(`Skipping non-M-Pesa withdrawal: ${withdrawal.id}`);
        continue;
      }

      // Update attempt tracking before calling B2C
      await supabase
        .from('withdrawals')
        .update({
          b2c_attempt_count: attemptNumber,
          last_b2c_attempt_at: new Date().toISOString(),
          status: 'processing',
          notes: (withdrawal.notes || '') + `\n[SYSTEM] Retry attempt ${attemptNumber} at ${new Date().toISOString()}`
        })
        .eq('id', withdrawal.id);

      try {
        // Trigger B2C payout
        const b2cResponse = await fetch(`${supabaseUrl}/functions/v1/mpesa-b2c-payout`, {
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
          console.log(`B2C initiated for withdrawal ${withdrawal.id}: ${b2cResult.conversation_id}`);
          retriedCount++;
        } else {
          console.error(`B2C failed for withdrawal ${withdrawal.id}:`, b2cResult);

          // Check if this is the final attempt
          if (attemptNumber >= MAX_RETRY_ATTEMPTS) {
            // Mark as final failure
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

            // Send final failure SMS
            const phone = withdrawal.profiles?.phone || paymentMethod?.phone_number;
            if (phone) {
              const chamaName = withdrawal.chama_id ? 'your Chama' : 'your Mchango';
              const message = `❌ Your ${chamaName} payout of KES ${withdrawal.net_amount?.toFixed(2)} failed after multiple attempts. Error: ${b2cResult.error || 'Payment provider error'}. Please update your payment method or contact support.`;
              await sendSMS(phone, message);
            }

            finalFailureCount++;
          } else {
            // Mark for retry later
            await supabase
              .from('withdrawals')
              .update({
                status: 'pending_retry',
                b2c_error_details: {
                  last_error: b2cResult.error || 'Unknown error',
                  attempt: attemptNumber
                }
              })
              .eq('id', withdrawal.id);
          }
        }
      } catch (error: any) {
        console.error(`Error triggering B2C for ${withdrawal.id}:`, error);

        // Mark for retry if not final attempt
        if (attemptNumber >= MAX_RETRY_ATTEMPTS) {
          await supabase
            .from('withdrawals')
            .update({
              status: 'failed',
              b2c_error_details: {
                final_failure: true,
                last_error: error.message,
                total_attempts: attemptNumber
              }
            })
            .eq('id', withdrawal.id);
          finalFailureCount++;
        } else {
          await supabase
            .from('withdrawals')
            .update({
              status: 'pending_retry',
              b2c_error_details: { last_error: error.message, attempt: attemptNumber }
            })
            .eq('id', withdrawal.id);
        }
      }
    }

    // Also check for stalled "processing" withdrawals (stuck for more than 10 minutes)
    const stalledThreshold = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    
    const { data: stalledWithdrawals } = await supabase
      .from('withdrawals')
      .select('id, notes, b2c_attempt_count')
      .eq('status', 'processing')
      .lt('last_b2c_attempt_at', stalledThreshold);

    for (const stalled of stalledWithdrawals || []) {
      console.log(`Marking stalled withdrawal ${stalled.id} for retry`);
      
      await supabase
        .from('withdrawals')
        .update({
          status: 'pending_retry',
          notes: (stalled.notes || '') + `\n[SYSTEM] Marked as stalled at ${new Date().toISOString()}`
        })
        .eq('id', stalled.id);
    }

    console.log(`[RETRY] Completed. Retried: ${retriedCount}, Final failures: ${finalFailureCount}, Stalled reset: ${stalledWithdrawals?.length || 0}`);

    return new Response(JSON.stringify({
      success: true,
      retried: retriedCount,
      finalFailures: finalFailureCount,
      stalledReset: stalledWithdrawals?.length || 0,
      totalProcessed: failedWithdrawals?.length || 0
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
