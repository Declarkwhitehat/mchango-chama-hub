import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MemberAnalytics {
  member_id: string;
  full_name: string;
  phone: string;
  member_code: string;
  order_index: number;
  missed_payments_count: number;
  late_payments_count: number;
  on_time_payments_count: number;
  on_time_rate: number;
  total_contributed: number;
  expected_contributions: number;
  balance_deficit: number;
  balance_credit: number;
  skip_history: SkipRecord[];
  payout_position: number;
  risk_level: 'low' | 'medium' | 'high';
  first_payment_completed: boolean;
  joined_at: string;
}

interface SkipRecord {
  skipped_at: string;
  reason: string;
  rescheduled_to: number | null;
}

interface NextEligibleMember {
  member_id: string;
  full_name: string;
  phone: string;
  member_code: string;
  order_index: number;
  on_time_rate: number;
  risk_level: 'low' | 'medium' | 'high';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '').trim();
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify admin role
    const { data: adminRole } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', userData.user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!adminRole) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(req.url);
    const memberId = url.searchParams.get('member_id');
    const chamaId = url.searchParams.get('chama_id');
    const withdrawalId = url.searchParams.get('withdrawal_id');

    if (!chamaId) {
      return new Response(JSON.stringify({ error: 'chama_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // If withdrawal_id provided, get the member from the withdrawal
    let targetMemberId = memberId;
    if (withdrawalId && !memberId) {
      const { data: withdrawal } = await supabaseAdmin
        .from('withdrawals')
        .select('requested_by')
        .eq('id', withdrawalId)
        .single();
      
      if (withdrawal) {
        const { data: member } = await supabaseAdmin
          .from('chama_members')
          .select('id')
          .eq('chama_id', chamaId)
          .eq('user_id', withdrawal.requested_by)
          .single();
        
        if (member) {
          targetMemberId = member.id;
        }
      }
    }

    // Function to calculate analytics for a member
    async function getMemberAnalytics(mId: string): Promise<MemberAnalytics | null> {
      // Get member details
      const { data: member, error: memberError } = await supabaseAdmin
        .from('chama_members')
        .select(`
          id,
          member_code,
          order_index,
          missed_payments_count,
          balance_deficit,
          balance_credit,
          total_contributed,
          expected_contributions,
          first_payment_completed,
          joined_at,
          was_skipped,
          skipped_at,
          skip_reason,
          rescheduled_to_position,
          user_id,
          profiles:user_id(full_name, phone)
        `)
        .eq('id', mId)
        .single();

      if (memberError || !member) {
        console.error('Member not found:', mId, memberError);
        return null;
      }

      // Get payment cycle data
      const { data: cyclePayments } = await supabaseAdmin
        .from('member_cycle_payments')
        .select('is_paid, is_late_payment, paid_at')
        .eq('member_id', mId);

      const totalPayments = cyclePayments?.length || 0;
      const onTimePayments = cyclePayments?.filter(p => p.is_paid && !p.is_late_payment).length || 0;
      const latePayments = cyclePayments?.filter(p => p.is_late_payment).length || 0;
      const onTimeRate = totalPayments > 0 ? Math.round((onTimePayments / totalPayments) * 100) : 100;

      // Get skip history from payout_skips table
      const { data: skips } = await supabaseAdmin
        .from('payout_skips')
        .select('created_at, skip_reason, rescheduled_to_position')
        .eq('member_id', mId)
        .order('created_at', { ascending: false });

      const skipHistory: SkipRecord[] = (skips || []).map(s => ({
        skipped_at: s.created_at,
        reason: s.skip_reason || 'Payment issues',
        rescheduled_to: s.rescheduled_to_position
      }));

      // Add current skip if applicable
      if (member.was_skipped && member.skipped_at) {
        skipHistory.unshift({
          skipped_at: member.skipped_at,
          reason: member.skip_reason || 'Payment issues',
          rescheduled_to: member.rescheduled_to_position
        });
      }

      // Calculate risk level
      const missedCount = member.missed_payments_count || 0;
      const deficit = Number(member.balance_deficit) || 0;
      let riskLevel: 'low' | 'medium' | 'high' = 'low';
      
      if (missedCount >= 3 || deficit > 5000 || onTimeRate < 50) {
        riskLevel = 'high';
      } else if (missedCount >= 1 || deficit > 0 || onTimeRate < 80 || latePayments > 2) {
        riskLevel = 'medium';
      }

      const profile = member.profiles as any;

      return {
        member_id: member.id,
        full_name: profile?.full_name || 'Unknown',
        phone: profile?.phone || '',
        member_code: member.member_code,
        order_index: member.order_index || 0,
        missed_payments_count: missedCount,
        late_payments_count: latePayments,
        on_time_payments_count: onTimePayments,
        on_time_rate: onTimeRate,
        total_contributed: Number(member.total_contributed) || 0,
        expected_contributions: Number(member.expected_contributions) || 0,
        balance_deficit: deficit,
        balance_credit: Number(member.balance_credit) || 0,
        skip_history: skipHistory,
        payout_position: member.order_index || 0,
        risk_level: riskLevel,
        first_payment_completed: member.first_payment_completed || false,
        joined_at: member.joined_at
      };
    }

    // Function to find next eligible member
    async function findNextEligibleMember(currentOrderIndex: number): Promise<NextEligibleMember | null> {
      // Get all members after current position
      const { data: nextMembers } = await supabaseAdmin
        .from('chama_members')
        .select(`
          id,
          member_code,
          order_index,
          missed_payments_count,
          balance_deficit,
          first_payment_completed,
          approval_status,
          status,
          user_id,
          profiles:user_id(full_name, phone)
        `)
        .eq('chama_id', chamaId)
        .eq('approval_status', 'approved')
        .eq('status', 'active')
        .eq('first_payment_completed', true)
        .gt('order_index', currentOrderIndex)
        .order('order_index', { ascending: true });

      for (const member of nextMembers || []) {
        const missedCount = member.missed_payments_count || 0;
        const deficit = Number(member.balance_deficit) || 0;

        // Check if member has no payment issues
        if (missedCount === 0 && deficit === 0) {
          // Get on-time rate
          const { data: payments } = await supabaseAdmin
            .from('member_cycle_payments')
            .select('is_paid, is_late_payment')
            .eq('member_id', member.id);

          const totalPayments = payments?.length || 0;
          const onTimePayments = payments?.filter(p => p.is_paid && !p.is_late_payment).length || 0;
          const onTimeRate = totalPayments > 0 ? Math.round((onTimePayments / totalPayments) * 100) : 100;

          let riskLevel: 'low' | 'medium' | 'high' = 'low';
          if (onTimeRate < 80) {
            riskLevel = 'medium';
          }

          const profile = member.profiles as any;

          return {
            member_id: member.id,
            full_name: profile?.full_name || 'Unknown',
            phone: profile?.phone || '',
            member_code: member.member_code,
            order_index: member.order_index || 0,
            on_time_rate: onTimeRate,
            risk_level: riskLevel
          };
        }
      }

      // If no eligible member found after current, wrap around to beginning
      const { data: firstMembers } = await supabaseAdmin
        .from('chama_members')
        .select(`
          id,
          member_code,
          order_index,
          missed_payments_count,
          balance_deficit,
          first_payment_completed,
          approval_status,
          status,
          user_id,
          profiles:user_id(full_name, phone)
        `)
        .eq('chama_id', chamaId)
        .eq('approval_status', 'approved')
        .eq('status', 'active')
        .eq('first_payment_completed', true)
        .lt('order_index', currentOrderIndex)
        .order('order_index', { ascending: true });

      for (const member of firstMembers || []) {
        const missedCount = member.missed_payments_count || 0;
        const deficit = Number(member.balance_deficit) || 0;

        if (missedCount === 0 && deficit === 0) {
          const { data: payments } = await supabaseAdmin
            .from('member_cycle_payments')
            .select('is_paid, is_late_payment')
            .eq('member_id', member.id);

          const totalPayments = payments?.length || 0;
          const onTimePayments = payments?.filter(p => p.is_paid && !p.is_late_payment).length || 0;
          const onTimeRate = totalPayments > 0 ? Math.round((onTimePayments / totalPayments) * 100) : 100;

          let riskLevel: 'low' | 'medium' | 'high' = 'low';
          if (onTimeRate < 80) {
            riskLevel = 'medium';
          }

          const profile = member.profiles as any;

          return {
            member_id: member.id,
            full_name: profile?.full_name || 'Unknown',
            phone: profile?.phone || '',
            member_code: member.member_code,
            order_index: member.order_index || 0,
            on_time_rate: onTimeRate,
            risk_level: riskLevel
          };
        }
      }

      return null;
    }

    // Get member analytics if member_id provided
    let memberAnalytics: MemberAnalytics | null = null;
    if (targetMemberId) {
      memberAnalytics = await getMemberAnalytics(targetMemberId);
    }

    // Get next eligible member
    let nextEligible: NextEligibleMember | null = null;
    if (memberAnalytics) {
      nextEligible = await findNextEligibleMember(memberAnalytics.order_index);
    }

    return new Response(JSON.stringify({
      member_analytics: memberAnalytics,
      next_eligible_member: nextEligible
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error in withdrawal-member-analytics:', error);
    return new Response(JSON.stringify({ error: 'An error occurred' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
