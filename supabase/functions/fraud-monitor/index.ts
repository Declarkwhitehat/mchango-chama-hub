import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
};

function calculateRiskLevel(score: number): string {
  if (score >= 81) return 'critical';
  if (score >= 61) return 'high';
  if (score >= 31) return 'medium';
  return 'low';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { action } = body;

    // ========== RECORD EVENT (called by other edge functions) ==========
    if (action === 'record-event') {
      const { user_id, rule_triggered, risk_points, ip_address, device_info, transaction_id, metadata } = body;

      if (!user_id || !rule_triggered) {
        return new Response(JSON.stringify({ error: 'user_id and rule_triggered required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get or create risk profile
      let { data: riskProfile } = await supabase
        .from('user_risk_profiles')
        .select('*')
        .eq('user_id', user_id)
        .maybeSingle();

      let currentScore = riskProfile?.risk_score || 0;

      // Apply score decay: -5 per week of clean activity
      if (riskProfile?.last_risk_update) {
        const lastUpdate = new Date(riskProfile.last_risk_update);
        const weeksSinceUpdate = Math.floor((Date.now() - lastUpdate.getTime()) / (7 * 24 * 60 * 60 * 1000));
        if (weeksSinceUpdate > 0) {
          currentScore = Math.max(0, currentScore - (weeksSinceUpdate * 5));
        }
      }

      const newScore = Math.min(100, currentScore + (risk_points || 0));
      const newLevel = calculateRiskLevel(newScore);
      const isCritical = newScore >= 81;

      // Insert fraud event
      await supabase.from('fraud_events').insert({
        user_id,
        transaction_id: transaction_id || null,
        rule_triggered,
        risk_points_added: risk_points || 0,
        total_risk_score: newScore,
        ip_address: ip_address || null,
        device_info: device_info || null,
        metadata: metadata || null,
      });

      // Upsert risk profile
      if (riskProfile) {
        await supabase.from('user_risk_profiles').update({
          risk_score: newScore,
          risk_level: newLevel,
          is_flagged: isCritical ? true : riskProfile.is_flagged,
          last_risk_update: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('user_id', user_id);
      } else {
        await supabase.from('user_risk_profiles').insert({
          user_id,
          risk_score: newScore,
          risk_level: newLevel,
          is_flagged: isCritical,
          last_risk_update: new Date().toISOString(),
        });
      }

      return new Response(JSON.stringify({ success: true, risk_score: newScore, risk_level: newLevel }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ========== ADMIN ACTIONS (require admin auth) ==========
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check admin role
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userData.user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ========== GET FLAGGED USERS ==========
    if (action === 'get-flagged-users') {
      const { risk_level, search, page = 0, page_size = 20 } = body;

      let query = supabase
        .from('user_risk_profiles')
        .select('*, profiles:user_id(full_name, phone, email)', { count: 'exact' })
        .order('risk_score', { ascending: false })
        .range(page * page_size, (page + 1) * page_size - 1);

      if (risk_level && risk_level !== 'all') {
        query = query.eq('risk_level', risk_level);
      }

      const { data, count, error } = await query;
      if (error) throw error;

      // Filter by search if provided
      let filtered = data || [];
      if (search) {
        const s = search.toLowerCase();
        filtered = filtered.filter((r: any) => {
          const p = r.profiles;
          return p?.full_name?.toLowerCase().includes(s) ||
            p?.phone?.includes(s) ||
            p?.email?.toLowerCase().includes(s) ||
            r.user_id?.includes(s);
        });
      }

      return new Response(JSON.stringify({ data: filtered, total: count }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ========== GET USER RISK ==========
    if (action === 'get-user-risk') {
      const { user_id } = body;
      const { data } = await supabase
        .from('user_risk_profiles')
        .select('*, profiles:user_id(full_name, phone, email)')
        .eq('user_id', user_id)
        .maybeSingle();

      return new Response(JSON.stringify({ data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ========== GET FRAUD EVENTS ==========
    if (action === 'get-fraud-events') {
      const { user_id, rule_triggered, start_date, end_date, page = 0, page_size = 50 } = body;

      let query = supabase
        .from('fraud_events')
        .select('*, profiles:user_id(full_name, phone)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * page_size, (page + 1) * page_size - 1);

      if (user_id) query = query.eq('user_id', user_id);
      if (rule_triggered) query = query.eq('rule_triggered', rule_triggered);
      if (start_date) query = query.gte('created_at', start_date);
      if (end_date) query = query.lte('created_at', end_date);

      const { data, count, error } = await query;
      if (error) throw error;

      return new Response(JSON.stringify({ data, total: count }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ========== ADMIN ACTION ==========
    if (action === 'admin-action') {
      const { user_id, admin_action } = body;
      // admin_action: under_review, cleared, frozen, escalated, unfrozen

      if (!user_id || !admin_action) {
        return new Response(JSON.stringify({ error: 'user_id and admin_action required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const updateData: any = {
        review_status: admin_action === 'frozen' || admin_action === 'unfrozen' ? undefined : admin_action,
        reviewed_by: userData.user.id,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (admin_action === 'frozen') {
        updateData.is_frozen = true;
        updateData.frozen_at = new Date().toISOString();
        updateData.frozen_by = userData.user.id;
        updateData.review_status = 'under_review';
      } else if (admin_action === 'unfrozen') {
        updateData.is_frozen = false;
        updateData.frozen_at = null;
        updateData.frozen_by = null;
      } else if (admin_action === 'cleared') {
        updateData.is_flagged = false;
        updateData.risk_score = 0;
        updateData.risk_level = 'low';
      }

      // Remove undefined keys
      Object.keys(updateData).forEach(k => updateData[k] === undefined && delete updateData[k]);

      await supabase.from('user_risk_profiles').update(updateData).eq('user_id', user_id);

      // Log in audit_logs
      await supabase.from('audit_logs').insert({
        user_id: userData.user.id,
        table_name: 'user_risk_profiles',
        action: `fraud_${admin_action}`,
        record_id: user_id,
        new_values: { admin_action, target_user: user_id },
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ========== GET CONFIG ==========
    if (action === 'get-config') {
      const { data, error } = await supabase.from('fraud_config').select('*').order('rule_key');
      if (error) throw error;
      return new Response(JSON.stringify({ data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ========== UPDATE CONFIG ==========
    if (action === 'update-config') {
      const { rule_key, rule_value } = body;
      if (!rule_key || rule_value === undefined) {
        return new Response(JSON.stringify({ error: 'rule_key and rule_value required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get old value for audit
      const { data: oldConfig } = await supabase.from('fraud_config').select('rule_value').eq('rule_key', rule_key).single();

      await supabase.from('fraud_config').update({
        rule_value: { value: rule_value },
        updated_by: userData.user.id,
        updated_at: new Date().toISOString(),
      }).eq('rule_key', rule_key);

      // Audit log
      await supabase.from('audit_logs').insert({
        user_id: userData.user.id,
        table_name: 'fraud_config',
        action: 'UPDATE',
        new_values: { rule_key, new_value: rule_value, old_value: oldConfig?.rule_value },
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ========== GET STATS ==========
    if (action === 'get-stats') {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const [flaggedRes, criticalRes, frozenRes, todayEventsRes] = await Promise.all([
        supabase.from('user_risk_profiles').select('id', { count: 'exact', head: true }).eq('is_flagged', true),
        supabase.from('user_risk_profiles').select('id', { count: 'exact', head: true }).eq('risk_level', 'critical'),
        supabase.from('user_risk_profiles').select('id', { count: 'exact', head: true }).eq('is_frozen', true),
        supabase.from('fraud_events').select('id', { count: 'exact', head: true }).gte('created_at', todayStart.toISOString()),
      ]);

      return new Response(JSON.stringify({
        flagged: flaggedRes.count || 0,
        critical: criticalRes.count || 0,
        frozen: frozenRes.count || 0,
        events_today: todayEventsRes.count || 0,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Fraud monitor error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
