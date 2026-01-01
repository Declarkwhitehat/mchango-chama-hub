import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
      .select('*')
      .eq('payment_reference', conversationId)
      .single();

    if (findError || !withdrawal) {
      console.error('Withdrawal not found for conversation:', conversationId);
      // Still return success to M-Pesa
      return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: 'Accepted' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (resultCode === 0) {
      // Payment successful
      let transactionId = '';
      let transactionAmount = 0;
      let recipientPhone = '';

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
              recipientPhone = param.Value;
              break;
          }
        }
      }

      console.log('B2C Success:', { transactionId, transactionAmount, recipientPhone });

      // Update withdrawal as completed
      const { error: updateError } = await supabaseAdmin
        .from('withdrawals')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          payment_reference: transactionId || conversationId,
          notes: (withdrawal.notes || '') + `\n[SYSTEM] B2C completed: ${transactionId}, Amount: ${transactionAmount}`
        })
        .eq('id', withdrawal.id);

      if (updateError) {
        console.error('Failed to update withdrawal:', updateError);
      }

      // If it's a mchango withdrawal, update the current_amount
      if (withdrawal.mchango_id) {
        const { error: mchangoError } = await supabaseAdmin
          .from('mchango')
          .update({
            current_amount: supabaseAdmin.rpc('subtract_amount', {
              mchango_id: withdrawal.mchango_id,
              amount: withdrawal.amount
            })
          })
          .eq('id', withdrawal.mchango_id);

        // Alternative: Direct update
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

      await supabaseAdmin
        .from('withdrawals')
        .update({
          status: 'failed',
          notes: (withdrawal.notes || '') + `\n[SYSTEM] B2C failed: ${resultDesc}`
        })
        .eq('id', withdrawal.id);
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
