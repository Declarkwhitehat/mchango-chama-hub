import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { corsHeaders } from "../_shared/cors.ts";
import { COMMISSION_RATES } from "../_shared/commissionRates.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '').trim();
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAdmin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    // GET - List contributions
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const welfareId = url.searchParams.get('welfare_id');
      
      if (!welfareId) {
        return new Response(JSON.stringify({ error: 'welfare_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const { data, error } = await supabaseAdmin
        .from('welfare_contributions')
        .select('*, welfare_members!member_id(member_code, role, profiles:user_id(full_name, phone))')
        .eq('welfare_id', welfareId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return new Response(JSON.stringify({ data }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // POST - Record contribution
    if (req.method === 'POST') {
      if (!token) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const { data: userData } = await supabaseAdmin.auth.getUser(token);
      if (!userData?.user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const body = await req.json();
      const { welfare_id, amount, payment_method, payment_reference } = body;

      if (!welfare_id || !amount || amount <= 0) {
        return new Response(JSON.stringify({ error: 'welfare_id and positive amount required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Select ALL balance fields needed for the update
      const { data: welfare } = await supabaseAdmin
        .from('welfares')
        .select('id, is_frozen, status, commission_rate, total_gross_collected, total_commission_paid, available_balance, current_amount')
        .eq('id', welfare_id)
        .single();

      if (!welfare || welfare.status !== 'active') {
        return new Response(JSON.stringify({ error: 'Welfare not found or inactive' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (welfare.is_frozen) {
        return new Response(JSON.stringify({ error: 'Welfare is frozen. Contact admin.' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Get member record with total_contributed
      const { data: member } = await supabaseAdmin
        .from('welfare_members')
        .select('id, total_contributed')
        .eq('welfare_id', welfare_id)
        .eq('user_id', userData.user.id)
        .eq('status', 'active')
        .single();

      if (!member) {
        return new Response(JSON.stringify({ error: 'Not a member of this welfare' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const commissionRate = Number(welfare.commission_rate) || COMMISSION_RATES.WELFARE;
      const grossAmount = Number(amount);
      const commissionAmount = Math.round(grossAmount * commissionRate * 100) / 100;
      const netAmount = Math.round((grossAmount - commissionAmount) * 100) / 100;

      const cycleMonth = new Date().toISOString().substring(0, 7);
      const paymentRef = payment_reference || `WC-${crypto.randomUUID().substring(0, 8)}`;

      // Idempotency guard: check for duplicate payment_reference
      const { data: existing } = await supabaseAdmin
        .from('welfare_contributions')
        .select('*')
        .eq('welfare_id', welfare_id)
        .eq('payment_reference', paymentRef)
        .maybeSingle();

      if (existing) {
        console.log('Duplicate contribution detected, returning existing:', existing.id);
        return new Response(JSON.stringify({ data: existing }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const { data: contribution, error } = await supabaseAdmin
        .from('welfare_contributions')
        .insert({
          welfare_id,
          member_id: member.id,
          user_id: userData.user.id,
          gross_amount: grossAmount,
          commission_amount: commissionAmount,
          net_amount: netAmount,
          payment_reference: paymentRef,
          payment_method: payment_method || 'mpesa',
          payment_status: 'completed',
          cycle_month: cycleMonth,
          completed_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;

      // Update welfare balances using actual DB values
      await supabaseAdmin
        .from('welfares')
        .update({
          total_gross_collected: (welfare.total_gross_collected || 0) + grossAmount,
          total_commission_paid: (welfare.total_commission_paid || 0) + commissionAmount,
          available_balance: (welfare.available_balance || 0) + netAmount,
          current_amount: (welfare.current_amount || 0) + netAmount,
        })
        .eq('id', welfare_id);

      // Update member total_contributed
      await supabaseAdmin
        .from('welfare_members')
        .update({ total_contributed: (member.total_contributed || 0) + grossAmount })
        .eq('id', member.id);

      // Record company earning
      await supabaseAdmin.rpc('record_company_earning', {
        p_source: 'welfare_contribution',
        p_amount: commissionAmount,
        p_group_id: welfare_id,
        p_reference_id: contribution.id,
        p_description: `Welfare contribution commission (${(commissionRate * 100).toFixed(0)}%)`
      });

      return new Response(JSON.stringify({ data: contribution }), { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    console.error('welfare-contributions error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
