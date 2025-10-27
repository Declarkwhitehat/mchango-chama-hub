import { createClient } from '@supabase/supabase-js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Simple UUID validator
const isValidUUID = (s?: string | null) => {
  if (!s) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
};

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    // Validate environment variables
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || Deno.env.get('VITE_SUPABASE_URL');
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('VITE_SUPABASE_PUBLISHABLE_KEY');

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.error('member-dashboard: missing SUPABASE_URL or SUPABASE_ANON_KEY');
      return jsonResponse({
        success: false,
        error: 'Server configuration error: missing SUPABASE_URL or SUPABASE_ANON_KEY',
      }, 500);
    }

    // Extract token (optional) — used for authenticated behavior if needed
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : undefined;

    // Create supabase client — include token in headers if present
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      },
    });

    const url = new URL(req.url);
    // Accept either ?chama_id=... or last path segment as id
    const queryChamaId = url.searchParams.get('chama_id');
    const queryMemberId = url.searchParams.get('member_id');

    // also support path like /functions/member-dashboard/<chama_id>
    const pathParts = url.pathname.split('/').filter(Boolean);
    const lastPart = pathParts.length ? pathParts[pathParts.length - 1] : null;

    const chamaId = isValidUUID(queryChamaId) ? queryChamaId : (isValidUUID(lastPart) ? lastPart : null);
    const memberId = isValidUUID(queryMemberId) ? queryMemberId : null;

    if (!chamaId) {
      return jsonResponse({ success: false, error: 'Missing or invalid chama_id. Provide ?chama_id=<uuid> or use path /.../<chama_id>' }, 400);
    }

    // Fetch chama basic info
    const { data: chama, error: chamaErr } = await supabase
      .from('chamas')
      .select('id, name, created_at, contribution_amount, description')
      .eq('id', chamaId)
      .maybeSingle();

    if (chamaErr) {
      console.error('member-dashboard: error fetching chama', { chamaId, error: chamaErr });
      return jsonResponse({ success: false, error: 'Database error fetching chama' }, 500);
    }
    if (!chama) {
      return jsonResponse({ success: false, error: 'Chama not found' }, 404);
    }

    // Members: count and brief info
    const { data: members, error: membersErr } = await supabase
      .from('chama_members')
      .select('id, user_id, joined_at, role, user(full_name, email)')
      .eq('chama_id', chamaId)
      .limit(500); // reasonable cap

    if (membersErr) {
      console.error('member-dashboard: error fetching members', { chamaId, error: membersErr });
      return jsonResponse({ success: false, error: 'Database error fetching members' }, 500);
    }

    const membersCount = Array.isArray(members) ? members.length : 0;

    // Recent contributions (last 20)
    const { data: contributions, error: contribErr } = await supabase
      .from('contributions')
      .select('id, member_id, amount, created_at, note, member:chama_member!inner(user_id)')
      .eq('chama_id', chamaId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (contribErr) {
      console.error('member-dashboard: error fetching contributions', { chamaId, error: contribErr });
      return jsonResponse({ success: false, error: 'Database error fetching contributions' }, 500);
    }

    // Recent withdrawals (last 10)
    const { data: withdrawals, error: withdrawErr } = await supabase
      .from('withdrawals')
      .select('id, member_id, amount, created_at, status, note')
      .eq('chama_id', chamaId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (withdrawErr) {
      console.error('member-dashboard: error fetching withdrawals', { chamaId, error: withdrawErr });
      return jsonResponse({ success: false, error: 'Database error fetching withdrawals' }, 500);
    }

    // Compute basic totals (safely in-memory for limited rows)
    // If you want accurate totals for very large tables consider an RPC or aggregate query.
    let totalContributed = 0;
    if (Array.isArray(contributions)) {
      for (const c of contributions) {
        const amt = typeof c.amount === 'number' ? c.amount : parseFloat(String(c.amount || 0));
        totalContributed += isNaN(amt) ? 0 : amt;
      }
    }

    let totalWithdrawn = 0;
    if (Array.isArray(withdrawals)) {
      for (const w of withdrawals) {
        const amt = typeof w.amount === 'number' ? w.amount : parseFloat(String(w.amount || 0));
        totalWithdrawn += isNaN(amt) ? 0 : amt;
      }
    }

    // Response payload
    const payload = {
      success: true,
      data: {
        chama,
        membersCount,
        members: members || [],
        recentContributions: contributions || [],
        recentWithdrawals: withdrawals || [],
        totals: {
          recentContributed: totalContributed,
          recentWithdrawn: totalWithdrawn,
        },
      },
    };

    return jsonResponse(payload, 200);
  } catch (err) {
    console.error('member-dashboard: unexpected error', err);
    return jsonResponse({ success: false, error: 'Internal server error' }, 500);
  }
}
