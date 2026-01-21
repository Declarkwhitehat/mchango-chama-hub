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

  let sanitizedQuery = '';
  let searchType = 'all';

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Extract JWT token from Bearer header
    const token = authHeader.replace('Bearer ', '');
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    // Get user using the JWT token - must pass token explicitly
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
    
    if (userError || !user) {
      console.error('Auth error:', userError);
      return new Response(JSON.stringify({ error: 'Unauthorized', details: userError?.message }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Authenticated user:', user.email);

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
    sanitizedQuery = (query || '').trim().substring(0, 100);
    searchType = type || 'all';
    
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
      organizations: [],
      transactions: [],
    };

    // Search users (limit 50 results)
    if (searchType === 'all' || searchType === 'user' || searchType === 'email' || searchType === 'phone' || searchType === 'id_number') {
      const userQuery = supabaseClient
        .from('profiles')
        .select('*');

      if (searchType === 'email') {
        userQuery.ilike('email', `%${sanitizedQuery}%`);
      } else if (searchType === 'phone') {
        userQuery.ilike('phone', `%${sanitizedQuery}%`);
      } else if (searchType === 'id_number') {
        userQuery.ilike('id_number', `%${sanitizedQuery}%`);
      } else if (searchType === 'user') {
        userQuery.ilike('full_name', `%${sanitizedQuery}%`);
      } else {
        userQuery.or(`full_name.ilike.%${sanitizedQuery}%,email.ilike.%${sanitizedQuery}%,phone.ilike.%${sanitizedQuery}%,id_number.ilike.%${sanitizedQuery}%`);
      }

      const { data: users, error: usersError } = await userQuery.limit(50);
      if (usersError) {
        console.error('Error fetching users:', usersError);
      }
      results.users = users || [];
    }

    // Search member codes (limit 50) with comprehensive data
    if (searchType === 'all' || searchType === 'member_code') {
      const { data: members } = await supabaseClient
        .from('chama_members')
        .select(`
          *,
          profiles (
            full_name, 
            email, 
            phone, 
            id_number,
            kyc_status,
            payment_details_completed
          ),
          chama (
            name, 
            slug, 
            group_code,
            contribution_amount,
            contribution_frequency,
            status,
            max_members
          )
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
    if (searchType === 'all' || searchType === 'chama') {
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

    // Search organizations (limit 50)
    if (searchType === 'all' || searchType === 'organization') {
      const { data: orgs } = await supabaseClient
        .from('organizations')
        .select(`
          *,
          profiles:created_by (full_name, email)
        `)
        .or(`slug.ilike.%${sanitizedQuery}%,name.ilike.%${sanitizedQuery}%,category.ilike.%${sanitizedQuery}%`)
        .limit(50);

      results.organizations = orgs || [];
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
      details: error.details,
      hint: error.hint,
      query: sanitizedQuery,
      type: searchType
    });
    
    let safeMessage = 'An error occurred processing your request';
    let statusCode = 500;
    
    if (error.code === '23505') {
      safeMessage = 'Duplicate record found';
    } else if (error.code === '23503') {
      safeMessage = 'Referenced record not found';
    } else if (error.code === '42501') {
      safeMessage = 'Permission denied';
      statusCode = 403;
    } else if (error.message?.includes('fetch')) {
      safeMessage = 'Network error. Please check your connection.';
      statusCode = 503;
    }
    
    return new Response(JSON.stringify({ 
      error: safeMessage,
      details: error.message 
    }), {
      status: statusCode,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
