import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    
    if (!authHeader) {
      console.error('No authorization header found');
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
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

    // Extract JWT from header and fetch user explicitly
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);
    
    if (userError) {
      console.error('Auth error:', userError);
      return new Response(
        JSON.stringify({ error: 'Authentication failed', details: userError.message }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }
    
    if (!user) {
      console.error('No user found after auth');
      return new Response(
        JSON.stringify({ error: 'No user found' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
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
    
    // Normalize pathParts by removing function name prefix if present
    if (pathParts[0] === 'savings-group-crud') {
      pathParts = pathParts.slice(1);
    }
    
    console.log('Request:', { method, path: url.pathname, normalizedPathParts: pathParts });

    // GET /groups - List all active groups
    if (method === 'GET' && (pathParts.length === 0 || (pathParts.length === 1 && pathParts[0] === 'groups'))) {
      const { data: groups, error: groupsError } = await supabase
        .from('saving_groups')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (groupsError) throw groupsError;

      // Get member counts for each group
      const groupsWithCounts = await Promise.all(
        (groups || []).map(async (group) => {
          const { count } = await supabase
            .from('saving_group_members')
            .select('*', { count: 'exact', head: true })
            .eq('group_id', group.id)
            .eq('status', 'active');

          return { ...group, member_count: count || 0 };
        })
      );

      console.log(`Listed ${groupsWithCounts.length} active groups for user ${user.id}`);

      return new Response(
        JSON.stringify({ success: true, groups: groupsWithCounts }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // POST /groups - Create group
    if (method === 'POST' && (pathParts.length === 0 || (pathParts.length === 1 && pathParts[0] === 'groups'))) {
      const body = await req.json();
      const { name, saving_goal, max_members, whatsapp_link, description, profile_picture } = body;

      // Safely parse period_months with fallback
      const rawPeriod = body?.period_months ?? body?.period ?? null;
      const parsedPeriod = Number(rawPeriod);
      const period_months = Number.isFinite(parsedPeriod) ? parsedPeriod : 6;

      console.log('Create payload', { rawPeriod, parsedPeriod, period_months, type: typeof rawPeriod });

      // Validation
      if (!name || name.length > 100) {
        throw new Error('Invalid group name');
      }
      if (!saving_goal || saving_goal < 1000) {
        throw new Error('Saving goal must be at least KES 1,000');
      }
      if (!max_members || max_members < 5 || max_members > 500) {
        throw new Error('Max members must be between 5 and 500');
      }
      if (period_months < 6 || period_months > 24) {
        throw new Error('Period must be between 6 and 24 months');
      }

      const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .substring(0, 50);

      const cycleStartDate = new Date();
      const cycleEndDate = new Date(cycleStartDate);
      cycleEndDate.setMonth(cycleEndDate.getMonth() + period_months);

      const { data: group, error } = await supabase
        .from('saving_groups')
        .insert({
          name,
          slug,
          description,
          saving_goal,
          max_members,
          whatsapp_link: whatsapp_link || null,
          profile_picture: profile_picture || null,
          period_months,
          created_by: user.id,
          manager_id: user.id,
          status: 'active',
          cycle_start_date: cycleStartDate.toISOString(),
          cycle_end_date: cycleEndDate.toISOString(),
        })
        .select()
        .single();

      if (error) throw error;

      // Add creator as first member
      await supabase.from('saving_group_members').insert({
        group_id: group.id,
        user_id: user.id,
        status: 'active',
        is_approved: true,
      });

      console.log(`Group created: ${group.id} by user ${user.id}`);

      return new Response(
        JSON.stringify({ success: true, group }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // POST /groups/:groupId/start - Start group
    if (method === 'POST' && pathParts.length === 2 && pathParts[1] === 'start') {
      const groupId = pathParts[0];

      // Verify user is manager
      const { data: group } = await supabase
        .from('saving_groups')
        .select('*')
        .eq('id', groupId)
        .single();

      if (!group || group.manager_id !== user.id) {
        throw new Error('Only the group manager can start the group');
      }

      if (group.started_at) {
        throw new Error('Group already started');
      }

      // Get approved members
      const { data: members } = await supabase
        .from('saving_group_members')
        .select('*, profiles!saving_group_members_user_id_fkey(phone, full_name)')
        .eq('group_id', groupId)
        .eq('is_approved', true)
        .eq('status', 'active');

      if (!members || members.length < 5) {
        throw new Error('At least 5 approved members required to start group');
      }

      // Assign unique member IDs
      const updates = members.map((member, index) => {
        const memberNumber = index + 1;
        const uniqueId = `${group.slug.substring(0, 5).toUpperCase()}-M${String(memberNumber).padStart(4, '0')}`;
        return supabase
          .from('saving_group_members')
          .update({ unique_member_id: uniqueId })
          .eq('id', member.id);
      });

      await Promise.all(updates);

      // Update group status
      await supabase
        .from('saving_groups')
        .update({ started_at: new Date().toISOString() })
        .eq('id', groupId);

      // Send SMS notifications
      const smsPromises = members.map((member) => {
        const profile = member.profiles as any;
        const uniqueId = `${group.slug.substring(0, 5).toUpperCase()}-M${String(members.indexOf(member) + 1).padStart(4, '0')}`;
        const message = `Welcome to ${group.name}! Your Member ID: ${uniqueId}. Goal: KES ${group.saving_goal.toLocaleString()}. Save at least KES 2,000/month. Group starts now!`;
        
        return fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-transactional-sms`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
          },
          body: JSON.stringify({
            phone: profile.phone,
            message,
          }),
        });
      });

      await Promise.all(smsPromises);

      console.log(`Group ${groupId} started with ${members.length} members`);

      return new Response(
        JSON.stringify({ success: true, message: 'Group started successfully', member_count: members.length }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // GET /:groupId/dashboard - Manager dashboard
    if (method === 'GET' && pathParts.length === 2 && pathParts[1] === 'dashboard') {
      const groupId = pathParts[0];
      
      console.log('Manager dashboard request for group:', groupId);

      // Verify user is manager
      const { data: group } = await supabase
        .from('saving_groups')
        .select('*')
        .eq('id', groupId)
        .single();

      if (!group || group.manager_id !== user.id) {
        console.error('Not manager or group not found');
        throw new Error('Only the group manager can access this dashboard');
      }

      // Get all members with their savings
      const { data: members } = await supabase
        .from('saving_group_members')
        .select(`
          *,
          profiles!saving_group_members_user_id_fkey(full_name, phone, email)
        `)
        .eq('group_id', groupId)
        .order('joined_at', { ascending: true });

      // Get active loans
      const { data: loans } = await supabase
        .from('saving_group_loans')
        .select(`
          *,
          saving_group_members!saving_group_loans_borrower_user_id_fkey(
            unique_member_id,
            profiles!saving_group_members_user_id_fkey(full_name)
          )
        `)
        .eq('saving_group_id', groupId)
        .in('status', ['PENDING_APPROVAL', 'APPROVED', 'DISBURSED']);

      // Get recent transactions
      const { data: transactions } = await supabase
        .from('saving_group_transactions')
        .select('*')
        .eq('group_id', groupId)
        .order('created_at', { ascending: false })
        .limit(50);

      // Calculate statistics
      const totalSavings = group.total_savings || 0;
      const totalProfits = group.total_profits || 0;
      const activeLoanAmount = loans?.reduce((sum, loan) => sum + (loan.balance_remaining || 0), 0) || 0;
      const loanPoolAvailable = (totalSavings * 0.30) - activeLoanAmount;

      console.log(`Manager dashboard accessed for group ${groupId}`);

      return new Response(
        JSON.stringify({
          success: true,
          group,
          members,
          loans,
          transactions,
          statistics: {
            total_savings: totalSavings,
            total_profits: totalProfits,
            active_loan_amount: activeLoanAmount,
            loan_pool_available: Math.max(loanPoolAvailable, 0),
            member_count: members?.length || 0,
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // GET /members/:memberId/dashboard - Member dashboard
    if (method === 'GET' && pathParts.length === 3 && pathParts[0] === 'members' && pathParts[2] === 'dashboard') {
      const memberId = pathParts[1];
      
      console.log('Member dashboard request for:', memberId);

      // Verify member exists and belongs to user
      const { data: membership, error: memberError } = await supabase
        .from('saving_group_members')
        .select('*, saving_groups(*)')
        .eq('id', memberId)
        .eq('user_id', user.id)
        .single();

      if (memberError || !membership) {
        console.error('Membership not found:', memberError);
        throw new Error('Membership not found or access denied');
      }

      const groupId = membership.group_id;

      // Get personal statistics
      const personalSavings = membership.current_savings || 0;
      const lifetimeDeposits = membership.lifetime_deposits || 0;

      // Get group statistics
      const { data: group } = await supabase
        .from('saving_groups')
        .select('total_savings, total_profits, saving_goal')
        .eq('id', groupId)
        .single();

      // Get member's loans
      const { data: loans } = await supabase
        .from('saving_group_loans')
        .select('*')
        .eq('borrower_user_id', user.id)
        .eq('saving_group_id', groupId)
        .order('requested_at', { ascending: false });

      // Get member's transactions
      const { data: transactions } = await supabase
        .from('saving_group_transactions')
        .select('*')
        .eq('group_id', groupId)
        .eq('member_id', memberId)
        .order('created_at', { ascending: false })
        .limit(50);

      // Get profit shares
      const { data: profitShares } = await supabase
        .from('saving_group_profit_shares')
        .select(`
          *,
          saving_group_profits(cycle_period)
        `)
        .eq('member_id', memberId)
        .order('created_at', { ascending: false });

      // Check loan eligibility
      const hasActiveLoan = loans?.some(l => 
        l.status === 'DISBURSED' || l.status === 'APPROVED' || l.status === 'PENDING_APPROVAL'
      ) || false;

      const isLoanEligible = membership.is_loan_eligible && !hasActiveLoan;
      const maxLoanAmount = isLoanEligible 
        ? Math.min(personalSavings * 3, (group?.total_savings || 0) * 0.30)
        : 0;

      const totalProfitEarned = profitShares?.reduce((sum, share) => 
        sum + (share.disbursed ? parseFloat(share.share_amount) : 0), 0
      ) || 0;

      // Calculate monthly savings for last 6 months
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const { data: monthlyDeposits } = await supabase
        .from('saving_group_deposits')
        .select('net_amount, created_at')
        .eq('member_user_id', user.id)
        .eq('saving_group_id', groupId)
        .gte('created_at', sixMonthsAgo.toISOString());

      // Group by month and calculate totals
      const monthlyData: any[] = [];
      for (let i = 0; i < 6; i++) {
        const monthDate = new Date();
        monthDate.setMonth(monthDate.getMonth() - i);
        const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
        const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);

        const monthDeposits = monthlyDeposits?.filter((d: any) => {
          const depositDate = new Date(d.created_at);
          return depositDate >= monthStart && depositDate <= monthEnd;
        }) || [];

        const monthTotal = monthDeposits.reduce((sum: number, d: any) => 
          sum + parseFloat(d.net_amount || 0), 0
        );

        const monthName = monthStart.toLocaleString('default', { month: 'long', year: 'numeric' });
        const targetMet = monthTotal >= 2000;

        monthlyData.push({
          month: monthName,
          total: monthTotal,
          target: 2000,
          percentage: (monthTotal / 2000) * 100,
          target_met: targetMet,
        });
      }

      console.log(`Member dashboard accessed for member ${memberId}`);

      return new Response(
        JSON.stringify({
          success: true,
          membership,
          statistics: {
            personal_savings: personalSavings,
            lifetime_deposits: lifetimeDeposits,
            group_total_savings: group?.total_savings || 0,
            group_total_profits: group?.total_profits || 0,
            total_profit_earned: totalProfitEarned,
          },
          eligibility: {
            is_loan_eligible: isLoanEligible,
            has_active_loan: hasActiveLoan,
            max_loan_amount: maxLoanAmount,
          },
          loans: loans || [],
          transactions: transactions || [],
          profit_shares: profitShares || [],
          monthly_savings: monthlyData,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('No matching endpoint for:', { method, pathParts });
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
