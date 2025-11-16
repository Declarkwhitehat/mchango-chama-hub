import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authHeader = req.headers.get('Authorization')!;
    
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const url = new URL(req.url);
    let pathParts = url.pathname.split('/').filter(Boolean);
    
    // Normalize pathParts by removing function name prefix
    if (pathParts[0] === 'savings-group-invite') {
      pathParts = pathParts.slice(1);
    }
    
    const method = req.method;
    console.log('Invite Request:', { method, path: url.pathname, normalizedPathParts: pathParts });

    // GET /validate/:code - Public endpoint (no auth required)
    if (method === 'GET' && pathParts[0] === 'validate' && pathParts[1]) {
      const code = pathParts[1].toUpperCase();

      const { data: inviteCode, error: codeError } = await supabase
        .from('saving_group_invite_codes')
        .select('*, saving_groups(*)')
        .eq('code', code)
        .eq('is_active', true)
        .is('used_at', null)
        .single();

      if (codeError || !inviteCode) {
        return new Response(JSON.stringify({ 
          valid: false, 
          message: 'Invalid or inactive invite code' 
        }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check if expired
      if (inviteCode.expires_at && new Date(inviteCode.expires_at) < new Date()) {
        return new Response(JSON.stringify({ 
          valid: false, 
          message: 'This invite code has expired' 
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ 
        valid: true,
        group: inviteCode.saving_groups,
        code: inviteCode.code
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // All other operations require authentication
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);
    if (userError || !user) {
      console.error('Auth error:', userError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST /generate - Generate invite code
    if (method === 'POST' && pathParts[0] === 'generate') {
      const { groupId } = await req.json();

      // Verify user is manager
      const { data: group, error: groupError } = await supabase
        .from('saving_groups')
        .select('manager_id')
        .eq('id', groupId)
        .single();

      if (groupError || !group) {
        return new Response(JSON.stringify({ error: 'Group not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (group.manager_id !== user.id) {
        return new Response(JSON.stringify({ error: 'Only managers can generate invite codes' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Generate code
      const { data: codeData, error: codeError } = await supabase.rpc('generate_group_invite_code');
      
      if (codeError) {
        console.error('Error generating code:', codeError);
        return new Response(JSON.stringify({ error: 'Failed to generate code' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const code = codeData;

      // Insert invite code
      const { data: inviteCode, error: insertError } = await supabase
        .from('saving_group_invite_codes')
        .insert({
          saving_group_id: groupId,
          code: code,
          created_by: user.id,
          is_active: true,
        })
        .select()
        .single();

      if (insertError) {
        console.error('Error inserting invite code:', insertError);
        return new Response(JSON.stringify({ error: 'Failed to create invite code' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ 
        code: inviteCode.code,
        link: `${url.origin}/savings-groups/join?code=${inviteCode.code}`,
        invite_code: inviteCode 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }


    // POST /join/:code - Join group via invite code
    if (method === 'POST' && pathParts[0] === 'join' && pathParts[1]) {
      const code = pathParts[1].toUpperCase();

      // Validate code
      const { data: inviteCode, error: codeError } = await supabase
        .from('saving_group_invite_codes')
        .select('*, saving_groups(*)')
        .eq('code', code)
        .eq('is_active', true)
        .single();

      if (codeError || !inviteCode) {
        return new Response(JSON.stringify({ error: 'Invalid or expired invite code' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (inviteCode.expires_at && new Date(inviteCode.expires_at) < new Date()) {
        return new Response(JSON.stringify({ error: 'Invite code has expired' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (inviteCode.used_by) {
        return new Response(JSON.stringify({ error: 'Invite code already used' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const groupId = inviteCode.saving_group_id;
      
      // Handle both array and object responses
      const group = Array.isArray(inviteCode.saving_groups) 
        ? inviteCode.saving_groups[0] 
        : inviteCode.saving_groups;

      // Check if user already member
      const { data: existingMember } = await supabase
        .from('saving_group_members')
        .select('id')
        .eq('group_id', groupId)
        .eq('user_id', user.id)
        .single();

      if (existingMember) {
        return new Response(JSON.stringify({ error: 'Already a member of this group' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check if group is full
      const { count: memberCount } = await supabase
        .from('saving_group_members')
        .select('*', { count: 'exact', head: true })
        .eq('group_id', groupId)
        .eq('status', 'active');

      if (memberCount && group?.max_members && memberCount >= group.max_members) {
        return new Response(JSON.stringify({ error: 'Group is full' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Create membership (pending approval)
      const { data: membership, error: memberError } = await supabase
        .from('saving_group_members')
        .insert({
          group_id: groupId,
          user_id: user.id,
          is_approved: false,
          status: 'active',
        })
        .select()
        .single();

      if (memberError) {
        console.error('Error creating membership:', memberError);
        return new Response(JSON.stringify({ error: 'Failed to join group' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Mark code as used
      await supabase
        .from('saving_group_invite_codes')
        .update({ used_by: user.id, used_at: new Date().toISOString() })
        .eq('id', inviteCode.id);

      return new Response(JSON.stringify({ 
        success: true,
        membership,
        message: 'Join request submitted. Waiting for manager approval.' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // DELETE /:codeId - Delete invite code
    if (method === 'DELETE' && pathParts[0]) {
      const codeId = pathParts[0];
      
      if (!codeId) {
        return new Response(JSON.stringify({ error: 'No code ID provided' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Verify user is manager
      const { data: inviteCode, error: codeError } = await supabase
        .from('saving_group_invite_codes')
        .select('saving_group_id')
        .eq('id', codeId)
        .single();

      if (codeError || !inviteCode) {
        return new Response(JSON.stringify({ error: 'Invite code not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check if user is manager of the group
      const { data: group } = await supabase
        .from('saving_groups')
        .select('manager_id')
        .eq('id', inviteCode.saving_group_id)
        .single();

      if (!group || group.manager_id !== user.id) {
        return new Response(JSON.stringify({ error: 'Only managers can delete invite codes' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { error: deleteError } = await supabase
        .from('saving_group_invite_codes')
        .delete()
        .eq('id', codeId);

      if (deleteError) {
        console.error('Error deleting invite code:', deleteError);
        return new Response(JSON.stringify({ error: 'Failed to delete invite code' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // GET /list/:groupId - List invite codes for a group
    if (method === 'GET' && pathParts[0] === 'list' && pathParts[1]) {
      const groupId = pathParts[1];

      // Verify user is manager
      const { data: group, error: groupError } = await supabase
        .from('saving_groups')
        .select('manager_id')
        .eq('id', groupId)
        .single();

      if (groupError || !group || group.manager_id !== user.id) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: inviteCodes, error: codesError } = await supabase
        .from('saving_group_invite_codes')
        .select('*')
        .eq('saving_group_id', groupId)
        .order('created_at', { ascending: false });

      if (codesError) {
        console.error('Error fetching invite codes:', codesError);
        return new Response(JSON.stringify({ error: 'Failed to fetch invite codes' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ invite_codes: inviteCodes }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid endpoint' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
