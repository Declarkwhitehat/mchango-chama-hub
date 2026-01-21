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

    const { type, limit = 1000, offset = 0 } = await req.json();
    console.log('Admin export:', { type, limit, offset });

    if (!['transactions', 'members', 'organizations', 'organization_donations'].includes(type)) {
      return new Response(JSON.stringify({ 
        error: 'Invalid export type',
        details: 'Type must be "transactions", "members", "organizations", or "organization_donations"'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let csv = '';
    let totalRecords = 0;

    if (type === 'transactions') {
      const { data: txData, error: txError } = await supabaseClient
        .from('transactions')
        .select(`
          *,
          profiles (full_name, email)
        `)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (txError) {
        console.error('Transaction export error:', txError);
        throw txError;
      }

      const transactions = txData || [];
      totalRecords = transactions.length;

      csv = 'ID,Date,User Name,Email,Amount,Type,Payment Method,Reference,Status\n';
      transactions.forEach((tx: any) => {
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
      const { data: memberData, error: memberError } = await supabaseClient
        .from('chama_members')
        .select(`
          *,
          profiles (full_name, email, phone),
          chama (name, slug, contribution_amount)
        `)
        .order('joined_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (memberError) {
        console.error('Member export error:', memberError);
        throw memberError;
      }

      const members = memberData || [];
      totalRecords = members.length;

      csv = 'Member Code,Name,Email,Phone,Chama,Joined Date,Order Index,Status,Is Manager\n';
      members.forEach((member: any) => {
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
    } else if (type === 'organizations') {
      const { data: orgData, error: orgError } = await supabaseClient
        .from('organizations')
        .select(`
          *,
          profiles:created_by (full_name, email)
        `)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (orgError) {
        console.error('Organization export error:', orgError);
        throw orgError;
      }

      const organizations = orgData || [];
      totalRecords = organizations.length;

      csv = 'ID,Name,Slug,Category,Status,Verified,Creator,Email,Total Raised,Balance,Commission Paid,Created At\n';
      organizations.forEach((org: any) => {
        csv += `${org.id},`;
        csv += `"${org.name}",`;
        csv += `${org.slug},`;
        csv += `${org.category},`;
        csv += `${org.status},`;
        csv += `${org.is_verified},`;
        csv += `"${org.profiles?.full_name || 'Unknown'}",`;
        csv += `${org.profiles?.email || 'N/A'},`;
        csv += `${org.total_gross_collected || 0},`;
        csv += `${org.available_balance || 0},`;
        csv += `${org.total_commission_paid || 0},`;
        csv += `${new Date(org.created_at).toISOString()}\n`;
      });
    } else if (type === 'organization_donations') {
      const { data: donationData, error: donationError } = await supabaseClient
        .from('organization_donations')
        .select(`
          *,
          organizations (name, slug, category)
        `)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (donationError) {
        console.error('Organization donations export error:', donationError);
        throw donationError;
      }

      const donations = donationData || [];
      totalRecords = donations.length;

      csv = 'ID,Date,Organization,Category,Donor Name,Phone,Email,Gross Amount,Commission,Net Amount,Payment Method,Reference,Status\n';
      donations.forEach((d: any) => {
        csv += `${d.id},`;
        csv += `${new Date(d.created_at).toISOString()},`;
        csv += `"${d.organizations?.name || 'Unknown'}",`;
        csv += `${d.organizations?.category || 'N/A'},`;
        csv += `"${d.display_name || (d.is_anonymous ? 'Anonymous' : 'Unknown')}",`;
        csv += `${d.phone || 'N/A'},`;
        csv += `${d.email || 'N/A'},`;
        csv += `${d.gross_amount || d.amount},`;
        csv += `${d.commission_amount || 0},`;
        csv += `${d.net_amount || d.amount},`;
        csv += `${d.payment_method || 'N/A'},`;
        csv += `${d.payment_reference},`;
        csv += `${d.payment_status}\n`;
      });
    }

    return new Response(JSON.stringify({ 
      success: true,
      message: 'Export complete',
      csv,
      total: totalRecords,
      offset,
      limit
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error in admin-export:', {
      message: error.message,
      code: error.code,
      details: error.details
    });
    
    let safeMessage = 'An error occurred processing your request';
    if (error.code === '23505') safeMessage = 'Duplicate record';
    else if (error.code === '23503') safeMessage = 'Referenced record not found';
    else if (error.code === '42501') safeMessage = 'Permission denied';
    
    return new Response(JSON.stringify({ error: safeMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
