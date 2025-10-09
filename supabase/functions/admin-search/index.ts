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

    const { query, type } = await req.json();
    console.log('Admin search:', { query, type });

    const results: any = {
      users: [],
      members: [],
      mchangos: [],
      chamas: [],
      transactions: [],
    };

    // Search users
    if (type === 'all' || type === 'user' || type === 'email' || type === 'phone') {
      const userQuery = supabaseClient
        .from('profiles')
        .select('*');

      if (type === 'email') {
        userQuery.ilike('email', `%${query}%`);
      } else if (type === 'phone') {
        userQuery.ilike('phone', `%${query}%`);
      } else {
        userQuery.or(`full_name.ilike.%${query}%,email.ilike.%${query}%,phone.ilike.%${query}%,id_number.ilike.%${query}%`);
      }

      const { data: users } = await userQuery.limit(20);
      results.users = users || [];
    }

    // Search member codes
    if (type === 'all' || type === 'member_code') {
      const { data: members } = await supabaseClient
        .from('chama_members')
        .select(`
          *,
          profiles (full_name, email),
          chama (name, slug)
        `)
        .ilike('member_code', `%${query}%`)
        .limit(20);

      results.members = members || [];
    }

    // Search mchango slugs
    if (type === 'all' || type === 'mchango_slug') {
      const { data: mchangos } = await supabaseClient
        .from('mchango')
        .select(`
          *,
          profiles:created_by (full_name, email)
        `)
        .or(`slug.ilike.%${query}%,title.ilike.%${query}%`)
        .limit(20);

      results.mchangos = mchangos || [];
    }

    // Search chama slugs
    if (type === 'all') {
      const { data: chamas } = await supabaseClient
        .from('chama')
        .select(`
          *,
          profiles:created_by (full_name, email)
        `)
        .or(`slug.ilike.%${query}%,name.ilike.%${query}%`)
        .limit(20);

      results.chamas = chamas || [];
    }

    // Search transactions by ID
    if (type === 'all' || type === 'transaction_id') {
      const { data: transactions } = await supabaseClient
        .from('transactions')
        .select(`
          *,
          profiles (full_name, email)
        `)
        .or(`id.eq.${query},payment_reference.ilike.%${query}%`)
        .limit(20);

      results.transactions = transactions || [];
    }

    return new Response(JSON.stringify({ data: results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error in admin-search:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
