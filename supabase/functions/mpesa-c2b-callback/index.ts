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

    // Parse account number: 8 characters total
    // Format: ACT5MOO1 where first 4 chars = chama code, last 4 chars = member suffix
    // Also support legacy formats for backwards compatibility
    const upperAccountNumber = accountNumber.toUpperCase();
    
    // Extract group code (first 4 characters for new format, or variable for legacy)
    let groupCode: string;
    let memberSuffix: string;
    
    if (upperAccountNumber.length === 8) {
      // New format: ACT5MOO1 (4 + 4)
      groupCode = upperAccountNumber.substring(0, 4);
      memberSuffix = upperAccountNumber.substring(4, 8);
    } else if (upperAccountNumber.length >= 4) {
      // Legacy format or mchango code - treat entire value as the lookup key
      groupCode = upperAccountNumber;
      memberSuffix = '';
    } else {
      console.error('Invalid account number length:', accountNumber);
      return new Response(
        JSON.stringify({ 
          ResultCode: 1, 
          ResultDesc: `Invalid account number format: ${accountNumber}. Expected 8-character code (e.g., ACT5MOO1)` 
        }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log(`Parsed account number - Group: ${groupCode}, Member suffix: ${memberSuffix}, Full: ${upperAccountNumber}`);

    // Check for duplicate payment (same M-Pesa receipt number) across all tables
    const [
      { data: existingContribution },
      { data: existingDeposit },
      { data: existingDonation }
    ] = await Promise.all([
      supabase.from('contributions').select('id').eq('payment_reference', mpesaReceiptNumber).maybeSingle(),
      supabase.from('saving_deposits').select('id').eq('payment_reference', mpesaReceiptNumber).maybeSingle(),
      supabase.from('mchango_donations').select('id').eq('payment_reference', mpesaReceiptNumber).maybeSingle(),
    ]);

    if (existingContribution || existingDeposit || existingDonation) {
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

    // Try to find member in chama first using full member code
    const { data: chamaMemberData } = await supabase
      .from('chama_members')
      .select('id, user_id, chama_id, member_code')
      .eq('member_code', upperAccountNumber)
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

    // Try mchango (fundraising campaign) - matches by group_code directly
    const { data: mchangoData } = await supabase
      .from('mchango')
      .select('id, group_code, title, current_amount')
      .eq('group_code', accountNumber.toUpperCase())
      .eq('status', 'active')
      .maybeSingle();

    if (mchangoData) {
      console.log('Found Mchango campaign:', mchangoData);

      // Calculate commission (15% for mchango)
      const commissionRate = 0.15;
      const grossAmount = parseFloat(amount);
      const commissionAmount = grossAmount * commissionRate;
      const netAmount = grossAmount - commissionAmount;

      // Create donor display name
      const displayName = `${firstName} ${middleName || ''} ${lastName}`.trim();

      // Record mchango donation
      const { error: donationError } = await supabase
        .from('mchango_donations')
        .insert({
          mchango_id: mchangoData.id,
          amount: grossAmount,
          display_name: displayName || 'Anonymous',
          phone: phoneNumber,
          is_anonymous: false,
          payment_reference: mpesaReceiptNumber,
          payment_method: 'mpesa_offline',
          payment_status: 'completed',
          completed_at: new Date().toISOString(),
        });

      if (donationError) {
        console.error('Error recording mchango donation:', donationError);
        throw donationError;
      }

      console.log('Mchango donation recorded successfully');

      // Send SMS notification
      try {
        await supabase.functions.invoke('send-transactional-sms', {
          body: {
            phone: phoneNumber,
            message: `Thank you for your donation of KSh ${amount} to "${mchangoData.title}". Receipt: ${mpesaReceiptNumber}`,
          },
        });
      } catch (smsError) {
        console.error('Error sending SMS:', smsError);
      }

      return new Response(
        JSON.stringify({ 
          ResultCode: 0, 
          ResultDesc: 'Donation accepted and recorded for Mchango',
          type: 'mchango'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Not found in any table
    console.error('Account not found:', accountNumber);
    return new Response(
      JSON.stringify({ 
        ResultCode: 1, 
        ResultDesc: `Account not found with ID: ${accountNumber}. Please verify your payment code.` 
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
