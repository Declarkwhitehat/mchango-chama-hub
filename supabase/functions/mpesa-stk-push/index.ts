import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Normalize phone number to 254XXXXXXXXX format (without + prefix)
 * Accepts: +254XXXXXXXXX, 0XXXXXXXXX, 254XXXXXXXXX, 7XXXXXXXX
 * Returns: 254XXXXXXXXX or null if invalid
 */
const normalizePhone = (phone: string): string | null => {
  if (!phone) return null;
  
  // Remove all non-digits
  const digits = phone.replace(/\D/g, '');
  
  // Handle different formats
  if (digits.startsWith('254') && digits.length === 12) {
    return digits; // Already 254XXXXXXXXX
  }
  if (digits.startsWith('0') && digits.length === 10) {
    return '254' + digits.substring(1); // 0XXXXXXXXX → 254XXXXXXXXX
  }
  if (digits.length === 9 && /^[17]/.test(digits)) {
    return '254' + digits; // 7XXXXXXXX or 1XXXXXXXX → 254XXXXXXXXX
  }
  
  return null; // Invalid format
};

const validateAmount = (amount: number): boolean => {
  return amount >= 1 && amount <= 1000000 && Number.isFinite(amount);
};

interface STKPushRequest {
  phone_number: string;
  amount: number;
  account_reference: string;
  transaction_desc: string;
  chama_id?: string;
  mchango_id?: string;
  callback_metadata?: Record<string, any>;
}

