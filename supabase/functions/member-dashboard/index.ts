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
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
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

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(req.url);
    const chamaId = url.searchParams.get('chama_id');

    if (!chamaId) {
      return new Response(JSON.stringify({ error: 'chama_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('member-dashboard request', { userId: user.id, chamaId });

    // Get member info
    const { data: member, error: memberError } = await supabaseClient
      .from('chama_members')
      .select(`
        *,
        profiles!chama_members_user_id_fkey (
          full_name,
          email,
          phone
        )
      `)
      .eq('chama_id', chamaId)
      .eq('user_id', user.id)
      .eq('approval_status', 'approved')
      .single();

    if (memberError || !member) {
      return new Response(JSON.stringify({ error: 'Member not found or not approved' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get chama details
    const { data: chama, error: chamaError } = await supabaseClient
      .from('chama')
      .select('*')
      .eq('id', chamaId)
      .single();

    if (chamaError) throw chamaError;

    // Get payment history (contributions)
    const { data: contributions, error: contribError } = await supabaseClient
      .from('contributions')
      .select('*')
      .eq('chama_id', chamaId)
      .eq('member_id', member.id)
      .order('contribution_date', { ascending: false });

    if (contribError) console.error('Error fetching contributions:', contribError);

    // Get current cycle payment status
    const { data: currentCycle } = await supabaseClient
      .from('contribution_cycles')
      .select('*')
      .eq('chama_id', chamaId)
      .lte('start_date', new Date().toISOString())
      .gte('end_date', new Date().toISOString())
      .single();

    let currentCyclePayment = null;
    if (currentCycle) {
      const { data: payment } = await supabaseClient
        .from('member_cycle_payments')
        .select('*')
        .eq('member_id', member.id)
        .eq('cycle_id', currentCycle.id)
        .single();

      currentCyclePayment = payment;
    }

    // Calculate payout position
    const { data: payoutPosition, error: payoutError } = await supabaseClient
      .rpc('get_member_payout_position', { p_member_id: member.id })
      .single();
    
    if (payoutError) {
      console.error('Error fetching payout position:', payoutError);
    }

    // Get all approved members count
    const { count: memberCount } = await supabaseClient
      .from('chama_members')
      .select('*', { count: 'exact', head: true })
      .eq('chama_id', chamaId)
      .eq('approval_status', 'approved');

    const dashboardData = {
      member: {
        id: member.id,
        full_name: member.profiles.full_name,
        email: member.profiles.email,
        phone: member.profiles.phone,
        member_code: member.member_code,
        joined_at: member.joined_at,
        order_index: member.order_index,
        balance_credit: member.balance_credit || 0,
        balance_deficit: member.balance_deficit || 0,
        last_payment_date: member.last_payment_date,
        next_due_date: member.next_due_date,
      },
      chama: {
        name: chama.name,
        contribution_amount: chama.contribution_amount,
        contribution_frequency: chama.contribution_frequency,
        commission_rate: chama.commission_rate || 0.05,
        member_count: memberCount || 0,
      },
      current_cycle: currentCyclePayment ? {
        is_paid: currentCyclePayment.is_paid,
        amount_paid: currentCyclePayment.amount_paid,
        amount_due: currentCyclePayment.amount_due,
        paid_at: currentCyclePayment.paid_at,
      } : null,
      payment_history: contributions || [],
      payout_schedule: payoutPosition || null,
    };

    return new Response(JSON.stringify({ data: dashboardData }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error in member-dashboard:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
