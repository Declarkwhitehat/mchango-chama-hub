import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function getCycleLengthInDays(frequency: string, everyNDays?: number): number {
  switch (frequency) {
    case 'daily':
      return 1;
    case 'weekly':
      return 7;
    case 'monthly':
      return 30;
    case 'every_n_days':
      return everyNDays || 7;
    default:
      return 7;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  // Get user from auth header
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  
  if (userError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const { chamaId } = await req.json();

    console.log('Starting new cycle for chama:', chamaId);

    // Get chama details
    const { data: chama, error: chamaError } = await supabase
      .from('chama')
      .select('*')
      .eq('id', chamaId)
      .single();

    if (chamaError) throw chamaError;

    // Verify user is manager
    const { data: membership } = await supabase
      .from('chama_members')
      .select('is_manager')
      .eq('chama_id', chamaId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    if (!membership?.is_manager) {
      return new Response(
        JSON.stringify({ error: 'Only managers can start new cycles' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get all approved rejoin requests with profiles
    const { data: approvedRequests, error: requestsError } = await supabase
      .from('chama_rejoin_requests')
      .select('*, profiles!chama_rejoin_requests_user_id_fkey(*)')
      .eq('chama_id', chamaId)
      .eq('status', 'approved');

    if (requestsError) throw requestsError;

    if (!approvedRequests || approvedRequests.length < (chama.min_members || 2)) {
      return new Response(
        JSON.stringify({ 
          error: `Need at least ${chama.min_members || 2} approved members to start new cycle. Currently have ${approvedRequests?.length || 0}` 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Creating new cycle with ${approvedRequests.length} members`);

    // Archive old members
    const { error: archiveError } = await supabase
      .from('chama_members')
      .update({ status: 'inactive' })
      .eq('chama_id', chamaId)
      .eq('status', 'active');

    if (archiveError) throw archiveError;

    // Find manager ID
    const managerId = approvedRequests.find(req => {
      // Check if this user was previously a manager
      return req.previous_member_id;
    })?.user_id || user.id;

    // Create random order indices
    const memberCount = approvedRequests.length;
    const randomIndices = shuffleArray([...Array(memberCount)].map((_, i) => i + 1));

    // Ensure manager gets first position
    const managerRequestIndex = approvedRequests.findIndex(req => req.user_id === managerId);
    if (managerRequestIndex !== -1) {
      const managerIndexPosition = randomIndices.indexOf(1);
      [randomIndices[0], randomIndices[managerIndexPosition]] = [randomIndices[managerIndexPosition], randomIndices[0]];
    }

    // Create new member records
    const newMembers = approvedRequests.map((req, idx) => ({
      chama_id: chamaId,
      user_id: req.user_id,
      order_index: randomIndices[idx],
      is_manager: req.user_id === managerId,
      status: 'active',
      approval_status: 'approved',
      member_code: `${chama.group_code}${randomIndices[idx]}`
    }));

    const { data: insertedMembers, error: insertError } = await supabase
      .from('chama_members')
      .insert(newMembers)
      .select('*, profiles!chama_members_user_id_fkey(*)');

    if (insertError) throw insertError;

    // Update chama
    const { error: updateError } = await supabase
      .from('chama')
      .update({
        current_cycle_round: (chama.current_cycle_round || 1) + 1,
        accepting_rejoin_requests: false,
        status: 'active',
        updated_at: new Date().toISOString()
      })
      .eq('id', chamaId);

    if (updateError) throw updateError;

    // Mark rejoin requests as processed
    const { error: requestUpdateError } = await supabase
      .from('chama_rejoin_requests')
      .delete()
      .eq('chama_id', chamaId)
      .eq('status', 'approved');

    if (requestUpdateError) console.error('Error cleaning up requests:', requestUpdateError);

    // Calculate payout dates and send SMS
    const cycleLength = getCycleLengthInDays(chama.contribution_frequency, chama.every_n_days_count);
    
    const smsPromises = insertedMembers
      .sort((a, b) => a.order_index - b.order_index)
      .map(async (member) => {
        const payoutDate = new Date();
        payoutDate.setDate(payoutDate.getDate() + (member.order_index - 1) * cycleLength);

        const message = `🔄 New cycle started for "${chama.name}"! You're member #${member.order_index}. Your payout date: ${payoutDate.toLocaleDateString()}. Contributions start now. Good luck! 🎯`;

        try {
          await supabase.functions.invoke('send-transactional-sms', {
            body: {
              phone: member.profiles.phone,
              message,
              eventType: 'new_cycle_started'
            }
          });
          return { success: true, phone: member.profiles.phone };
        } catch (error) {
          console.error(`Failed to send SMS to ${member.profiles.phone}:`, error);
          return { success: false, phone: member.profiles.phone, error };
        }
      });

    const smsResults = await Promise.all(smsPromises);
    const successCount = smsResults.filter(r => r.success).length;

    console.log(`New cycle started. Sent ${successCount}/${insertedMembers.length} SMS notifications`);

    return new Response(
      JSON.stringify({ 
        success: true,
        memberCount: insertedMembers.length,
        cycleRound: (chama.current_cycle_round || 1) + 1,
        notificationsSent: successCount
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error starting new cycle:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
