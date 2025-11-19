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

    // Parse account number to extract group code and member number
    // Format: ABC1, XYZ7, etc.
    const match = accountNumber.match(/^([A-Z]+)(\d+)$/);
    if (!match) {
      console.error('Invalid account number format:', accountNumber);
      return new Response(
        JSON.stringify({ 
          ResultCode: 1, 
          ResultDesc: `Invalid account number format: ${accountNumber}` 
        }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const [, groupCode, memberNumber] = match;
    console.log(`Parsed account number - Group: ${groupCode}, Member: ${memberNumber}`);

    // Check for duplicate payment (same M-Pesa receipt number)
    const { data: existingPayment } = await supabase
      .from('contributions')
      .select('id')
      .eq('payment_reference', mpesaReceiptNumber)
      .single();

    if (existingPayment) {
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

    // Try to find member in chama first
    const { data: chamaMemberData } = await supabase
      .from('chama_members')
      .select('id, user_id, chama_id, member_code')
      .eq('member_code', accountNumber)
      .maybeSingle();

    if (chamaMemberData) {
      console.log('Found Chama member:', chamaMemberData);

      // Get chama details
      const { data: chamaData } = await supabase
        .from('chama')
        .select('id, group_code, name, contribution_amount')
        .eq('id', chamaMemberData.chama_id)
        .single();

      // Record chama contribution
      const { error: contributionError } = await supabase
        .from('contributions')
        .insert({
          chama_id: chamaMemberData.chama_id,
          member_id: chamaMemberData.id,
          paid_by_member_id: chamaMemberData.id,
          amount: parseFloat(amount),
          payment_reference: mpesaReceiptNumber,
          status: 'completed',
          payment_notes: `Offline payment via till number. Payer: ${firstName} ${middleName || ''} ${lastName}. Phone: ${phoneNumber}`,
        });

      if (contributionError) {
        console.error('Error recording contribution:', contributionError);
        throw contributionError;
      }

      console.log('Contribution recorded successfully');

      // Send SMS notification (optional)
      if (chamaData) {
        try {
          await supabase.functions.invoke('send-transactional-sms', {
            body: {
              phone: phoneNumber,
              message: `Payment of KSh ${amount} received for ${chamaData.name}. Member ID: ${accountNumber}. Receipt: ${mpesaReceiptNumber}`,
            },
          });
        } catch (smsError) {
          console.error('Error sending SMS:', smsError);
          // Don't fail the whole transaction if SMS fails
        }
      }

      return new Response(
        JSON.stringify({ 
          ResultCode: 0, 
          ResultDesc: 'Payment accepted and recorded for Chama',
          type: 'chama'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Try savings group
    const { data: savingsMemberData } = await supabase
      .from('saving_group_members')
      .select('id, user_id, group_id, unique_member_id')
      .eq('unique_member_id', accountNumber)
      .maybeSingle();

    if (savingsMemberData) {
      console.log('Found Savings Group member:', savingsMemberData);

      // Get savings group details
      const { data: savingsGroupData } = await supabase
        .from('saving_groups')
        .select('id, group_code, name')
        .eq('id', savingsMemberData.group_id)
        .single();

      // Calculate commission (5%)
      const commissionRate = 0.05;
      const grossAmount = parseFloat(amount);
      const commissionAmount = grossAmount * commissionRate;
      const netAmount = grossAmount - commissionAmount;

      // Record savings deposit
      const { error: depositError } = await supabase
        .from('saving_deposits')
        .insert({
          group_id: savingsMemberData.group_id,
          member_id: savingsMemberData.id,
          user_id: savingsMemberData.user_id,
          paid_by_user_id: savingsMemberData.user_id,
          gross_amount: grossAmount,
          commission_amount: commissionAmount,
          net_amount: netAmount,
          payment_reference: mpesaReceiptNumber,
          notes: `Offline payment via till number. Payer: ${firstName} ${middleName || ''} ${lastName}. Phone: ${phoneNumber}`,
        });

      if (depositError) {
        console.error('Error recording deposit:', depositError);
        throw depositError;
      }

      console.log('Savings deposit recorded successfully');

      // Send SMS notification (optional)
      if (savingsGroupData) {
        try {
          await supabase.functions.invoke('send-transactional-sms', {
            body: {
              phone: phoneNumber,
              message: `Payment of KSh ${amount} received for ${savingsGroupData.name}. Net amount: KSh ${netAmount.toFixed(2)}. Member ID: ${accountNumber}. Receipt: ${mpesaReceiptNumber}`,
            },
          });
        } catch (smsError) {
          console.error('Error sending SMS:', smsError);
        }
      }

      return new Response(
        JSON.stringify({ 
          ResultCode: 0, 
          ResultDesc: 'Payment accepted and recorded for Savings Group',
          type: 'savings'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Member not found in either table
    console.error('Member not found for account number:', accountNumber);
    return new Response(
      JSON.stringify({ 
        ResultCode: 1, 
        ResultDesc: `Member not found with ID: ${accountNumber}. Please verify your member ID.` 
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
