import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
};

const COMMISSION_RATE = 0.01; // 1% commission

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const method = req.method;

    // POST endpoint removed - deposits are now created via mpesa-stk-push function
    // Deposits are created when STK Push is initiated, then updated by callback

    // GET /members/:memberId/savings - Get savings history
    if (method === 'GET' && pathParts.length === 2 && pathParts[1] === 'savings') {
      const memberId = pathParts[0];

      // Verify member belongs to user
      const { data: member } = await supabase
        .from('saving_group_members')
        .select('*')
        .eq('id', memberId)
        .eq('user_id', user.id)
        .single();

      if (!member) {
        throw new Error('Member not found or unauthorized');
      }

      // Get all deposits for this member
      const { data: deposits } = await supabase
        .from('saving_group_deposits')
        .select(`
          *,
          payer:profiles!saving_group_deposits_payer_user_id_fkey(full_name, phone)
        `)
        .eq('member_user_id', user.id)
        .eq('saving_group_id', member.group_id)
        .order('created_at', { ascending: false });

      // Get deposits made by this user for others
      const { data: depositsForOthers } = await supabase
        .from('saving_group_deposits')
        .select(`
          *,
          beneficiary:profiles!saving_group_deposits_member_user_id_fkey(full_name, phone)
        `)
        .eq('payer_user_id', user.id)
        .eq('saving_group_id', member.group_id)
        .neq('member_user_id', user.id)
        .order('created_at', { ascending: false });

      const totalSaved = deposits?.reduce((sum, d) => sum + Number(d.net_amount), 0) || 0;
      const totalSavedForOthers = depositsForOthers?.reduce((sum, d) => sum + Number(d.net_amount), 0) || 0;

      console.log(`Savings history retrieved for member ${memberId}`);

      return new Response(
        JSON.stringify({
          success: true,
          deposits,
          deposits_for_others: depositsForOthers,
          statistics: {
            total_saved: totalSaved,
            total_saved_for_others: totalSavedForOthers,
            current_balance: member.current_savings,
            lifetime_deposits: member.lifetime_deposits,
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    throw new Error('Invalid endpoint');

  } catch (error) {
    console.error('Error:', error);
    const message = error instanceof Error ? error.message : 'An error occurred';
    return new Response(
      JSON.stringify({ error: message }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
