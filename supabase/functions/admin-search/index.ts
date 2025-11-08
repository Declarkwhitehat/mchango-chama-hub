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
    
    // Sanitize and validate input
    const sanitizedQuery = (query || '').trim().substring(0, 100);
    const searchType = type || 'all';
    
    console.log('Admin search:', { query: sanitizedQuery, type: searchType });

    if (!sanitizedQuery) {
      return new Response(JSON.stringify({ 
        error: 'Search query required',
        details: 'Please provide a search term'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results: any = {
      users: [],
      members: [],
      mchangos: [],
      chamas: [],
      transactions: [],
    };

    // Search users (limit 50 results)
    if (searchType === 'all' || searchType === 'user' || searchType === 'email' || searchType === 'phone') {
      const userQuery = supabaseClient
        .from('profiles')
        .select('*');

      if (searchType === 'email') {
        userQuery.ilike('email', `%${sanitizedQuery}%`);
      } else if (searchType === 'phone') {
        userQuery.ilike('phone', `%${sanitizedQuery}%`);
      } else {
        userQuery.or(`full_name.ilike.%${sanitizedQuery}%,email.ilike.%${sanitizedQuery}%,phone.ilike.%${sanitizedQuery}%,id_number.ilike.%${sanitizedQuery}%`);
      }

      const { data: users } = await userQuery.limit(50);
      results.users = users || [];
    }

    // Search member codes (limit 50)
    if (searchType === 'all' || searchType === 'member_code') {
      const { data: members } = await supabaseClient
        .from('chama_members')
        .select(`
          *,
          profiles (full_name, email),
          chama (name, slug)
        `)
        .ilike('member_code', `%${sanitizedQuery}%`)
        .limit(50);

      results.members = members || [];
    }

    // Search mchango slugs (limit 50)
    if (searchType === 'all' || searchType === 'mchango_slug') {
      const { data: mchangos } = await supabaseClient
        .from('mchango')
        .select(`
          *,
          profiles:created_by (full_name, email)
        `)
        .or(`slug.ilike.%${sanitizedQuery}%,title.ilike.%${sanitizedQuery}%`)
        .limit(50);

      results.mchangos = mchangos || [];
    }

    // Search chama slugs (limit 50)
    if (searchType === 'all') {
      const { data: chamas } = await supabaseClient
        .from('chama')
        .select(`
          *,
          profiles:created_by (full_name, email)
        `)
        .or(`slug.ilike.%${sanitizedQuery}%,name.ilike.%${sanitizedQuery}%`)
        .limit(50);

      results.chamas = chamas || [];
    }

    // Search transactions by ID (limit 50)
    if (searchType === 'all' || searchType === 'transaction_id') {
      const { data: transactions } = await supabaseClient
        .from('transactions')
        .select(`
          *,
          profiles (full_name, email)
        `)
        .or(`id.eq.${sanitizedQuery},payment_reference.ilike.%${sanitizedQuery}%`)
        .limit(50);

      results.transactions = transactions || [];
    }

    return new Response(JSON.stringify({ 
      success: true,
      data: results 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error in admin-search:', {
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
