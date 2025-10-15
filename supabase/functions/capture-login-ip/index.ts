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
    const authHeader = req.headers.get('Authorization') || undefined;
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: authHeader ? { Authorization: authHeader } : {},
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

    // Get IP address from request headers
    // Try multiple headers as different proxies/CDNs use different headers
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
               req.headers.get('x-real-ip') ||
               req.headers.get('cf-connecting-ip') || // Cloudflare
               req.headers.get('fastly-client-ip') || // Fastly
               req.headers.get('x-cluster-client-ip') ||
               req.headers.get('x-forwarded') ||
               req.headers.get('forwarded-for') ||
               req.headers.get('forwarded') ||
               'unknown';

    const body = await req.json();
    const { is_signup } = body;

    console.log(`Capturing IP for user ${user.id}: ${ip} (signup: ${is_signup})`);

    // Update profile with IP address
    const updateData: any = {
      last_login_ip: ip,
      last_login_at: new Date().toISOString(),
    };

    // If this is a signup, also set signup_ip
    if (is_signup) {
      updateData.signup_ip = ip;
    }

    const { error: updateError } = await supabaseClient
      .from('profiles')
      .update(updateData)
      .eq('id', user.id);

    if (updateError) {
      console.error('Error updating profile with IP:', updateError);
      throw updateError;
    }

    // Also log to audit_logs for historical tracking
    const { error: auditError } = await supabaseClient
      .from('audit_logs')
      .insert({
        user_id: user.id,
        table_name: 'auth',
        action: is_signup ? 'signup' : 'login',
        ip_address: ip,
        new_values: { event: is_signup ? 'signup' : 'login', ip: ip }
      });

    if (auditError) {
      console.error('Error creating audit log:', auditError);
      // Don't throw, just log - audit is nice to have but not critical
    }

    return new Response(JSON.stringify({ 
      success: true,
      ip: ip,
      message: 'IP address captured successfully'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error in capture-login-ip:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
