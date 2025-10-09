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
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      authHeader ? {
        global: {
          headers: { Authorization: authHeader },
        },
      } : {}
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if user is admin
    const { data: userRole } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!userRole) {
      return new Response(JSON.stringify({ error: 'Forbidden - Admin only' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { type } = await req.json();
    console.log('Admin export:', { type });

    let csv = '';

    if (type === 'transactions') {
      const { data: transactions } = await supabaseClient
        .from('transactions')
        .select(`
          *,
          profiles (full_name, email)
        `)
        .order('created_at', { ascending: false });

      // CSV Header
      csv = 'ID,Date,User Name,Email,Amount,Type,Payment Method,Reference,Status\n';

      // CSV Rows
      transactions?.forEach((tx: any) => {
        csv += `${tx.id},`;
        csv += `${new Date(tx.created_at).toISOString()},`;
        csv += `"${tx.profiles?.full_name || 'Unknown'}",`;
        csv += `${tx.profiles?.email || 'N/A'},`;
        csv += `${tx.amount},`;
        csv += `${tx.transaction_type},`;
        csv += `${tx.payment_method || 'N/A'},`;
        csv += `${tx.payment_reference},`;
        csv += `${tx.status}\n`;
      });
    } else if (type === 'members') {
      const { data: members } = await supabaseClient
        .from('chama_members')
        .select(`
          *,
          profiles (full_name, email, phone),
          chama (name, slug, contribution_amount)
        `)
        .order('joined_at', { ascending: false });

      // CSV Header
      csv = 'Member Code,Name,Email,Phone,Chama,Joined Date,Order Index,Status,Is Manager\n';

      // CSV Rows
      members?.forEach((member: any) => {
        csv += `${member.member_code},`;
        csv += `"${member.profiles?.full_name || 'Unknown'}",`;
        csv += `${member.profiles?.email || 'N/A'},`;
        csv += `${member.profiles?.phone || 'N/A'},`;
        csv += `"${member.chama?.name || 'N/A'}",`;
        csv += `${new Date(member.joined_at).toISOString()},`;
        csv += `${member.order_index},`;
        csv += `${member.approval_status},`;
        csv += `${member.is_manager}\n`;
      });
    } else {
      return new Response(JSON.stringify({ error: 'Invalid export type' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ csv }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error in admin-export:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
