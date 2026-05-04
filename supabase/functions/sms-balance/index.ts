import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '').trim();
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const onfonApiKey = Deno.env.get('ONFON_API_KEY') ?? '';
    const onfonClientId = Deno.env.get('ONFON_CLIENT_ID') ?? '';

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      return new Response(JSON.stringify({ error: 'Backend configuration missing' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!onfonApiKey || !onfonClientId) {
      return new Response(JSON.stringify({ error: 'SMS provider credentials are not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: `Bearer ${token}` },
      },
    });

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    const user = userData?.user;

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: roleData, error: roleError } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (roleError || !roleData) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const balanceUrl = `https://api.onfonmedia.co.ke/v1/sms/Balance?ApiKey=${encodeURIComponent(onfonApiKey)}&ClientId=${encodeURIComponent(onfonClientId)}`;
    const providerResponse = await fetch(balanceUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    const responseText = await providerResponse.text();
    let providerData: Record<string, unknown> | null = null;

    try {
      providerData = JSON.parse(responseText) as Record<string, unknown>;
    } catch (_error) {
      providerData = null;
    }

    if (!providerResponse.ok) {
      return new Response(JSON.stringify({
        error: 'Failed to fetch SMS balance',
        details: providerData?.ErrorDescription ?? responseText ?? `HTTP ${providerResponse.status}`,
      }), {
        status: providerResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const rawData = providerData?.Data;
    const firstEntry = Array.isArray(rawData) ? rawData[0] as Record<string, unknown> | undefined : undefined;
    const balanceValue = firstEntry?.Balance ?? providerData?.Balance ?? providerData?.balance ?? null;
    const currencyValue = firstEntry?.Currency ?? providerData?.Currency ?? providerData?.currency ?? 'KES';

    return new Response(JSON.stringify({
      success: true,
      provider: 'Onfon Media',
      balance: balanceValue,
      currency: currencyValue,
      checkedAt: new Date().toISOString(),
      raw: providerData,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: 'Failed to fetch SMS balance', details: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
