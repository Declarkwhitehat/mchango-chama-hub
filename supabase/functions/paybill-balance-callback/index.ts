import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Safaricom returns balances as a pipe-delimited string in ResultParameters:
// "Working Account|KES|123.00|123.00|0.00|0.00&Utility Account|KES|456.00|..."
function parseBalances(raw: string | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw) return out;
  for (const entry of raw.split('&')) {
    const parts = entry.split('|');
    if (parts.length >= 3) {
      const name = parts[0].trim();
      const amount = parseFloat(parts[2]);
      if (!isNaN(amount)) out[name] = amount;
    }
  }
  return out;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body = await req.json();
    console.log('Account balance callback received:', JSON.stringify(body));

    const result = body?.Result ?? {};
    const conversationId: string | undefined = result.ConversationID;
    const originatorConversationId: string | undefined = result.OriginatorConversationID;
    const resultCode = typeof result.ResultCode === 'number' ? result.ResultCode : parseInt(result.ResultCode);
    const resultDesc = result.ResultDesc;

    let balanceString: string | undefined;
    const items = result?.ResultParameters?.ResultParameter;
    if (Array.isArray(items)) {
      const match = items.find((i: any) => i.Key === 'AccountBalance');
      if (match) balanceString = match.Value;
    }
    const balances = parseBalances(balanceString);

    const updatePayload: Record<string, unknown> = {
      result_code: resultCode,
      result_desc: resultDesc,
      raw_result: body,
      completed_at: new Date().toISOString(),
      working_account: balances['Working Account'] ?? null,
      utility_account: balances['Utility Account'] ?? null,
      charges_paid_account: balances['Charges Paid Account'] ?? null,
      merchant_account: balances['Merchant Account'] ?? null,
      organization_settlement_account: balances['Organization Settlement Account'] ?? null,
    };

    // Try to update existing pending snapshot for this conversation
    if (conversationId) {
      const { data: existing } = await supabaseAdmin
        .from('paybill_balance_snapshots')
        .select('id')
        .eq('conversation_id', conversationId)
        .maybeSingle();
      if (existing) {
        await supabaseAdmin
          .from('paybill_balance_snapshots')
          .update(updatePayload)
          .eq('id', existing.id);
      } else {
        await supabaseAdmin.from('paybill_balance_snapshots').insert({
          shortcode: Deno.env.get('MPESA_SHORTCODE') ?? '',
          conversation_id: conversationId,
          originator_conversation_id: originatorConversationId,
          ...updatePayload,
        });
      }
    }

    return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: 'Accepted' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('paybill-balance-callback error:', e);
    // Always 200 to Safaricom
    return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: 'Accepted' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
