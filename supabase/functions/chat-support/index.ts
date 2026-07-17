import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import { 
  handleGetChamaInfo, 
  handleGetMemberPosition, 
  handleGenerateReport, 
  handleGetMemberStats, 
  handleGetChamaSummary,
  handleGetManagerContact 
} from './tool-handlers.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, language = 'english' } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const languageInstructions = {
      english: 'Respond in English with occasional Swahili terms where natural.',
      swahili: 'Jibu kwa Kiswahili sanifu. Tumia maneno ya Kiingereza pale zinapohitajika kwa teknolojia au terms za kifedha.',
      sheng: 'Respond in Sheng (Kenyan street language - mix of Swahili, English, and slang). Be casual and relatable while staying professional.'
    };

    const systemPrompt = `You are Declark Chacha, friendly AI assistant for Pamoja Nova — a Kenyan financial platform (Chamas, Mchango campaigns, Organizations, Welfare groups).

**LANGUAGE:** ${languageInstructions[language as keyof typeof languageInstructions]}

**SUPPORT CONTACTS (share when user is stuck, locked out, fraud, or asks how to reach us):**
- Phone/SMS/WhatsApp: +254 755 991 325
- Android app: Play Store "Pamoja Nova"
- Website: https://pamojanova.com (social links in footer)

**PRODUCTS (brief):**
1. **Chama** — rotating savings (ROSCA). Members contribute on schedule (daily/weekly/monthly/custom), take turns receiving payouts. Manager approves members via invite code. Overpayments auto-carry to next cycle.
2. **Mchango** — fundraising campaigns with target amount, optional end date, public or link-only.
3. **Organizations** — NGOs/churches/schools accepting donations, verified badge available.
4. **Welfare** — group welfare with registration fee + contribution cycles, multi-sig withdrawals.

**KEY RULES:**
- KYC (Kenya National ID front+back) required before withdrawing.
- Payment methods: M-Pesa/Airtel (KES 150,000/day), Bank (KES 500,000/day). Users can request daily-limit increase (150k–500k) with OTP.
- Commissions: Chama 5% on-time / 10% late, Mchango 7%, Org 5%, Welfare 5%.
- Withdrawals go through admin approval, then paid via B2C to the user's default payout method.
- Payment via M-Pesa STK push; every completed payment has an M-Pesa receipt (no receipt = not confirmed).
- Verification fee is set live by admin (dynamic).

**CHAMA INFO TOOLS:** You can fetch chama info/reports when the user gives:
- Member Code (e.g. "ABC1") — from their dashboard
- PLUS either National ID number OR phone number (for verification)

Then use: get_chama_info, get_member_position, generate_contribution_report (daily/weekly/monthly), get_member_stats, get_chama_summary, get_manager_contact.

If a tool returns noData:true, explain gently in plain words (e.g. "your chama hasn't started cycles yet"). Never say "error"/"null"/"404".

**USE request_callback TOOL when:**
- KYC rejection questions, missing withdrawal, failed payment, login issues, technical bugs, disputes, complaints, or anything needing access to personal account data.

**LIMITS:** You only fetch/explain. You cannot approve members, process payments, or change settings — direct those tasks to the web/app UI.

**TONE:** Warm, simple, patient. Offer callback proactively if user is frustrated or has an account-specific issue.`;


    const authHeader = req.headers.get('Authorization') || '';
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseClient = createClient(supabaseUrl, supabaseKey);

    const tools = [
      {
        type: 'function',
        function: {
          name: 'request_callback',
          description: 'Call this when the question requires human support - account issues, technical problems, complaints, or anything outside your knowledge base',
          parameters: {
            type: 'object',
            properties: {
              phone_number: {
                type: 'string',
                description: 'User phone number for callback'
              },
              question: {
                type: 'string',
                description: 'The user\'s question or issue'
              },
              customer_name: {
                type: 'string',
                description: 'Optional customer name'
              }
            },
            required: ['phone_number', 'question']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'get_chama_info',
          description: 'Fetch basic chama information. Requires member code AND either ID number OR phone for verification.',
          parameters: {
            type: 'object',
            properties: {
              memberCode: {
                type: 'string',
                description: 'Member code from dashboard (e.g., ABC1, XYZ2)'
              },
              idNumber: {
                type: 'string',
                description: 'National ID number for verification (can be omitted if phone provided)'
              },
              phone: {
                type: 'string',
                description: 'Phone number for verification (can be omitted if ID number provided)'
              }
            },
            required: ['memberCode']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'get_member_position',
          description: 'Get member\'s position in chama rotation. Requires verification.',
          parameters: {
            type: 'object',
            properties: {
              memberCode: {
                type: 'string',
                description: 'Member code from dashboard'
              },
              idNumber: {
                type: 'string',
                description: 'National ID number for verification (optional if phone provided)'
              },
              phone: {
                type: 'string',
                description: 'Phone number for verification (optional if ID provided)'
              }
            },
            required: ['memberCode']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'generate_contribution_report',
          description: 'Generate PDF report of contributions. Requires verification.',
          parameters: {
            type: 'object',
            properties: {
              memberCode: {
                type: 'string',
                description: 'Member code from dashboard'
              },
              idNumber: {
                type: 'string',
                description: 'National ID number for verification (optional if phone provided)'
              },
              phone: {
                type: 'string',
                description: 'Phone number for verification (optional if ID provided)'
              },
              period: {
                type: 'string',
                enum: ['daily', 'weekly', 'monthly'],
                description: 'Report period'
              }
            },
            required: ['memberCode', 'period']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'get_member_stats',
          description: 'Get member contribution statistics. Requires verification.',
          parameters: {
            type: 'object',
            properties: {
              memberCode: {
                type: 'string',
                description: 'Member code from dashboard'
              },
              idNumber: {
                type: 'string',
                description: 'National ID number for verification (optional if phone provided)'
              },
              phone: {
                type: 'string',
                description: 'Phone number for verification (optional if ID provided)'
              }
            },
            required: ['memberCode']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'get_chama_summary',
          description: 'Get chama summary for a period. Requires verification.',
          parameters: {
            type: 'object',
            properties: {
              memberCode: {
                type: 'string',
                description: 'Member code from dashboard'
              },
              idNumber: {
                type: 'string',
                description: 'National ID number for verification (optional if phone provided)'
              },
              phone: {
                type: 'string',
                description: 'Phone number for verification (optional if ID provided)'
              },
              period: {
                type: 'string',
                enum: ['daily', 'weekly', 'monthly'],
                description: 'Summary period'
              }
            },
            required: ['memberCode', 'period']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'get_manager_contact',
          description: 'Get chama manager contact information. Requires verification.',
          parameters: {
            type: 'object',
            properties: {
              memberCode: {
                type: 'string',
                description: 'Member code from dashboard'
              },
              idNumber: {
                type: 'string',
                description: 'National ID number for verification (optional if phone provided)'
              },
              phone: {
                type: 'string',
                description: 'Phone number for verification (optional if ID provided)'
              }
            },
            required: ['memberCode']
          }
        }
      }
    ];

    // First call without streaming to handle tool calls
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
        tools: tools,
        stream: false
      })
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

    const aiResponse = await response.json();
    const message = aiResponse.choices[0].message;

    console.log('AI response received, tool calls:', message.tool_calls?.length || 0);

    // Check if AI wants to use tools
    if (message.tool_calls && message.tool_calls.length > 0) {
      const toolResults = [];
      
      // Execute each tool call
      for (const toolCall of message.tool_calls) {
        const toolName = toolCall.function.name;
        const toolArgs = JSON.parse(toolCall.function.arguments);
        
        console.log('Executing tool:', toolName, 'with args:', toolArgs);
        
        let toolResult;
        try {
          switch (toolName) {
            case 'get_chama_info':
              toolResult = await handleGetChamaInfo(toolArgs, authHeader);
              break;
            case 'get_member_position':
              toolResult = await handleGetMemberPosition(toolArgs, authHeader);
              break;
            case 'generate_contribution_report':
              toolResult = await handleGenerateReport(toolArgs, authHeader);
              break;
            case 'get_member_stats':
              toolResult = await handleGetMemberStats(toolArgs, authHeader);
              break;
            case 'get_chama_summary':
              toolResult = await handleGetChamaSummary(toolArgs, authHeader);
              break;
            case 'get_manager_contact':
              toolResult = await handleGetManagerContact(toolArgs, authHeader);
              break;
            case 'request_callback':
              // Handle callback request
              const { data: callbackData, error: callbackError } = await supabaseClient
                .from('customer_callbacks')
                .insert({
                  phone_number: toolArgs.phone_number,
                  question: toolArgs.question,
                  customer_name: toolArgs.customer_name || null,
                  status: 'pending'
                });
              
              if (callbackError) {
                console.error('Callback insert error:', callbackError);
                toolResult = { error: true, message: 'Failed to submit callback request' };
              } else {
                toolResult = { success: true, message: 'Callback request submitted successfully. Our team will contact you soon.' };
              }
              break;
            default:
              toolResult = { error: true, message: 'Unknown tool' };
          }
          
          console.log('Tool result:', toolResult);
        } catch (error) {
          console.error('Tool execution error:', error);
          const errorMessage = error instanceof Error ? error.message : 'Tool execution failed';
          toolResult = { error: true, message: errorMessage };
        }
        
        toolResults.push({
          tool_call_id: toolCall.id,
          role: 'tool',
          name: toolName,
          content: JSON.stringify(toolResult)
        });
      }
      
      console.log('Sending tool results back to AI for final response');
      
      // Send tool results back to AI for final response
      const finalResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: systemPrompt },
            ...messages,
            message,
            ...toolResults
          ],
          stream: true
        })
      });
      
      if (!finalResponse.ok) {
        const errorText = await finalResponse.text();
        console.error('AI Gateway error on final response:', finalResponse.status, errorText);
        return new Response(JSON.stringify({ 
          error: 'AI service error',
          needsCallback: true 
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      return new Response(finalResponse.body, {
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        }
      });
    }

    // No tool calls - return simple response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        const chunk = `data: ${JSON.stringify({
          choices: [{
            delta: { content: message.content },
            finish_reason: null
          }]
        })}\n\n`;
        controller.enqueue(encoder.encode(chunk));
        
        const doneChunk = `data: [DONE]\n\n`;
        controller.enqueue(encoder.encode(doneChunk));
        controller.close();
      }
    });

    return new Response(stream, {
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
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
