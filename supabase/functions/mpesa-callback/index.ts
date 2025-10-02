import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
      Deno.env.get('VITE_SUPABASE_URL') ?? '',
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

    // Find the transaction by checkout request ID
    const { data: transactions } = await supabaseClient
      .from('transactions')
      .select('*')
      .eq('metadata->>checkout_request_id', checkoutRequestId);

    if (!transactions || transactions.length === 0) {
      console.error('Transaction not found for checkout request:', checkoutRequestId);
      return new Response(
        JSON.stringify({ error: 'Transaction not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const transaction = transactions[0];

    // Determine transaction status based on result code
    let status = 'failed';
    let mpesaReceiptNumber = null;

    if (resultCode === 0) {
      status = 'confirmed';
      
      // Extract M-PESA receipt number from callback items
      const callbackMetadata = stkCallback.CallbackMetadata?.Item || [];
      const receiptItem = callbackMetadata.find((item: any) => item.Name === 'MpesaReceiptNumber');
      if (receiptItem) {
        mpesaReceiptNumber = receiptItem.Value;
      }
    }

    // Update transaction
    const { data: updatedTransaction, error: updateError } = await supabaseClient
      .from('transactions')
      .update({
        status: status,
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
    if (status === 'confirmed' && transaction.mchango_id) {
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

  } catch (error) {
    console.error('Callback error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
