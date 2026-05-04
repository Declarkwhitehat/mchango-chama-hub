import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing auth' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseService = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const userId = userData.user.id;

    const { document_id, reason } = await req.json();
    if (!document_id) {
      return new Response(JSON.stringify({ error: 'document_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const admin = createClient(supabaseUrl, supabaseService);

    const { data: doc, error: docErr } = await admin
      .from('group_documents')
      .select('id, title, entity_type, entity_id, deletion_status')
      .eq('id', document_id)
      .single();

    if (docErr || !doc) {
      return new Response(JSON.stringify({ error: 'Document not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (doc.deletion_status === 'pending') {
      return new Response(JSON.stringify({ error: 'Already pending deletion' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Verify caller is manager OR platform admin
    const { data: isMgr } = await admin.rpc('is_entity_manager', {
      _user_id: userId,
      _entity_type: doc.entity_type,
      _entity_id: doc.entity_id,
    });
    const { data: isAdmin } = await admin.rpc('has_role', { _user_id: userId, _role: 'admin' });

    if (!isMgr && !isAdmin) {
      return new Response(JSON.stringify({ error: 'Only managers can request deletion' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const scheduledFor = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

    const { error: updErr } = await admin
      .from('group_documents')
      .update({
        deletion_status: 'pending',
        deletion_requested_at: new Date().toISOString(),
        deletion_requested_by: userId,
        deletion_scheduled_for: scheduledFor,
        deletion_reason: reason || null,
        deletion_cancelled_at: null,
        deletion_cancelled_by: null,
      })
      .eq('id', document_id);

    if (updErr) throw updErr;

    // Resolve member user_ids by entity
    const memberIds = await resolveMembers(admin, doc.entity_type, doc.entity_id);

    if (memberIds.length > 0) {
      const notifications = memberIds.map((uid) => ({
        user_id: uid,
        title: 'Document scheduled for deletion',
        message: `"${doc.title}" will be permanently deleted in 72 hours unless an admin cancels the request.`,
        type: 'warning',
        category: 'document_deletion_scheduled',
        related_entity_id: doc.entity_id,
        related_entity_type: doc.entity_type,
      }));
      await admin.from('notifications').insert(notifications);
    }

    return new Response(JSON.stringify({ success: true, scheduled_for: scheduledFor, notified: memberIds.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('request-document-deletion error:', message);
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

async function resolveMembers(admin: any, entityType: string, entityId: string): Promise<string[]> {
  const ids = new Set<string>();
  if (entityType === 'chama') {
    const { data } = await admin.from('chama_members').select('user_id').eq('chama_id', entityId).eq('status', 'active').eq('approval_status', 'approved');
    data?.forEach((r: any) => r.user_id && ids.add(r.user_id));
  } else if (entityType === 'welfare') {
    const { data } = await admin.from('welfare_members').select('user_id').eq('welfare_id', entityId).eq('status', 'active');
    data?.forEach((r: any) => r.user_id && ids.add(r.user_id));
  } else if (entityType === 'mchango') {
    const { data } = await admin.from('mchango').select('created_by, managers').eq('id', entityId).single();
    if (data?.created_by) ids.add(data.created_by);
    (data?.managers || []).forEach((u: string) => ids.add(u));
  } else if (entityType === 'organization') {
    const { data } = await admin.from('organizations').select('created_by').eq('id', entityId).single();
    if (data?.created_by) ids.add(data.created_by);
  }
  return Array.from(ids);
}
