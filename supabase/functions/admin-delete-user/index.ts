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
    const { user_id, privilege_code, confirm_name, action } = body;

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
    if (user_id === callerData.user.id && action !== 'restore') {
      return new Response(JSON.stringify({ error: 'Cannot delete your own account' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get profile to verify name confirmation
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('full_name, deleted_at')
      .eq('id', user_id)
      .single();

    if (!profile) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // RESTORE action
    if (action === 'restore') {
      if (!profile.deleted_at) {
        return new Response(JSON.stringify({ error: 'User is not deleted' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { error: restoreError } = await supabaseAdmin
        .from('profiles')
        .update({ deleted_at: null, deleted_by: null, deletion_reason: null })
        .eq('id', user_id);

      if (restoreError) {
        return new Response(JSON.stringify({ error: 'Failed to restore user', details: (restoreError as any).message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log(`User ${user_id} restored by admin ${callerData.user.id}`);

      return new Response(JSON.stringify({ 
        success: true, 
        message: 'User account has been restored'
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // DELETE action — require name confirmation
    if (!confirm_name || confirm_name.trim().toLowerCase() !== profile.full_name.trim().toLowerCase()) {
      return new Response(JSON.stringify({ error: 'Name confirmation does not match. Please type the exact user name.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (profile.deleted_at) {
      return new Response(JSON.stringify({ error: 'User is already deleted' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Admin ${callerData.user.id} soft-deleting user ${user_id}`);

    // Soft-delete: mark the profile as deleted
    const { error: softDeleteError } = await supabaseAdmin
      .from('profiles')
      .update({ 
        deleted_at: new Date().toISOString(),
        deleted_by: callerData.user.id,
        deletion_reason: body.reason || 'Deleted by admin'
      })
      .eq('id', user_id);

    if (softDeleteError) {
      return new Response(JSON.stringify({ 
        error: 'Failed to delete user',
        details: (softDeleteError as any).message
      }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Disable user's auth account (but don't permanently delete)
    // Ban the user so they can't log in
    try {
      await supabaseAdmin.auth.admin.updateUserById(user_id, {
        ban_duration: '876000h', // ~100 years
      });
    } catch (e) {
      console.log('Warning: Failed to ban auth user:', (e as any).message);
    }

    // Log to audit
    try {
      await supabaseAdmin.from('audit_logs').insert({
        action: 'SOFT_DELETE',
        table_name: 'profiles',
        record_id: user_id,
        user_id: callerData.user.id,
        new_values: { deleted_at: new Date().toISOString(), reason: body.reason || 'Deleted by admin' },
      });
    } catch (e) {
      console.log('Warning: Failed to create audit log');
    }

    console.log(`User ${user_id} soft-deleted by admin ${callerData.user.id}`);

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'User account has been deleted. It will be visible in the admin dashboard for 45 days before permanent removal.'
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