const CHAMA_COMMISSION_RATE = 0.05; // 5% commission for chama

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body: STKPushRequest = await req.json();
    console.log('Incoming STK push request:', { ...body, phone_number: body.phone_number?.substring(0, 7) + '****' });

    // Normalize and validate phone number
    const normalizedPhone = normalizePhone(body.phone_number);
    if (!normalizedPhone) {
      return new Response(
        JSON.stringify({ error: 'Invalid phone number format. Accepted formats: +254XXXXXXXXX, 0XXXXXXXXX, 254XXXXXXXXX' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    console.log('Normalized phone:', normalizedPhone.substring(0, 6) + '****');

    if (!validateAmount(body.amount)) {
      return new Response(
        JSON.stringify({ error: 'Invalid amount. Must be between 1 and 1,000,000' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (body.account_reference && body.account_reference.length > 100) {
      return new Response(
        JSON.stringify({ error: 'Account reference too long (max 100 characters)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const consumerKey = Deno.env.get('MPESA_CONSUMER_KEY') ?? '';
    const consumerSecret = Deno.env.get('MPESA_CONSUMER_SECRET') ?? '';
    const passkey = Deno.env.get('MPESA_PASSKEY') ?? '';
    const tillNumber = Deno.env.get('MPESA_TILL_NUMBER') ?? '';
    // For Buy Goods (Till), BusinessShortCode = Store/Head Office Number, PartyB = Till Number
    const shortcode = Deno.env.get('MPESA_SHORTCODE') ?? '';

    // Validate credentials
    if (!consumerKey || !consumerSecret || !passkey || !tillNumber || !shortcode) {
      console.error('Missing M-Pesa credentials:', {
        hasConsumerKey: !!consumerKey,
        hasConsumerSecret: !!consumerSecret,
        hasPasskey: !!passkey,
        hasTillNumber: !!tillNumber,
        hasShortcode: !!shortcode
      });
      return new Response(
        JSON.stringify({ error: 'M-Pesa not configured. Please contact support.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log('M-Pesa config:', { shortcode, tillNumber });

    // --- Step 1: Get Access Token (PRODUCTION) ---
    const auth = btoa(`${consumerKey}:${consumerSecret}`);
    const tokenResponse = await fetch(
      'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
      { headers: { Authorization: `Basic ${auth}` } }
    );

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('OAuth failed:', tokenResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to authenticate with M-Pesa. Please try again.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tokenData = await tokenResponse.json();
    console.log('Access Token Response:', { hasToken: !!tokenData.access_token });

    if (!tokenData.access_token) {
      console.error('No access token in response:', tokenData);
      throw new Error('Failed to get access token from Safaricom.');
    }

    const timestamp = new Date()
      .toISOString()
      .replace(/[-T:.Z]/g, '')
      .slice(0, 14);
    const password = btoa(shortcode + passkey + timestamp);

    const callbackUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/mpesa-callback`;
    console.log('Using Callback URL:', callbackUrl);

    // --- Step 2: Prepare STK Push Payload (Buy Goods for Till Number) ---
    const payload = {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerBuyGoodsOnline', // Changed for Till Number
      Amount: body.amount,
      PartyA: normalizedPhone,
      PartyB: tillNumber, // Till Number instead of shortcode
      PhoneNumber: normalizedPhone,
      CallBackURL: callbackUrl,
      AccountReference: body.account_reference || 'Donation',
      TransactionDesc: body.transaction_desc || 'Donation Payment',
    };

    console.log('STK Push payload:', { ...payload, Password: '****', PartyB: tillNumber });

    // --- Step 3: Send STK Push (PRODUCTION) ---
    const stkResponse = await fetch(
      'https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    );

    const result = await stkResponse.json();
    console.log('STK Push API Response:', result);

    // --- Step 3.1: If this is a donation, persist CheckoutRequestID immediately (prevents race with callback) ---
    if (result?.CheckoutRequestID && body.callback_metadata?.donation_id) {
      const checkoutRequestId = result.CheckoutRequestID as string;
      const donationId = body.callback_metadata.donation_id as string;

      const { error: donationUpdateError } = await supabaseClient
        .from('mchango_donations')
        .update({ payment_reference: checkoutRequestId })
        .eq('id', donationId);

      if (donationUpdateError) {
        console.error('Error updating donation with CheckoutRequestID:', donationUpdateError);
      } else {
        console.log('Donation updated with CheckoutRequestID:', { donationId, checkoutRequestId });
      }
    }

    // --- Step 4: Create or update deposit record if this is a savings deposit ---
    let depositId = null;
    if (body.callback_metadata?.type === 'savings_deposit' && result.CheckoutRequestID) {
      const checkoutRequestId = result.CheckoutRequestID;
      const commissionAmount = body.amount * 0.01;
      const netAmount = body.amount - commissionAmount;
      const isRetry = body.callback_metadata.is_retry || false;
      const existingDepositId = body.callback_metadata.existing_deposit_id;
      const retryCount = body.callback_metadata.retry_count || 0;

      if (isRetry && existingDepositId) {
        // Update existing deposit for retry
        console.log('Updating existing deposit for retry:', {
          depositId: existingDepositId,
          checkoutRequestId,
          retryCount
        });

        const { data: updateResult, error: updateError } = await supabaseClient
          .from('saving_group_deposits')
          .update({
            payment_reference: checkoutRequestId,
            status: 'pending',
            retry_count: retryCount,
            last_retry_at: new Date().toISOString(),
            failed_reason: null, // Clear previous failure reason
          })
          .eq('id', existingDepositId)
          .select()
          .single();

        if (updateError) {
          console.error('Error updating deposit record:', updateError);
        } else {
          depositId = existingDepositId;
          console.log('Deposit record updated for retry:', depositId);
        }
      } else {
        // Create new deposit record
        console.log('Creating new pending deposit record:', {
          groupId: body.callback_metadata.group_id,
          amount: body.amount,
          checkoutRequestId
        });

        const { data: depositRecord, error: depositError } = await supabaseClient
          .from('saving_group_deposits')
          .insert({
            saving_group_id: body.callback_metadata.group_id,
            member_user_id: body.callback_metadata.beneficiary_user_id,
            payer_user_id: body.callback_metadata.payer_user_id,
            amount: body.amount,
            commission_amount: commissionAmount,
            net_amount: netAmount,
            payment_reference: checkoutRequestId,
            status: 'pending',
            saved_for_member_id: body.callback_metadata.saved_for_member_id || null,
            retry_count: 0,
            max_retries: 3,
          })
          .select()
          .single();

        if (depositError) {
          console.error('Error creating deposit record:', depositError);
        } else {
          depositId = depositRecord.id;
          console.log('Deposit record created:', depositId);
        }
      }
    }

    // --- Step 5: Create pending contribution if this is a chama contribution ---
    let contributionId = null;
    if (body.callback_metadata?.type === 'chama_contribution' && result.CheckoutRequestID) {
      const checkoutRequestId = result.CheckoutRequestID;
      
      console.log('Creating pending chama contribution:', {
        chamaId: body.callback_metadata.chama_id,
        memberId: body.callback_metadata.member_id,
        amount: body.amount,
        checkoutRequestId
      });

      const { data: contributionRecord, error: contributionError } = await supabaseClient
        .from('contributions')
        .insert({
          chama_id: body.callback_metadata.chama_id,
          member_id: body.callback_metadata.member_id,
          paid_by_member_id: body.callback_metadata.paid_by_member_id,
          amount: body.amount,
          payment_reference: checkoutRequestId,
          status: 'pending',
          payment_notes: body.callback_metadata.notes || null,
        })
        .select()
        .single();

      if (contributionError) {
        console.error('Error creating contribution record:', contributionError);
      } else {
        contributionId = contributionRecord.id;
        console.log('Contribution record created:', contributionId);
      }
    }

    // --- Step 6: Return result with deposit_id and contribution_id ---
    return new Response(JSON.stringify({ ...result, deposit_id: depositId, contribution_id: contributionId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('STK Push error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
