// Cron-invoked: hard-deletes any pending documents whose 72h cooldown has elapsed.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseService = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, supabaseService);

    const { data: due, error } = await admin
      .from('group_documents')
      .select('*')
      .eq('deletion_status', 'pending')
      .lte('deletion_scheduled_for', new Date().toISOString());

    if (error) throw error;

    let processed = 0;
    for (const doc of due || []) {
      try {
        if (doc.file_path) {
          await admin.storage.from('group-documents').remove([doc.file_path]);
        }
        await admin.from('group_documents').delete().eq('id', doc.id);

        const memberIds = await resolveMembers(admin, doc.entity_type, doc.entity_id);
        if (memberIds.length > 0) {
          await admin.from('notifications').insert(memberIds.map((uid) => ({
            user_id: uid,
            title: 'Document deleted',
            message: `"${doc.title}" has been permanently deleted after the 72-hour cooldown.`,
            type: 'warning',
            category: 'document_deleted',
            related_entity_id: doc.entity_id,
            related_entity_type: doc.entity_type,
          })));
        }
        processed++;
      } catch (e) {
        console.error('Failed to delete document', doc.id, e);
      }
    }

    return new Response(JSON.stringify({ success: true, processed, total: due?.length || 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('process-document-deletions error:', message);
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
