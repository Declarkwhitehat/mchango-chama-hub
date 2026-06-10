// Called from the client after a verified user creates an entity that is
// inserted client-side (e.g. organizations). The 3 server-side crud
// functions notify admins inline; this exists so the org create flow can do
// the same without bypassing RLS or trusting client claims.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { notifyAllAdmins } from "../_shared/notifications.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ENTITY_LABELS: Record<string, string> = {
  organization: 'organization',
  chama: 'chama',
  welfare: 'welfare',
  mchango: 'campaign',
  campaign: 'campaign',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: { user } } = await supabase.auth.getUser(authHeader);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { entity_type, entity_id, entity_name } = await req.json();
    if (!entity_type || !entity_name) {
      return new Response(JSON.stringify({ error: 'Missing fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: creator } = await supabase
      .from('profiles')
      .select('is_verified, full_name')
      .eq('id', user.id)
      .maybeSingle();

    if (!creator?.is_verified) {
      return new Response(JSON.stringify({ skipped: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const label = ENTITY_LABELS[String(entity_type).toLowerCase()] || String(entity_type);
    const requesterLabel = creator.full_name || 'verified user';

    // Auto-create a verification request so admin can review & approve
    // (entity is no longer auto-verified for verified creators).
    if (entity_id) {
      try {
        await supabase.from('verification_requests').insert({
          entity_type: String(entity_type).toLowerCase(),
          entity_id,
          requested_by: user.id,
          request_reason: `[AUTO] Created by verified account: ${requesterLabel}. No fee charged — please review and approve verified badge.`,
        });
      } catch (e) {
        console.warn('notify-admin-verified-create: insert request failed (non-fatal):', e);
      }
    }

    await notifyAllAdmins(supabase, {
      title: `Verified user created ${label} — review`,
      message: `${requesterLabel} created ${label} "${entity_name}". Approve in Verification Requests to issue the badge.`,
      type: 'info',
      category: 'verification',
      relatedEntityId: entity_id || undefined,
      relatedEntityType: entity_type,
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('notify-admin-verified-create error', e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
