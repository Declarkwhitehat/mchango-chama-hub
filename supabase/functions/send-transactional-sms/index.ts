import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ONFON_API_KEY = Deno.env.get('ONFON_API_KEY');
const ONFON_CLIENT_ID = Deno.env.get('ONFON_CLIENT_ID');
const ONFON_SENDER_ID = Deno.env.get('ONFON_SENDER_ID');
console.log('DEBUG: ONFON_SENDER_ID value is:', JSON.stringify(ONFON_SENDER_ID));
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface TransactionalSMSRequest {
  phone: string;
  message: string;
  eventType?: string;
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

const isOnfonSuccessCode = (code: unknown): boolean => code === 0 || code === '0' || code === '000';

const getProviderMessage = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;

  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === 'null') return undefined;

  return trimmed;
};

const sendSMS = async (phone: string, message: string): Promise<{ success: boolean; messageId?: string; error?: string }> => {
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
    console.error('SMS sending error:', (error as Error).message);
    return { success: false, error: (error as Error).message };
  }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { phone, message, eventType }: TransactionalSMSRequest = await req.json();

    if (!phone || !/^\+\d{10,15}$/.test(phone)) {
      return new Response(
        JSON.stringify({ error: 'Invalid phone number format. Use international format (e.g., +254712345678)' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    if (!message || message.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Message is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    if (message.length > 160) {
      console.warn(`Message length exceeds 160 characters (${message.length}). This may be split into multiple SMS.`);
    }

    const result = await sendSMS(phone, message);

    if (!result.success) {
      console.error('Onfon Media rejected transactional SMS:', result.error);
      return new Response(
        JSON.stringify({ error: 'Failed to send SMS', details: result.error }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    console.log(`Transactional SMS sent successfully to ${phone}${eventType ? ` (Event: ${eventType})` : ''}`);

    return new Response(
      JSON.stringify({ success: true, message: 'SMS sent successfully', messageId: result.messageId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    console.error('Error in send-transactional-sms:', {
      message: (error as Error).message,
    });

    return new Response(
      JSON.stringify({ error: 'An error occurred processing your request' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});