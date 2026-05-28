import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '').trim();

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAdmin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    // GET - List cycles for a welfare
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const welfareId = url.searchParams.get('welfare_id');

      if (!welfareId) {
        return new Response(JSON.stringify({ error: 'welfare_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const { data, error } = await supabaseAdmin
        .from('welfare_contribution_cycles')
        .select('*')
        .eq('welfare_id', welfareId)
        .order('start_date', { ascending: false });

      if (error) throw error;
      return new Response(JSON.stringify({ data }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // POST - Executive creates a new cycle
    if (req.method === 'POST') {
      if (!token) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const { data: userData } = await supabaseAdmin.auth.getUser(token);
      if (!userData?.user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const body = await req.json();
      const { welfare_id, amount, start_date, end_date, deadline_days } = body;

      if (!welfare_id || !amount || !start_date || !end_date) {
        return new Response(JSON.stringify({ error: 'welfare_id, amount, start_date, end_date required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (amount <= 0) {
        return new Response(JSON.stringify({ error: 'Amount must be positive' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Verify user is an executive (chairman, secretary, or treasurer)
      const { data: member } = await supabaseAdmin
        .from('welfare_members')
        .select('role')
        .eq('welfare_id', welfare_id)
        .eq('user_id', userData.user.id)
        .eq('status', 'active')
        .single();

      if (!member || !['chairman', 'secretary', 'treasurer'].includes(member.role)) {
        return new Response(JSON.stringify({ error: 'Only executives (Chairman, Secretary, Treasurer) can set contribution cycles' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Check for an active cycle that hasn't expired yet
      const { data: activeCycle } = await supabaseAdmin
        .from('welfare_contribution_cycles')
        .select('id, end_date, amount')
        .eq('welfare_id', welfare_id)
        .eq('status', 'active')
        .gte('end_date', new Date().toISOString().split('T')[0])
        .maybeSingle();

      if (activeCycle) {
        const endDate = new Date(activeCycle.end_date);
        const now = new Date();
        const hoursLeft = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60));
        const daysLeft = Math.ceil(hoursLeft / 24);
        const timeLeft = daysLeft > 0 ? `${daysLeft} day(s)` : `${hoursLeft} hour(s)`;
        return new Response(JSON.stringify({ 
          error: `There is already an active contribution cycle of KES ${activeCycle.amount}. You cannot set a new cycle until the current one expires in ${timeLeft}.` 
        }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Close any expired active cycles (cleanup)
      await supabaseAdmin
        .from('welfare_contribution_cycles')
        .update({ status: 'completed' })
        .eq('welfare_id', welfare_id)
        .eq('status', 'active')
        .lt('end_date', new Date().toISOString().split('T')[0]);

      // Insert new cycle
      const { data, error } = await supabaseAdmin
        .from('welfare_contribution_cycles')
        .insert({
          welfare_id,
          set_by: userData.user.id,
          amount,
          start_date,
          end_date,
          deadline_days: deadline_days || null,
          status: 'active',
        })
        .select()
        .single();

      if (error) throw error;

      // Update welfare contribution amount
      await supabaseAdmin
        .from('welfares')
        .update({ contribution_amount: amount })
        .eq('id', welfare_id);

      // Load welfare for name + paybill account context
      const { data: welfareRow } = await supabaseAdmin
        .from('welfares')
        .select('name')
        .eq('id', welfare_id)
        .single();
      const welfareName = welfareRow?.name || 'Welfare';

      // Notify (in-app + push + SMS) every active confirmed member
      const { data: allMembers } = await supabaseAdmin
        .from('welfare_members')
        .select('user_id, member_code, registration_status, profiles:user_id(phone)')
        .eq('welfare_id', welfare_id)
        .eq('status', 'active');

      const confirmedMembers = (allMembers || []).filter(
        (m: any) => !m.registration_status || m.registration_status === 'confirmed'
      );

      if (confirmedMembers.length > 0) {
        const deadlineStr = end_date;
        const notifications = confirmedMembers.map((m: any) => ({
          user_id: m.user_id,
          title: 'New Contribution Cycle',
          message: `${welfareName}: pay KES ${amount.toLocaleString()} via Paybill 4015351, Acc ${m.member_code}, by ${deadlineStr}.`,
          type: 'info',
          category: 'welfare',
          related_entity_type: 'welfare',
          related_entity_id: welfare_id,
        }));
        await supabaseAdmin.from('notifications').insert(notifications);

        // Fan out SMS + push
        for (const m of confirmedMembers as any[]) {
          const smsBody = `${welfareName}: pay KES ${amount.toLocaleString()} via Paybill 4015351, Acc ${m.member_code}, by ${deadlineStr}.`;
          const phone = m.profiles?.phone;
          if (phone) {
            supabaseAdmin.functions.invoke('send-transactional-sms', {
              body: { phone, message: smsBody, eventType: 'welfare_new_cycle' },
            }).catch((e: unknown) => console.warn('cycle SMS failed:', e));
          }
          supabaseAdmin.functions.invoke('send-push-notification', {
            body: { user_id: m.user_id, title: 'New Contribution Cycle', body: smsBody },
          }).catch(() => {});
        }
      }

      return new Response(JSON.stringify({ data }), { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }


    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    console.error('welfare-cycles error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
