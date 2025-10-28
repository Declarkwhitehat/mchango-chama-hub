import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate Authorization header upfront
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ 
        error: 'Missing authorization header',
        code: 'AUTH_REQUIRED' 
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    // Verify authentication for all requests
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ 
        error: 'Invalid or expired token',
        code: 'AUTH_INVALID',
        details: authError?.message 
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('contributions-crud request', { 
      method: req.method,
      userId: user.id,
      timestamp: new Date().toISOString()
    });

    const url = new URL(req.url);
    const chamaId = url.searchParams.get('chama_id');

    // GET /contributions-crud?chama_id=xxx - List contributions for a chama
    if (req.method === 'GET') {
      if (!chamaId) {
        return new Response(JSON.stringify({ error: 'chama_id is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data, error } = await supabaseClient
        .from('contributions')
        .select(`
          *,
          chama_members!contributions_member_id_fkey (
            member_code,
            profiles (
              full_name,
              email
            )
          ),
          paid_by:chama_members!contributions_paid_by_member_id_fkey (
            member_code,
            profiles (
              full_name,
              email
            )
          )
        `)
        .eq('chama_id', chamaId)
        .order('contribution_date', { ascending: false });

      if (error) throw error;

      return new Response(JSON.stringify({ data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST /contributions-crud - Create new contribution
    if (req.method === 'POST') {
      const body = await req.json();

      console.log('Creating contribution:', body);

      // Validate member exists
      const { data: member, error: memberError } = await supabaseClient
        .from('chama_members')
        .select('*, chama(contribution_amount)')
        .eq('id', body.member_id)
        .maybeSingle();

      // Validate payer (if different from recipient)
      if (body.paid_by_member_id && body.paid_by_member_id !== body.member_id) {
        const { data: payer, error: payerError } = await supabaseClient
          .from('chama_members')
          .select('id, chama_id')
          .eq('id', body.paid_by_member_id)
          .maybeSingle();

        if (payerError || !payer || payer.chama_id !== member.chama_id) {
          return new Response(JSON.stringify({ error: 'Payer must be a member of the same chama' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      if (memberError || !member) {
        return new Response(JSON.stringify({ error: 'Member not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const expectedAmount = member.chama.contribution_amount;
      const paidAmount = body.amount;

      // Calculate overpayment or underpayment
      let creditDelta = 0;
      let deficitDelta = 0;

      if (paidAmount > expectedAmount) {
        // Overpayment - add to credit
        creditDelta = paidAmount - expectedAmount;
        console.log('Overpayment detected:', { paidAmount, expectedAmount, creditDelta });
      } else if (paidAmount < expectedAmount) {
        // Underpayment - add to deficit
        deficitDelta = expectedAmount - paidAmount;
        console.log('Underpayment detected:', { paidAmount, expectedAmount, deficitDelta });
      }

      // Create contribution record
      const { data, error } = await supabaseClient
        .from('contributions')
        .insert(body)
        .select()
        .maybeSingle();

      if (error) throw error;

      // Update member balance
      if (creditDelta > 0 || deficitDelta > 0) {
        const { error: updateError } = await supabaseClient
          .from('chama_members')
          .update({
            balance_credit: member.balance_credit + creditDelta,
            balance_deficit: member.balance_deficit + deficitDelta,
            last_payment_date: new Date().toISOString(),
          })
          .eq('id', body.member_id);

        if (updateError) {
          console.error('Error updating member balance:', updateError);
        } else {
          console.log('Member balance updated:', { creditDelta, deficitDelta });
        }
      }

      return new Response(JSON.stringify({ 
        data,
        balance_update: {
          credit_added: creditDelta,
          deficit_added: deficitDelta,
        }
      }), {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error in contributions-crud:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
