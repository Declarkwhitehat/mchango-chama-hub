import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const ADMIN_PRIVILEGE_CODE = "D3E9C0L1A3R9K";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '').trim();
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Verify caller is admin
    const { data: callerData, error: callerError } = await supabaseAdmin.auth.getUser(token);
    if (callerError || !callerData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: adminRole } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', callerData.user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!adminRole) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { user_id, privilege_code } = body;

    if (!user_id) {
      return new Response(JSON.stringify({ error: 'user_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (privilege_code !== ADMIN_PRIVILEGE_CODE) {
      return new Response(JSON.stringify({ error: 'Invalid privilege code' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Prevent self-deletion
    if (user_id === callerData.user.id) {
      return new Response(JSON.stringify({ error: 'Cannot delete your own account' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Admin ${callerData.user.id} deleting user ${user_id}`);

    // Cascade delete user data in correct order
    const deletionSteps = [
      // Fraud & security
      { table: 'fraud_events', filter: { user_id } },
      { table: 'user_risk_profiles', filter: { user_id } },
      // Auth & security
      { table: 'totp_secrets', filter: { user_id } },
      { table: 'webauthn_credentials', filter: { user_id } },
      { table: 'user_roles', filter: { user_id } },
      { table: 'otp_verifications', filter: { phone: null } }, // handled separately
      // Notifications & chat
      { table: 'notifications', filter: { user_id } },
      { table: 'chat_messages', filter: { user_id } },
      // Audit
      { table: 'audit_logs', filter: { user_id } },
      // Payment methods
      { table: 'payment_methods', filter: { user_id } },
      // Trust scores
      { table: 'member_trust_scores', filter: { user_id } },
    ];

    for (const step of deletionSteps) {
      try {
        const { error } = await supabaseAdmin
          .from(step.table)
          .delete()
          .eq('user_id', user_id);
        if (error) {
          console.log(`Warning: Failed to delete from ${step.table}:`, (error as any).message);
        }
      } catch (e) {
        console.log(`Warning: Table ${step.table} may not exist, skipping`);
      }
    }

    // Delete OTP verifications by phone
    const { data: profileData } = await supabaseAdmin
      .from('profiles')
      .select('phone')
      .eq('id', user_id)
      .single();

    if (profileData?.phone) {
      await supabaseAdmin
        .from('otp_verifications')
        .delete()
        .eq('phone', profileData.phone);
    }

    // Remove chama memberships (but don't delete the chamas themselves)
    await supabaseAdmin
      .from('chama_members')
      .delete()
      .eq('user_id', user_id);

    // Remove welfare memberships
    await supabaseAdmin
      .from('welfare_members')
      .delete()
      .eq('user_id', user_id);

    // Remove chama rejoin requests
    await supabaseAdmin
      .from('chama_rejoin_requests')
      .delete()
      .eq('user_id', user_id);

    // Delete KYC documents from storage
    try {
      const { data: files } = await supabaseAdmin.storage
        .from('id-documents')
        .list(user_id);

      if (files && files.length > 0) {
        const filePaths = files.map(f => `${user_id}/${f.name}`);
        await supabaseAdmin.storage
          .from('id-documents')
          .remove(filePaths);
      }
    } catch (e) {
      console.log('Warning: Failed to delete storage files:', (e as any).message);
    }

    // Delete the profile
    const { error: profileDeleteError } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', user_id);

    if (profileDeleteError) {
      console.error('Failed to delete profile:', (profileDeleteError as any).message);
      return new Response(JSON.stringify({ 
        error: 'Failed to delete user profile',
        details: (profileDeleteError as any).message
      }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Finally delete the auth user
    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(user_id);

    if (authDeleteError) {
      console.error('Failed to delete auth user:', (authDeleteError as any).message);
      return new Response(JSON.stringify({ 
        error: 'Profile deleted but auth cleanup failed',
        details: (authDeleteError as any).message
      }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`User ${user_id} successfully deleted by admin ${callerData.user.id}`);

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'User account and all associated data have been deleted'
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in admin-delete-user:', (error as any).message);
    return new Response(JSON.stringify({ error: (error as any).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
