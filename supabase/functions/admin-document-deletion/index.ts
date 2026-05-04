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
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const userId = userData.user.id;

    const admin = createClient(supabaseUrl, supabaseService);
    const { data: isAdmin } = await admin.rpc('has_role', { _user_id: userId, _role: 'admin' });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Admin only' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { action, document_id } = await req.json();
    if (!action || !document_id) {
      return new Response(JSON.stringify({ error: 'action and document_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: doc, error: docErr } = await admin
      .from('group_documents')
      .select('*')
      .eq('id', document_id)
      .single();
    if (docErr || !doc) {
      return new Response(JSON.stringify({ error: 'Document not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const memberIds = await resolveMembers(admin, doc.entity_type, doc.entity_id);

    if (action === 'cancel') {
      await admin.from('group_documents').update({
        deletion_status: 'cancelled',
        deletion_cancelled_at: new Date().toISOString(),
        deletion_cancelled_by: userId,
        deletion_scheduled_for: null,
      }).eq('id', document_id);

      if (memberIds.length > 0) {
        await admin.from('notifications').insert(memberIds.map((uid) => ({
          user_id: uid,
          title: 'Document deletion cancelled',
          message: `Admin cancelled the scheduled deletion of "${doc.title}".`,
          type: 'info',
          category: 'document_deletion_cancelled',
          related_entity_id: doc.entity_id,
          related_entity_type: doc.entity_type,
        })));
      }

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'delete_now' || action === 'process_due') {
      // For process_due, only delete if scheduled_for has passed
      if (action === 'process_due') {
        if (doc.deletion_status !== 'pending' || !doc.deletion_scheduled_for || new Date(doc.deletion_scheduled_for) > new Date()) {
          return new Response(JSON.stringify({ error: 'Not yet due' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      }

      if (doc.file_path) {
        await admin.storage.from('group-documents').remove([doc.file_path]);
      }
      await admin.from('group_documents').delete().eq('id', document_id);

      if (memberIds.length > 0) {
        await admin.from('notifications').insert(memberIds.map((uid) => ({
          user_id: uid,
          title: 'Document deleted',
          message: `"${doc.title}" has been permanently deleted.`,
          type: 'warning',
          category: 'document_deleted',
          related_entity_id: doc.entity_id,
          related_entity_type: doc.entity_type,
        })));
      }

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('admin-document-deletion error:', message);
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
