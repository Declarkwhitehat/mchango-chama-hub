import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    // Use explicit JWT to avoid session lookup issues
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);
    if (userError || !user) {
      console.error('Auth failed', userError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify KYC status
    const { data: profile } = await supabase
      .from('profiles')
      .select('kyc_status')
      .eq('id', user.id)
      .single();

    if (profile?.kyc_status !== 'approved') {
      throw new Error('KYC verification required');
    }

    const url = new URL(req.url);
    let pathParts = url.pathname.split('/').filter(Boolean);
    const method = req.method;

    // Normalize pathParts by removing function name prefix
    const functionIndex = pathParts.findIndex(part => part === 'savings-group-members');
    if (functionIndex !== -1) {
      pathParts = pathParts.slice(functionIndex + 1);
    }

    // POST /groups/:groupId/join - Join group
    if (method === 'POST' && pathParts.length === 3 && pathParts[0] === 'groups' && pathParts[2] === 'join') {
      const groupId = pathParts[1];

      // Check if group exists and is active
      const { data: group } = await supabase
        .from('saving_groups')
        .select('*')
        .eq('id', groupId)
        .eq('status', 'active')
        .single();

      if (!group) {
        throw new Error('Group not found or not active');
      }

      // Check if already a member
      const { data: existingMember } = await supabase
        .from('saving_group_members')
        .select('*')
        .eq('group_id', groupId)
        .eq('user_id', user.id)
        .single();

      if (existingMember) {
        throw new Error('Already a member of this group');
      }

      // Check if group is full
      const { count } = await supabase
        .from('saving_group_members')
        .select('*', { count: 'exact', head: true })
        .eq('group_id', groupId)
        .eq('status', 'active');

      if (count && count >= group.max_members) {
        throw new Error('Group is full');
      }

      // Add member with pending approval
      const { data: member, error } = await supabase
        .from('saving_group_members')
        .insert({
          group_id: groupId,
          user_id: user.id,
          status: 'active',
          is_approved: false,
        })
        .select()
        .single();

      if (error) throw error;

      console.log(`User ${user.id} requested to join group ${groupId}`);

      return new Response(
        JSON.stringify({ success: true, message: 'Join request sent. Awaiting manager approval.', member }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // PATCH /groups/:groupId/members/:memberId - Approve/reject member
    if (method === 'PATCH' && pathParts.length === 4 && pathParts[0] === 'groups' && pathParts[2] === 'members') {
      const groupId = pathParts[1];
      const memberId = pathParts[3];

      const body = await req.json();
      const { approved } = body;

      // Verify user is manager
      const { data: group } = await supabase
        .from('saving_groups')
        .select('*')
        .eq('id', groupId)
        .single();

      if (!group || group.manager_id !== user.id) {
        throw new Error('Only the group manager can approve members');
      }

      if (approved) {
        // Get current approved member count to generate next member number
        const { count } = await supabase
          .from('saving_group_members')
          .select('*', { count: 'exact', head: true })
          .eq('group_id', groupId)
          .eq('is_approved', true);

        const nextMemberNumber = (count || 0) + 1;

        // Generate unique member ID using database function
        const { data: uniqueId } = await supabase
          .rpc('generate_unique_member_id', {
            p_group_id: groupId,
            p_member_number: nextMemberNumber
          });

        // Approve member with unique ID
        await supabase
          .from('saving_group_members')
          .update({ 
            is_approved: true,
            unique_member_id: uniqueId
          })
          .eq('id', memberId);

        console.log(`Member ${memberId} approved for group ${groupId} with ID ${uniqueId}`);

        return new Response(
          JSON.stringify({ 
            success: true, 
            message: 'Member approved', 
            unique_member_id: uniqueId 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else {
        // Reject member - remove them
        await supabase
          .from('saving_group_members')
          .delete()
          .eq('id', memberId);

        console.log(`Member ${memberId} rejected for group ${groupId}`);

        return new Response(
          JSON.stringify({ success: true, message: 'Member rejected' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // GET /members/:memberId/dashboard - Member dashboard
    if (method === 'GET' && pathParts.length === 3 && pathParts[0] === 'members' && pathParts[2] === 'dashboard') {
      const memberId = pathParts[1];

      // Get member details
      const { data: member } = await supabase
        .from('saving_group_members')
        .select(`
          *,
          saving_groups!saving_group_members_group_id_fkey(*)
        `)
        .eq('id', memberId)
        .eq('user_id', user.id)
        .single();

      if (!member) {
        throw new Error('Member not found or unauthorized');
      }

      const group = member.saving_groups as any;

      // Get member's deposits
      const { data: deposits } = await supabase
        .from('saving_group_deposits')
        .select('*')
        .eq('member_user_id', user.id)
        .eq('saving_group_id', group.id)
        .order('created_at', { ascending: false });

      // Get member's loans
      const { data: loans } = await supabase
        .from('saving_group_loans')
        .select('*')
        .eq('borrower_user_id', user.id)
        .eq('saving_group_id', group.id)
        .order('requested_at', { ascending: false });

      // Get member's transactions
      const { data: transactions } = await supabase
        .from('saving_group_transactions')
        .select('*')
        .eq('member_id', member.id)
        .order('created_at', { ascending: false })
        .limit(20);

      // Get profit shares if any
      const { data: profitShares } = await supabase
        .from('saving_group_profit_shares')
        .select(`
          *,
          saving_group_profits!saving_group_profit_shares_profit_id_fkey(*)
        `)
        .eq('member_id', member.id);

      // Calculate eligibility for loans
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

      const { data: recentDeposits } = await supabase
        .from('saving_group_deposits')
        .select('created_at, net_amount')
        .eq('member_user_id', user.id)
        .eq('saving_group_id', group.id)
        .gte('created_at', threeMonthsAgo.toISOString());

      // Check if member has saved at least 2000 each month for 3 months
      const monthlyTotals = new Map<string, number>();
      recentDeposits?.forEach(deposit => {
        const monthKey = new Date(deposit.created_at).toISOString().substring(0, 7);
        monthlyTotals.set(monthKey, (monthlyTotals.get(monthKey) || 0) + Number(deposit.net_amount));
      });

      const isLoanEligible = monthlyTotals.size >= 3 && 
        Array.from(monthlyTotals.values()).every(total => total >= 2000);

      // Calculate max loan amount (50% above personal savings, max 30% of group)
      const personalSavings = member.current_savings || 0;
      const maxLoanFromSavings = personalSavings * 1.5;
      const maxLoanFromGroup = (group.total_savings || 0) * 0.30;
      const maxLoanAmount = Math.min(maxLoanFromSavings, maxLoanFromGroup);

      // Calculate active loan balance
      const activeLoan = loans?.find(l => l.status === 'DISBURSED' || l.status === 'APPROVED');

      console.log(`Member dashboard accessed for member ${memberId}`);

      return new Response(
        JSON.stringify({
          success: true,
          member,
          group,
          deposits,
          loans,
          transactions,
          profit_shares: profitShares,
          eligibility: {
            is_loan_eligible: isLoanEligible,
            max_loan_amount: maxLoanAmount,
            has_active_loan: !!activeLoan,
            active_loan_balance: activeLoan?.balance_remaining || 0,
          },
          statistics: {
            personal_savings: personalSavings,
            lifetime_deposits: member.lifetime_deposits || 0,
            total_profit_earned: profitShares?.reduce((sum, ps) => sum + (ps.share_amount || 0), 0) || 0,
            group_total_savings: group.total_savings || 0,
            group_total_profits: group.total_profits || 0,
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    throw new Error('Invalid endpoint');

  } catch (error) {
    console.error('Error:', error);
    const message = error instanceof Error ? error.message : 'An error occurred';
    return new Response(
      JSON.stringify({ error: message }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
