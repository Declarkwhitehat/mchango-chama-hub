import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const systemPrompt = `You are Declark Chacha, a friendly and helpful AI assistant for a Kenyan financial platform.

You help users understand three main services:

1. **Chama Groups** - Community savings circles where members pool money together. Members make regular contributions (daily, weekly, or monthly), and payouts are distributed in rotation. Perfect for building savings as a group.

2. **Mchango Campaigns** - Crowdfunding campaigns for various causes like medical bills, school fees, funerals, business startup costs, and community projects. Anyone can create a campaign and share it to raise funds.

3. **Savings Groups** - Structured savings groups with fixed periods (6-24 months in 3-month increments). Members save monthly with a KSh 2,000 minimum threshold. After 3 consecutive months of meeting the threshold, members become eligible for loans. Loans have 6.5% interest and 2% insurance fee.

**Key Features Across Platform:**
- KYC verification required for all users
- M-Pesa and Airtel Money integration for payments
- WhatsApp groups for community communication
- Manager/admin controls for group management
- Secure payment processing with automatic commission deduction

**Your Style:**
- Be warm, friendly, and professional
- Use simple language - mix of English and Swahili terms where natural
- Give concise, clear answers
- If you don't know something specific or the user has account/technical issues, use the request_callback tool

**When to Request Callback:**
- Account-specific issues (login problems, payment issues, verification status)
- Technical problems or bugs
- Complaints or disputes
- Questions about specific transactions
- Anything requiring human judgment or access to user data`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages
        ],
        stream: true,
        tools: [
          {
            type: 'function',
            function: {
              name: 'request_callback',
              description: 'Call this when the question requires human support - account issues, technical problems, complaints, or anything outside your knowledge base',
              parameters: {
                type: 'object',
                properties: {
                  reason: { 
                    type: 'string', 
                    description: 'Why human support is needed' 
                  }
                },
                required: ['reason']
              }
            }
          }
        ]
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ 
          error: 'Too many requests. Please try again in a moment.',
          needsCallback: true 
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ 
          error: 'Service temporarily unavailable. Please try again later.',
          needsCallback: true 
        }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      return new Response(JSON.stringify({ 
        error: 'AI service error',
        needsCallback: true 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(response.body, {
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      },
    });

  } catch (error) {
    console.error('Chat support error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      needsCallback: true 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
