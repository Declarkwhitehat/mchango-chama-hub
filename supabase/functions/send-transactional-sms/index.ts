import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const AFRICASTALKING_API_KEY = Deno.env.get('AFRICASTALKING_API_KEY');
const AFRICASTALKING_USERNAME = Deno.env.get('AFRICASTALKING_USERNAME');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface TransactionalSMSRequest {
  phone: string;
  message: string;
  eventType?: string; // e.g., 'registration', 'chama_created', 'payment_success'
}

const sendSMS = async (phone: string, message: string): Promise<{ success: boolean; messageId?: string; error?: string }> => {
  try {
    const response = await fetch('https://api.africastalking.com/version1/messaging', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'apiKey': AFRICASTALKING_API_KEY!,
        'Accept': 'application/json',
      },
      body: new URLSearchParams({
        'username': AFRICASTALKING_USERNAME!,
        'to': phone,
        'message': message,
      }),
    });

    const result = await response.json();
    console.log('Africa\'s Talking SMS response:', result);
    
    const recipient = result.SMSMessageData?.Recipients?.[0];
    if (recipient?.status === 'Success') {
      return { success: true, messageId: recipient.messageId };
    } else {
      return { success: false, error: recipient?.status || 'Unknown error' };
    }
  } catch (error: any) {
    console.error('SMS sending error:', error);
    return { success: false, error: error.message };
  }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { phone, message, eventType }: TransactionalSMSRequest = await req.json();

    // Validate inputs
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

    // Send SMS
    const result = await sendSMS(phone, message);

    if (!result.success) {
      return new Response(
        JSON.stringify({ 
          error: 'Failed to send SMS', 
          details: result.error 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    console.log(`Transactional SMS sent successfully to ${phone}${eventType ? ` (Event: ${eventType})` : ''}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'SMS sent successfully',
        messageId: result.messageId
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error: any) {
    console.error('Error in send-transactional-sms:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
