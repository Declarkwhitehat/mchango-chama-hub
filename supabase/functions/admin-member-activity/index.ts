import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: userRole } = await supabaseClient
      .from('user_roles').select('role')
      .eq('user_id', user.id).eq('role', 'admin').maybeSingle();

    if (!userRole) {
      return new Response(JSON.stringify({ error: 'Forbidden - Admin only' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { user_id } = await req.json();
    if (!user_id) {
      return new Response(JSON.stringify({ error: 'user_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Parallel queries
    const [
      profileRes,
      chamaMembersRes,
      welfareMembersRes,
      paymentMethodsRes,
      withdrawalsRes,
      auditLogsRes,
      orgDonationsRes,
      mchangoDonationsRes,
      welfareContribsRes,
      chamaContribsRes,
    ] = await Promise.all([
      supabaseAdmin.from('profiles').select('*').eq('id', user_id).single(),
      supabaseAdmin.from('chama_members').select('*, chama(name, slug, group_code, contribution_amount, contribution_frequency, status)').eq('user_id', user_id).limit(50),
      supabaseAdmin.from('welfare_members').select('*, welfares:welfare_id(name, slug, status, contribution_amount)').eq('user_id', user_id).limit(50),
      supabaseAdmin.from('payment_methods').select('*').eq('user_id', user_id),
      supabaseAdmin.from('withdrawals').select('*, chama:chama_id(name), mchango:mchango_id(title), welfares:welfare_id(name), organizations:organization_id(name)').eq('requested_by', user_id).order('created_at', { ascending: false }).limit(20),
      supabaseAdmin.from('audit_logs').select('*').eq('user_id', user_id).order('created_at', { ascending: false }).limit(100),
      supabaseAdmin.from('organization_donations').select('*, organizations:organization_id(name)').eq('user_id', user_id).order('created_at', { ascending: false }).limit(30),
      supabaseAdmin.from('mchango_donations').select('*, mchango:mchango_id(title)').eq('user_id', user_id).order('created_at', { ascending: false }).limit(30),
      supabaseAdmin.from('welfare_contributions').select('*, welfares:welfare_id(name)').eq('user_id', user_id).order('created_at', { ascending: false }).limit(30),
      supabaseAdmin.from('contributions').select('*, chama:chama_id(name), chama_members!contributions_member_id_fkey(member_code, user_id)').order('created_at', { ascending: false }).limit(50),
    ]);

    // Filter chama contributions by user_id via chama_members join
    const chamaContribs = (chamaContribsRes.data || []).filter(
      (c: any) => c.chama_members?.user_id === user_id
    );

    // Unify payments
    const payments: any[] = [];

    for (const d of orgDonationsRes.data || []) {
      payments.push({
        id: d.id, type: 'Organization Donation', source_name: d.organizations?.name || 'Unknown',
        amount: d.gross_amount || d.amount, net_amount: d.net_amount, commission: d.commission_amount,
        status: d.payment_status, mpesa_receipt: d.mpesa_receipt_number, reference: d.payment_reference,
        created_at: d.created_at, completed_at: d.completed_at,
      });
    }
    for (const d of mchangoDonationsRes.data || []) {
      payments.push({
        id: d.id, type: 'Mchango Donation', source_name: d.mchango?.title || 'Unknown',
        amount: d.gross_amount || d.amount, net_amount: d.net_amount, commission: d.commission_amount,
        status: d.payment_status, mpesa_receipt: d.mpesa_receipt_number, reference: d.payment_reference,
        created_at: d.created_at, completed_at: d.completed_at,
      });
    }
    for (const d of welfareContribsRes.data || []) {
      payments.push({
        id: d.id, type: 'Welfare Contribution', source_name: d.welfares?.name || 'Unknown',
        amount: d.gross_amount, net_amount: d.net_amount, commission: d.commission_amount,
        status: d.payment_status, mpesa_receipt: d.mpesa_receipt_number, reference: d.payment_reference,
        created_at: d.created_at, completed_at: d.completed_at,
      });
    }
    for (const d of chamaContribs) {
      payments.push({
        id: d.id, type: 'Chama Contribution', source_name: d.chama?.name || 'Unknown',
        amount: d.amount, net_amount: null, commission: null,
        status: d.status, mpesa_receipt: d.mpesa_receipt_number, reference: d.payment_reference,
        created_at: d.created_at, completed_at: null,
      });
    }

    payments.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return new Response(JSON.stringify({
      success: true,
      data: {
        profile: profileRes.data,
        chama_memberships: chamaMembersRes.data || [],
        welfare_memberships: welfareMembersRes.data || [],
        payment_methods: paymentMethodsRes.data || [],
        withdrawals: withdrawalsRes.data || [],
        audit_logs: auditLogsRes.data || [],
        payments: payments.slice(0, 50),
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error in admin-member-activity:', error);
    return new Response(JSON.stringify({ error: 'Internal server error', details: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
