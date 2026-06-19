import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { isModuleInMaintenance, maintenanceResponse } from "../_shared/checkMaintenance.ts";

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

    // Module maintenance gate
    const targetModule = body.chama_id ? 'chama' : body.mchango_id ? 'donations' : (body as any).welfare_id ? 'welfare' : null;
    if (targetModule && await isModuleInMaintenance(targetModule as any)) {
      return maintenanceResponse(targetModule as any, corsHeaders);
    }


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

    // ═══ SERVER-SIDE CHAMA CONTRIBUTION AMOUNT VERIFICATION ═══
    // Uses get_member_live_outstanding so the validator matches the UI exactly
    // (unpaid cycles + outstanding debt principal). Penalty is collected on top
    // by the settlement engine when the payment arrives.
    if (
      body.callback_metadata?.type === 'chama_contribution' &&
      body.chama_id &&
      body.callback_metadata?.member_id
    ) {
      const chamaId = body.chama_id as string;
      const memberId = body.callback_metadata.member_id as string;

      const { data: chamaRow, error: chamaErr } = await supabaseClient
        .from('chama')
        .select('contribution_amount')
        .eq('id', chamaId)
        .maybeSingle();

      if (chamaErr || !chamaRow) {
        console.error('Chama lookup failed for STK amount verification:', chamaErr);
        return new Response(
          JSON.stringify({ error: 'Could not verify contribution amount. Please try again.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const baseContribution = Number(chamaRow.contribution_amount || 0);
      let owedFromLive = 0;
      let walletCredit = 0;

      const { data: liveRow, error: liveErr } = await supabaseClient
        .rpc('get_member_live_outstanding', {
          p_member_id: memberId,
          p_chama_id: chamaId,
        });

      if (!liveErr && liveRow && !(liveRow as any).error) {
        owedFromLive = Number((liveRow as any).total_outstanding_no_penalty || 0);
        walletCredit = Number((liveRow as any).wallet_credit_net || 0);
      } else if (liveErr) {
        console.warn('Live outstanding lookup failed, falling back to base contribution:', liveErr);
      }

      const owedAfterCredit = Math.max(owedFromLive - walletCredit, 0);
      // If no debts and no unpaid cycles, allow base contribution as the minimum
      const required = owedFromLive > 0 ? owedAfterCredit : baseContribution;

      if (required > 0 && body.amount < required) {
        console.warn('[security] STK push rejected — chama amount below required', {
          chamaId, memberId, submitted: body.amount, required,
        });
        return new Response(
          JSON.stringify({
            error: `Amount below required contribution. Required: KES ${required}, Submitted: KES ${body.amount}.`,
            required,
            submitted: body.amount,
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // --- Optional: Create organization donation row up-front (avoids client-side RLS issues) ---
    let organizationDonationId: string | null = null;
    if (body.callback_metadata?.type === 'organization_donation') {
      const orgId = body.callback_metadata.organization_id as string | undefined;
      if (!orgId) {
        return new Response(
          JSON.stringify({ error: 'Missing organization_id' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const donorName = (body.callback_metadata.display_name as string | undefined) || 'Anonymous';
      const isAnonymous = Boolean(body.callback_metadata.is_anonymous);
      const donorEmail = (body.callback_metadata.email as string | null | undefined) ?? null;

      const { data: orgDonation, error: orgDonationError } = await supabaseClient
        .from('organization_donations')
        .insert({
          organization_id: orgId,
          user_id: null,
          display_name: donorName,
          phone: normalizedPhone, // Use normalized phone format
          email: donorEmail,
          amount: body.amount,
          is_anonymous: isAnonymous,
          payment_reference: `ORG-PENDING-${Date.now()}`,
          payment_method: 'mpesa',
          payment_status: 'pending',
        })
        .select('id')
        .single();

      if (orgDonationError) {
        console.error('Error creating organization donation record:', orgDonationError);
        return new Response(
          JSON.stringify({ error: 'Failed to create donation record. Please try again.' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      organizationDonationId = orgDonation.id;
      body.callback_metadata = {
        ...(body.callback_metadata ?? {}),
        organization_donation_id: organizationDonationId,
      };

      console.log('Organization donation record created:', { organizationDonationId });
    }

    const consumerKey = Deno.env.get('MPESA_CONSUMER_KEY') ?? '';
    const consumerSecret = Deno.env.get('MPESA_CONSUMER_SECRET') ?? '';
    const passkey = Deno.env.get('MPESA_PASSKEY') ?? '';
    // For Buy Goods (Till):
    // - BusinessShortCode must be the Store/Head Office number (often 6-7 digits)
    // - PartyB is the actual Till number
    const shortcode = Deno.env.get('MPESA_SHORTCODE') ?? '';
    const tillNumber = Deno.env.get('MPESA_TILL_NUMBER') ?? '';

    // Validate credentials
    if (!consumerKey || !consumerSecret || !passkey || !shortcode || !tillNumber) {
      console.error('Missing M-Pesa credentials:', {
        hasConsumerKey: !!consumerKey,
        hasConsumerSecret: !!consumerSecret,
        hasPasskey: !!passkey,
        hasShortcode: !!shortcode,
        hasTillNumber: !!tillNumber,
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

    const callbackUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/payment-stk-callback`;
    console.log('Using Callback URL:', callbackUrl);

    // --- Step 2: Prepare STK Push Payload (Paybill) ---
    // For Paybill: BusinessShortCode = Paybill number, PartyB = Paybill number
    // TransactionType = CustomerPayBillOnline
    const payload = {
      BusinessShortCode: shortcode,
      Password: btoa(shortcode + passkey + timestamp),
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: body.amount,
      PartyA: normalizedPhone,
      PartyB: shortcode,
      PhoneNumber: normalizedPhone,
      CallBackURL: callbackUrl,
      AccountReference: (body.account_reference || 'Donation').substring(0, 12),
      TransactionDesc: (body.transaction_desc || 'Payment').substring(0, 13),
    };

    console.log('STK Push payload:', { ...payload, Password: '****' });

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

    // --- Step 3.1: Persist CheckoutRequestID immediately (prevents race with callback) ---
    // Supports:
    // - mchango donations: callback_metadata.donation_id
    // - organization donations: callback_metadata.organization_donation_id
    if (result?.CheckoutRequestID) {
      const checkoutRequestId = result.CheckoutRequestID as string;

      const mchangoDonationId = body.callback_metadata?.donation_id as string | undefined;
      if (mchangoDonationId) {
        const { error: donationUpdateError } = await supabaseClient
          .from('mchango_donations')
          .update({ payment_reference: checkoutRequestId })
          .eq('id', mchangoDonationId);

        if (donationUpdateError) {
          console.error('Error updating mchango donation with CheckoutRequestID:', donationUpdateError);
        } else {
          console.log('Mchango donation updated with CheckoutRequestID:', { donationId: mchangoDonationId, checkoutRequestId });
        }
      }

      const orgDonationId = body.callback_metadata?.organization_donation_id as string | undefined;
      if (orgDonationId) {
        const { error: orgDonationUpdateError } = await supabaseClient
          .from('organization_donations')
          .update({ payment_reference: checkoutRequestId })
          .eq('id', orgDonationId);

        if (orgDonationUpdateError) {
          console.error('Error updating organization donation with CheckoutRequestID:', orgDonationUpdateError);
        } else {
          console.log('Organization donation updated with CheckoutRequestID:', { orgDonationId, checkoutRequestId });
        }
      }
    }

    // --- Step 4: Create pending contribution if this is a chama contribution ---
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

    // --- Step 5: Create pending welfare contribution for callback matching ---
    let welfareContributionId = null;
    if (body.callback_metadata?.type === 'welfare_contribution' && result.CheckoutRequestID) {
      const welfareId = body.callback_metadata.welfare_id as string | undefined;
      const recipientCode = body.callback_metadata.recipient_member_code as string | undefined;
      if (welfareId) {
        const memberQuery = supabaseClient
          .from('welfare_members')
          .select('id, user_id, registration_status, registration_fee_due, registration_fee_paid')
          .eq('welfare_id', welfareId)
          .eq('status', 'active')
          .limit(1);

        const { data: memberRows } = recipientCode
          ? await memberQuery.eq('member_code', recipientCode)
          : await memberQuery.eq('id', body.callback_metadata.member_id as string);
        const welfareMember = memberRows?.[0];

        if (welfareMember) {
          const registrationRemaining = Math.max(0, Number(welfareMember.registration_fee_due || 0) - Number(welfareMember.registration_fee_paid || 0));
          const category = registrationRemaining > 0 && body.amount <= registrationRemaining ? 'registration_fee' : 'contribution';
          const { data: welfareContribution, error: welfareContributionError } = await supabaseClient
            .from('welfare_contributions')
            .insert({
              welfare_id: welfareId,
              member_id: welfareMember.id,
              user_id: welfareMember.user_id,
              gross_amount: body.amount,
              commission_amount: 0,
              net_amount: body.amount,
              payment_reference: result.CheckoutRequestID,
              payment_method: 'mpesa',
              payment_status: 'pending',
              cycle_month: new Date().toISOString().substring(0, 7),
              category,
            })
            .select('id')
            .single();

          if (welfareContributionError) {
            console.error('Error creating pending welfare contribution:', welfareContributionError);
          } else {
            welfareContributionId = welfareContribution.id;
          }
        } else {
          console.error('No welfare member found for STK metadata', { welfareId, recipientCode });
        }
      }
    }

    // --- Step 6: Return result with contribution IDs ---
    return new Response(JSON.stringify({ ...result, contribution_id: contributionId, welfare_contribution_id: welfareContributionId }), {
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
