import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { corsHeaders } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // For POST requests, read action from body
    let action = '';
    let requestBody: any = {};
    
    if (req.method === 'POST') {
      requestBody = await req.json();
      action = requestBody.action;
    }

    // CREATE CYCLE FOR TODAY
    if (action === 'create-today' && req.method === 'POST') {
      const { chamaId } = requestBody;

      // Get chama details - work with ALL frequencies
      const { data: chama, error: chamaError } = await supabase
        .from('chama')
        .select('*, chama_members!inner(*)')
        .eq('id', chamaId)
        .eq('status', 'active')
        .single();

      if (chamaError || !chama) {
        return new Response(JSON.stringify({ error: 'Chama not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Check if today's cycle already exists
      const today = new Date().toISOString().split('T')[0];
      const { data: existingCycle } = await supabase
        .from('contribution_cycles')
        .select('*')
        .eq('chama_id', chamaId)
        .gte('start_date', today)
        .lte('end_date', today)
        .maybeSingle();

      if (existingCycle) {
        return new Response(JSON.stringify({ cycle: existingCycle }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Get approved members
      const { data: members } = await supabase
        .from('chama_members')
        .select('*')
        .eq('chama_id', chamaId)
        .eq('approval_status', 'approved')
        .eq('status', 'active')
        .order('order_index');

      if (!members || members.length === 0) {
        return new Response(JSON.stringify({ error: 'No approved members' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Determine today's beneficiary based on payout order and cycle count
      const { data: latestCycle } = await supabase
        .from('contribution_cycles')
        .select('cycle_number')
        .eq('chama_id', chamaId)
        .order('cycle_number', { ascending: false })
        .limit(1)
        .maybeSingle();

      const cycleNumber = (latestCycle?.cycle_number || 0) + 1;
      const beneficiaryIndex = (cycleNumber - 1) % members.length;
      const beneficiary = members[beneficiaryIndex];

      // Calculate cycle dates based on contribution frequency
      const startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date();
      
      switch (chama.contribution_frequency) {
        case 'daily':
          endDate.setHours(23, 59, 59, 999);
          break;
        case 'weekly':
          endDate.setDate(endDate.getDate() + 6);
          endDate.setHours(23, 59, 59, 999);
          break;
        case 'monthly':
          endDate.setMonth(endDate.getMonth() + 1);
          endDate.setDate(0); // Last day of month
          endDate.setHours(23, 59, 59, 999);
          break;
        case 'every_n_days':
          endDate.setDate(endDate.getDate() + (chama.every_n_days_count || 7) - 1);
          endDate.setHours(23, 59, 59, 999);
          break;
        default:
          endDate.setDate(endDate.getDate() + 6);
          endDate.setHours(23, 59, 59, 999);
      }

      const { data: newCycle, error: cycleError } = await supabase
        .from('contribution_cycles')
        .insert({
          chama_id: chamaId,
          cycle_number: cycleNumber,
          start_date: startDate.toISOString(),
          end_date: endDate.toISOString(),
          due_amount: chama.contribution_amount,
          beneficiary_member_id: beneficiary.id,
          is_complete: false,
          payout_processed: false
        })
        .select()
        .single();

      if (cycleError) {
        console.error('Error creating cycle:', cycleError);
        return new Response(JSON.stringify({ error: cycleError.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Create payment records for all members
      const paymentRecords = members.map(member => ({
        member_id: member.id,
        cycle_id: newCycle.id,
        amount_due: chama.contribution_amount - (member.next_cycle_credit || 0),
        is_paid: false
      }));

      const { error: paymentError } = await supabase
        .from('member_cycle_payments')
        .insert(paymentRecords);

      if (paymentError) {
        console.error('Error creating payment records:', paymentError);
      }

      return new Response(JSON.stringify({ cycle: newCycle, beneficiary }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // GET CURRENT CYCLE
    if (action === 'current' && req.method === 'POST') {
      const { chamaId } = requestBody;
      const today = new Date().toISOString().split('T')[0];

      const { data: cycle, error } = await supabase
        .from('contribution_cycles')
        .select(`
          *,
          beneficiary:chama_members!beneficiary_member_id(
            id,
            member_code,
            user_id,
            profiles!chama_members_user_id_fkey(full_name)
          )
        `)
        .eq('chama_id', chamaId)
        .gte('start_date', today)
        .lte('end_date', today)
        .maybeSingle();

      if (error) {
        console.error('Error fetching cycle:', error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (!cycle) {
        return new Response(JSON.stringify({ cycle: null }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Get payment status for all members
      const { data: payments } = await supabase
        .from('member_cycle_payments')
        .select(`
          *,
          chama_members!member_id(
            id,
            member_code,
            user_id,
            profiles!chama_members_user_id_fkey(full_name)
          )
        `)
        .eq('cycle_id', cycle.id);

      return new Response(JSON.stringify({ cycle, payments }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid endpoint' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error in daily-cycle-manager:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});