import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { checkRateLimit, getClientIP } from '../_shared/rateLimiter.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ONFON_API_KEY = Deno.env.get('ONFON_API_KEY');
const ONFON_CLIENT_ID = Deno.env.get('ONFON_CLIENT_ID');
const ONFON_SENDER_ID = Deno.env.get('ONFON_SENDER_ID');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface SendOTPRequest {
  phone?: string;
  email?: string;
  purpose?: string;
}

interface OnfonMessageResult {
  MessageErrorCode?: string | number | null;
  MessageErrorDescription?: string | null;
  MessageId?: string | null;
}

interface OnfonSMSResponse {
  ErrorCode?: string | number | null;
  ErrorDescription?: string | null;
  Data?: OnfonMessageResult[];
}

interface SMSResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

const isOnfonSuccessCode = (code: unknown): boolean => code === 0 || code === '0' || code === '000';

const getProviderMessage = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;

  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === 'null') return undefined;

  return trimmed;
};

const sendSMS = async (phone: string, message: string): Promise<SMSResult> => {
  try {
    const normalizedPhone = phone.startsWith('+') ? phone.substring(1) : phone;

    const response = await fetch('https://api.onfonmedia.co.ke/v1/sms/SendBulkSMS', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        SenderId: ONFON_SENDER_ID,
        IsUnicode: false,
        IsFlash: false,
        MessageParameters: [
          {
            Number: normalizedPhone,
            Text: message,
          },
        ],
        ApiKey: ONFON_API_KEY,
        ClientId: ONFON_CLIENT_ID,
      }),
    });

    const result: OnfonSMSResponse = await response.json();
    console.log('Onfon Media SMS response:', JSON.stringify(result));

    const firstMessage = Array.isArray(result.Data) ? result.Data[0] : undefined;
    const messageAccepted =
      firstMessage?.MessageErrorCode === undefined ||
      firstMessage?.MessageErrorCode === null ||
      firstMessage?.MessageErrorCode === '' ||
      isOnfonSuccessCode(firstMessage.MessageErrorCode);

    if (response.ok && isOnfonSuccessCode(result.ErrorCode) && messageAccepted) {
      return {
        success: true,
        messageId: firstMessage?.MessageId || `onfon-${Date.now()}`,
      };
    }

    return {
      success: false,
      error:
        getProviderMessage(firstMessage?.MessageErrorDescription) ||
        getProviderMessage(result.ErrorDescription) ||
        `Onfon request failed with status ${response.status}`,
    };
  } catch (error) {
    console.error('SMS sending error:', error);
    return { success: false, error: (error as Error).message };
  }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { phone: rawPhone, email, purpose }: SendOTPRequest = await req.json();

    let phone = rawPhone;

    if (email && !phone) {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('phone')
        .eq('email', email)
        .single();

      if (profileError || !profile?.phone) {
        return new Response(
          JSON.stringify({ error: 'No account found with this email address' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
        );
      }

      phone = profile.phone;
      if (phone && !phone.startsWith('+')) {
        if (phone.startsWith('0')) phone = '+254' + phone.substring(1);
        else if (phone.startsWith('7') || phone.startsWith('1')) phone = '+254' + phone;
        else phone = '+' + phone;
      }
    }

    if (!phone || !/^\+\d{10,15}$/.test(phone)) {
      return new Response(
        JSON.stringify({ error: 'Invalid phone number format. Use international format (e.g., +254712345678)' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const phoneRateLimit = await checkRateLimit(supabase, phone, 'phone', 'forgot_password');
    if (!phoneRateLimit.allowed) {
      return new Response(
        JSON.stringify({
          error: phoneRateLimit.error || 'Too many OTP requests. Please try again later.',
          remainingAttempts: phoneRateLimit.remainingAttempts,
          resetTime: phoneRateLimit.resetTime
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 429 }
      );
    }

    const clientIP = getClientIP(req);
    const ipRateLimit = await checkRateLimit(supabase, clientIP, 'ip', 'forgot_password');
    if (!ipRateLimit.allowed) {
      return new Response(
        JSON.stringify({
          error: ipRateLimit.error || 'Too many requests from your location. Please try again later.',
          remainingAttempts: ipRateLimit.remainingAttempts,
          resetTime: ipRateLimit.resetTime
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 429 }
      );
    }

    if (purpose === 'password_reset') {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('phone', phone)
        .single();

      if (profileError || !profile) {
        return new Response(
          JSON.stringify({ error: 'No account found with this phone number' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
        );
      }
    }

    await supabase.rpc('cleanup_expired_otps');

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    const { error: insertError } = await supabase
      .from('otp_verifications')
      .insert({
        phone,
        otp,
        expires_at: expiresAt,
      });

    if (insertError) {
      console.error('Database error:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to generate OTP' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    const message = `Your verification code is: ${otp}. Valid for 5 minutes. Do not share this code with anyone.`;
    const smsResult = await sendSMS(phone, message);

    if (!smsResult.success) {
      console.error('Onfon Media rejected OTP SMS:', smsResult.error);
      return new Response(
        JSON.stringify({ error: 'Failed to send SMS. Please try again.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    console.log(`OTP sent successfully to ${phone}`);

    const maskedPhone = phone.substring(0, 4) + '****' + phone.substring(phone.length - 4);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'OTP sent successfully',
        expiresIn: 300,
        maskedPhone,
        phone,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    console.error('Error in send-otp:', {
      message: (error as Error).message,
    });

    return new Response(
      JSON.stringify({ error: 'An error occurred processing your request' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});