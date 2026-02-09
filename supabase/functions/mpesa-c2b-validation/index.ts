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

    const validationData = await req.json();
    console.log('Received C2B validation request:', JSON.stringify(validationData, null, 2));

    // Extract validation details
    const {
      TransAmount: amount,
      BillRefNumber: accountNumber,
      MSISDN: phoneNumber,
    } = validationData;

    // Basic validation rules
    if (!accountNumber) {
      console.log('Rejected: Missing account number');
      return new Response(
        JSON.stringify({ 
          ResultCode: 'C2B00011', 
          ResultDesc: 'Account number is required' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Validate amount
    if (!amount || parseFloat(amount) <= 0) {
      console.log('Rejected: Invalid amount:', amount);
      return new Response(
        JSON.stringify({ 
          ResultCode: 'C2B00011', 
          ResultDesc: 'Invalid payment amount' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Normalize account number to uppercase for lookup
    const upperAccountNumber = accountNumber.toUpperCase().trim();

    // Validate minimum length (at least 4 characters)
    if (upperAccountNumber.length < 4) {
      console.log('Rejected: Account number too short:', accountNumber);
      return new Response(
        JSON.stringify({ 
          ResultCode: 'C2B00011', 
          ResultDesc: 'Invalid payment code. Must be at least 4 characters.' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // ============================================
    // CRITICAL: Validate the account number exists in our system
    // This prevents payments to non-existent accounts
    // ============================================

    // Check 1: Chama member by full member_code (8-character format like ACT5MOO1)
    const { data: chamaMember } = await supabase
      .from('chama_members')
      .select('id, member_code')
      .eq('member_code', upperAccountNumber)
      .eq('status', 'active')
      .maybeSingle();

    if (chamaMember) {
      console.log('✅ Validation passed - Found Chama member:', chamaMember.member_code);
      return new Response(
        JSON.stringify({
          ResultCode: 0,
          ResultDesc: 'Accepted - Chama member found'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Check 2: Mchango by paybill_account_id (e.g., MCAB1234) or group_code
    const { data: mchango } = await supabase
      .from('mchango')
      .select('id, paybill_account_id, group_code')
      .or(`paybill_account_id.eq.${upperAccountNumber},group_code.eq.${upperAccountNumber}`)
      .eq('status', 'active')
      .maybeSingle();

    if (mchango) {
      console.log('✅ Validation passed - Found Mchango campaign:', mchango.paybill_account_id || mchango.group_code);
      return new Response(
        JSON.stringify({
          ResultCode: 0,
          ResultDesc: 'Accepted - Mchango campaign found'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Check 3: Organization by paybill_account_id (e.g., ORGXY7890) or group_code
    const { data: organization } = await supabase
      .from('organizations')
      .select('id, paybill_account_id, group_code')
      .or(`paybill_account_id.eq.${upperAccountNumber},group_code.eq.${upperAccountNumber}`)
      .eq('status', 'active')
      .maybeSingle();

    if (organization) {
      console.log('✅ Validation passed - Found Organization:', organization.paybill_account_id || organization.group_code);
      return new Response(
        JSON.stringify({
          ResultCode: 0,
          ResultDesc: 'Accepted - Organization found'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // ============================================
    // REJECTED: Account number not found in any table
    // This prevents the payment from going through
    // ============================================
    console.log('❌ Rejected: Account number not found in system:', accountNumber);
    console.log('Searched tables: chama_members, mchango, organizations');
    
    return new Response(
      JSON.stringify({ 
        ResultCode: 'C2B00011', 
        ResultDesc: `Payment code "${accountNumber}" not found. Please verify and try again.` 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error in C2B validation:', error);
    // On error, REJECT the payment to be safe - better to reject than credit wrong account
    return new Response(
      JSON.stringify({
        ResultCode: 'C2B00012',
        ResultDesc: 'System error - please try again later'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
