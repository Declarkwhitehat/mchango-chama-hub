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
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const method = req.method;

    // POST /groups/:groupId/calculate-profits - Calculate profits
    if (method === 'POST' && pathParts.length === 2 && pathParts[1] === 'calculate-profits') {
      const groupId = pathParts[0];

      // Verify user is manager
      const { data: group } = await supabase
        .from('saving_groups')
        .select('*')
        .eq('id', groupId)
        .single();

      if (!group || group.manager_id !== user.id) {
        throw new Error('Only the group manager can calculate profits');
      }

      // Check if cycle has ended
      const now = new Date();
      const cycleEndDate = new Date(group.cycle_end_date);

      if (now < cycleEndDate) {
        throw new Error('Cycle has not ended yet. Profits can only be calculated at cycle end.');
      }

      // Get current cycle period
      const cyclePeriod = now.toISOString().substring(0, 7);

      // Check if profits already calculated for this period
      const { data: existingProfit } = await supabase
        .from('saving_group_profits')
        .select('*')
        .eq('group_id', groupId)
        .eq('cycle_period', cyclePeriod)
        .maybeSingle();

      if (existingProfit) {
        throw new Error('Profits already calculated for this period');
      }

      const totalProfit = group.total_profits || 0;

      // Create profit record
      const { data: profit, error: profitError } = await supabase
        .from('saving_group_profits')
        .insert({
          group_id: groupId,
          cycle_period: cyclePeriod,
          total_profit: totalProfit,
          distributed: false,
        })
        .select()
        .single();

      if (profitError) throw profitError;

      // Get all active members (exclude defaulters)
      const { data: members } = await supabase
        .from('saving_group_members')
        .select('*')
        .eq('group_id', groupId)
        .eq('status', 'active')
        .eq('is_approved', true);

      if (!members || members.length === 0) {
        throw new Error('No active members found');
      }

      // Calculate total savings from all members
      const totalSavings = members.reduce((sum, m) => sum + (m.current_savings || 0), 0);

      if (totalSavings === 0) {
        throw new Error('No savings to distribute profits');
      }

      // Calculate profit share for each member based on their savings ratio
      const profitShares = members.map(member => {
        const savingsRatio = (member.current_savings || 0) / totalSavings;
        const shareAmount = totalProfit * savingsRatio;

        return {
          profit_id: profit.id,
          member_id: member.id,
          share_amount: shareAmount,
          savings_ratio: savingsRatio,
        };
      });

      // Insert profit shares
      const { error: sharesError } = await supabase
        .from('saving_group_profit_shares')
        .insert(profitShares);

      if (sharesError) throw sharesError;

      console.log(`Profits calculated for group ${groupId}. Total: KES ${totalProfit}, Members: ${members.length}`);

      return new Response(
        JSON.stringify({
          success: true,
          profit,
          profit_shares: profitShares,
          total_profit: totalProfit,
          member_count: members.length,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // POST /groups/:groupId/distribute-profits - Distribute profits
    if (method === 'POST' && pathParts.length === 2 && pathParts[1] === 'distribute-profits') {
      const groupId = pathParts[0];

      // Verify user is manager
      const { data: group } = await supabase
        .from('saving_groups')
        .select('*')
        .eq('id', groupId)
        .single();

      if (!group || group.manager_id !== user.id) {
        throw new Error('Only the group manager can distribute profits');
      }

      // Get latest undistributed profit
      const { data: profit } = await supabase
        .from('saving_group_profits')
        .select('*')
        .eq('group_id', groupId)
        .eq('distributed', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!profit) {
        throw new Error('No undistributed profits found. Calculate profits first.');
      }

      // Get profit shares
      const { data: profitShares } = await supabase
        .from('saving_group_profit_shares')
        .select(`
          *,
          saving_group_members!saving_group_profit_shares_member_id_fkey(
            user_id,
            current_savings,
            profiles!saving_group_members_user_id_fkey(full_name, phone)
          )
        `)
        .eq('profit_id', profit.id);

      if (!profitShares || profitShares.length === 0) {
        throw new Error('No profit shares found');
      }

      // Mark all shares as disbursed
      const now = new Date().toISOString();
      const updatePromises = profitShares.map(share =>
        supabase
          .from('saving_group_profit_shares')
          .update({
            disbursed: true,
            disbursed_at: now,
          })
          .eq('id', share.id)
      );

      await Promise.all(updatePromises);

      // Mark profit as distributed
      await supabase
        .from('saving_group_profits')
        .update({
          distributed: true,
          distribution_date: now,
        })
        .eq('id', profit.id);

      // Check if this is final distribution (cycle ended)
      const cycleEndDate = new Date(group.cycle_end_date);
      const isAfterCycleEnd = new Date() >= cycleEndDate;

      if (isAfterCycleEnd) {
        // Mark group as CLOSED
        await supabase
          .from('saving_groups')
          .update({ status: 'closed' })
          .eq('id', groupId);
      }

      // Record transactions for each member
      const transactionPromises = profitShares.map(share =>
        supabase
          .from('saving_group_transactions')
          .insert({
            group_id: groupId,
            member_id: share.member_id,
            transaction_type: 'PROFIT_DISTRIBUTION',
            amount: share.share_amount,
            reference_id: profit.id,
            notes: `Profit distribution for cycle ${profit.cycle_period}`,
          })
      );

      await Promise.all(transactionPromises);

      // Send SMS notifications to all members
      const smsPromises = profitShares.map(share => {
        const member = share.saving_group_members as any;
        const profile = member.profiles;
        
        if (profile?.phone) {
          const totalPayout = member.current_savings + share.share_amount;
          const message = `${group.name} cycle ended! Your profit share: KES ${share.share_amount.toLocaleString()}. Total payout: KES ${totalPayout.toLocaleString()} (Savings: KES ${member.current_savings.toLocaleString()} + Profit: KES ${share.share_amount.toLocaleString()})`;
          
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
        }
        return Promise.resolve();
      });

      await Promise.all(smsPromises);

      console.log(`Profits distributed for group ${groupId}. Total: KES ${profit.total_profit}, Members: ${profitShares.length}`);

      return new Response(
        JSON.stringify({
          success: true,
          distributed: true,
          total_profit: profit.total_profit,
          member_count: profitShares.length,
          profit_shares: profitShares.map(ps => {
            const member = ps.saving_group_members as any;
            return {
              member_name: member.profiles.full_name,
              savings: member.current_savings,
              profit_share: ps.share_amount,
              total_payout: member.current_savings + ps.share_amount,
              savings_ratio: ps.savings_ratio,
            };
          }),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // GET /groups/:groupId/distribution - View distribution details
    if (method === 'GET' && pathParts.length === 2 && pathParts[1] === 'distribution') {
      const groupId = pathParts[0];

      // Verify user is a member
      const { data: member } = await supabase
        .from('saving_group_members')
        .select('*')
        .eq('group_id', groupId)
        .eq('user_id', user.id)
        .single();

      if (!member) {
        throw new Error('Not a member of this group');
      }

      // Get group details
      const { data: group } = await supabase
        .from('saving_groups')
        .select('*')
        .eq('id', groupId)
        .single();

      // Get latest profit
      const { data: profit } = await supabase
        .from('saving_group_profits')
        .select('*')
        .eq('group_id', groupId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!profit) {
        return new Response(
          JSON.stringify({
            success: true,
            has_distribution: false,
            message: 'No profit distribution yet',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get all profit shares
      const { data: profitShares } = await supabase
        .from('saving_group_profit_shares')
        .select(`
          *,
          saving_group_members!saving_group_profit_shares_member_id_fkey(
            user_id,
            current_savings,
            unique_member_id,
            profiles!saving_group_members_user_id_fkey(full_name)
          )
        `)
        .eq('profit_id', profit.id);

      const distribution = profitShares?.map(ps => {
        const member = ps.saving_group_members as any;
        return {
          member_id: member.unique_member_id,
          member_name: member.profiles.full_name,
          savings: member.current_savings,
          profit_share: ps.share_amount,
          total_payout: member.current_savings + ps.share_amount,
          savings_ratio: (ps.savings_ratio * 100).toFixed(2) + '%',
        };
      });

      console.log(`Distribution details viewed for group ${groupId}`);

      return new Response(
        JSON.stringify({
          success: true,
          has_distribution: true,
          group: {
            name: group.name,
            total_savings: group.total_savings,
            total_profits: profit.total_profit,
          },
          profit: {
            cycle_period: profit.cycle_period,
            total_profit: profit.total_profit,
            distributed: profit.distributed,
            distribution_date: profit.distribution_date,
          },
          distribution,
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
