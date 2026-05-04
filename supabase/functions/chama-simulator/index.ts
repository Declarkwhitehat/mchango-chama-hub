// Chama Simulator — admin-only end-to-end test runner.
// Stages will be implemented in the follow-up turn. This skeleton handles:
//   POST { action: "start" }              → creates a simulation_run, kicks off async runner
//   POST { action: "status", run_id }     → returns latest report row
//   POST { action: "reset" }              → invokes admin_purge_simulation_data()
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY')!;

interface StageResult {
  stage: number;
  name: string;
  status: 'pass' | 'fail' | 'skip';
  expected: string;
  actual: string;
  details?: unknown;
  error?: string;
}

async function requireAdmin(req: Request) {
  const auth = req.headers.get('Authorization');
  if (!auth) throw new Error('Authentication required');
  const token = auth.replace('Bearer ', '');
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: auth } },
  });
  const { data: { user } } = await userClient.auth.getUser(token);
  if (!user) throw new Error('Authentication required');
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: roles } = await admin
    .from('user_roles').select('role').eq('user_id', user.id);
  const isAdmin = (roles ?? []).some((r: { role: string }) => r.role === 'admin');
  if (!isAdmin) throw new Error('Admin only');
  return { user, admin };
}

async function appendStage(admin: SupabaseClient, runId: string, stage: StageResult) {
  const { data: row } = await admin
    .from('simulation_runs')
    .select('report,total_tests,passed,failed')
    .eq('id', runId)
    .maybeSingle();
  const report = (row?.report as { stages?: StageResult[] }) ?? { stages: [] };
  const stages = report.stages ?? [];
  stages.push(stage);
  const total  = (row?.total_tests ?? 0) + 1;
  const passed = (row?.passed ?? 0) + (stage.status === 'pass' ? 1 : 0);
  const failed = (row?.failed ?? 0) + (stage.status === 'fail' ? 1 : 0);
  await admin.from('simulation_runs').update({
    report: { ...report, stages },
    total_tests: total,
    passed,
    failed,
    current_stage: stage.name,
  }).eq('id', runId);
}

// Stage runners are implemented in the next turn.
async function runAllStages(admin: SupabaseClient, runId: string) {
  await appendStage(admin, runId, {
    stage: 0,
    name: 'Skeleton',
    status: 'skip',
    expected: 'Stages 1–10 to be implemented',
    actual: 'Skeleton only — no tests executed yet. Run again after Turn 2 deploys.',
  });
  await admin.from('simulation_runs').update({
    status: 'completed',
    finished_at: new Date().toISOString(),
    current_stage: 'done',
  }).eq('id', runId);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { user, admin } = await requireAdmin(req);
    const body = await req.json().catch(() => ({}));
    const action = body.action ?? 'start';

    if (action === 'reset') {
      // Use a user-scoped client so the SECURITY DEFINER admin check sees auth.uid()
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
      });
      const { data, error } = await userClient.rpc('admin_purge_simulation_data');
      if (error) throw error;
      return new Response(JSON.stringify({ success: true, purged: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'status') {
      const { data, error } = await admin
        .from('simulation_runs').select('*').eq('id', body.run_id).maybeSingle();
      if (error) throw error;
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'start') {
      // Pre-purge prior test data
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
      });
      await userClient.rpc('admin_purge_simulation_data');

      const { data: run, error } = await admin.from('simulation_runs').insert({
        run_by: user.id,
        status: 'running',
        report: { stages: [] },
      }).select().single();
      if (error) throw error;

      // Background runner
      runAllStages(admin, run.id).catch(async (err) => {
        const msg = err instanceof Error ? err.message : String(err);
        await admin.from('simulation_runs').update({
          status: 'failed',
          finished_at: new Date().toISOString(),
          report: { error: msg },
        }).eq('id', run.id);
      });

      return new Response(JSON.stringify({ run_id: run.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: msg.includes('Admin') || msg.includes('Authentication') ? 403 : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
