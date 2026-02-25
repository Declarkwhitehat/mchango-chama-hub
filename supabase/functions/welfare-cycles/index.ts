import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '').trim();

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: authHeader ? { Authorization: `Bearer ${token}` } : {} }, auth: { persistSession: false }
    });
    const supabaseAdmin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    // GET - List cycles for a welfare
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const welfareId = url.searchParams.get('welfare_id');

      if (!welfareId) {
        return new Response(JSON.stringify({ error: 'welfare_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const { data, error } = await supabaseClient
        .from('welfare_contribution_cycles')
        .select('*')
        .eq('welfare_id', welfareId)
        .order('start_date', { ascending: false });

      if (error) throw error;
      return new Response(JSON.stringify({ data }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // POST - Secretary creates a new cycle
    if (req.method === 'POST') {
      if (!token) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const { data: userData } = await supabaseAdmin.auth.getUser(token);
      if (!userData?.user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const body = await req.json();
      const { welfare_id, amount, start_date, end_date } = body;

      if (!welfare_id || !amount || !start_date || !end_date) {
        return new Response(JSON.stringify({ error: 'welfare_id, amount, start_date, end_date required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (amount <= 0) {
        return new Response(JSON.stringify({ error: 'Amount must be positive' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Verify user is secretary
      const { data: member } = await supabaseAdmin
        .from('welfare_members')
        .select('role')
        .eq('welfare_id', welfare_id)
        .eq('user_id', userData.user.id)
        .eq('status', 'active')
        .single();

      if (!member || member.role !== 'secretary') {
        return new Response(JSON.stringify({ error: 'Only the Secretary can set contribution cycles' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Close any active cycles
      await supabaseAdmin
        .from('welfare_contribution_cycles')
        .update({ status: 'completed' })
        .eq('welfare_id', welfare_id)
        .eq('status', 'active');

      // Create new cycle
      const { data, error } = await supabaseClient
        .from('welfare_contribution_cycles')
        .insert({
          welfare_id,
          set_by: userData.user.id,
          amount,
          start_date,
          end_date,
          status: 'active',
        })
        .select()
        .single();

      if (error) throw error;

      // Update welfare contribution_amount
      await supabaseAdmin
        .from('welfares')
        .update({ contribution_amount: amount })
        .eq('id', welfare_id);

      return new Response(JSON.stringify({ data }), { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    console.error('welfare-cycles error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
