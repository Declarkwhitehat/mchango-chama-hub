import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// UUID validation helper
const isValidUUID = (uuid: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
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
    let chamaId = url.searchParams.get('chama_id');
    
    // Also allow passing chama_id in the request body
    if (!chamaId) {
      try {
        const text = await req.text();
        if (text) {
          const body = JSON.parse(text);
          if (body && typeof body.chama_id === 'string') {
            chamaId = body.chama_id;
          }
        }
      } catch (_e) {
        // ignore parse errors
      }
    }
    
    if (!chamaId) {
      return new Response(JSON.stringify({ error: 'chama_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate UUID format
    if (!isValidUUID(chamaId)) {
      return new Response(JSON.stringify({ error: 'Invalid chama_id format. Must be a valid UUID.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('member-dashboard request', { userId: user.id, chamaId });

    // Fetch member information
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
      .maybeSingle();

    if (memberError || !member) {
      console.error('Member lookup failed:', memberError);
      return new Response(JSON.stringify({ 
        error: 'Member not found',
        details: 'You are not an approved member of this chama or it does not exist'
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch chama details
    const { data: chama, error: chamaError } = await supabaseClient
      .from('chama')
      .select('*')
      .eq('id', chamaId)
      .maybeSingle();

    if (chamaError || !chama) {
      console.error('Chama lookup failed:', chamaError);
      throw new Error('Chama not found');
    }

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
      .maybeSingle();

    let currentCyclePayment = null;
    if (currentCycle) {
      const { data: payment } = await supabaseClient
        .from('member_cycle_payments')
        .select('*')
        .eq('member_id', member.id)
        .eq('cycle_id', currentCycle.id)
        .maybeSingle();

      currentCyclePayment = payment;
    }

    // Calculate payout position
    const { data: payoutPosition, error: payoutError } = await supabaseClient
      .rpc('get_member_payout_position', { p_member_id: member.id })
      .maybeSingle();
    
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

    return new Response(JSON.stringify({ 
      success: true,
      data: dashboardData 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error in member-dashboard:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Internal server error',
      code: 'DASHBOARD_ERROR'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
