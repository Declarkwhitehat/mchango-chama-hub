import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    console.log('Running chama auto-cleanup check...');

    // Find chamas with cycle_complete status where last_cycle_completed_at > 24 hours ago
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: completedChamas, error: fetchError } = await supabase
      .from('chama')
      .select('id, name, last_cycle_completed_at, group_code')
      .eq('status', 'cycle_complete')
      .lt('last_cycle_completed_at', twentyFourHoursAgo);

    if (fetchError) throw fetchError;

    if (!completedChamas || completedChamas.length === 0) {
      console.log('No chamas eligible for auto-cleanup');
      return new Response(JSON.stringify({ message: 'No chamas to clean up', processed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    let deletedCount = 0;

    for (const chama of completedChamas) {
      console.log(`Checking chama "${chama.name}" (${chama.id}) for cleanup...`);

      // Get total members from last cycle history, fallback to counting chama_members
      const { data: cycleHistory } = await supabase
        .from('chama_cycle_history')
        .select('total_members')
        .eq('chama_id', chama.id)
        .order('cycle_round', { ascending: false })
        .limit(1)
        .maybeSingle();

      let totalMembers = cycleHistory?.total_members || 0;

      // Fallback: count all members (active + removed) if no cycle history exists
      if (totalMembers === 0) {
        const { count: memberCount } = await supabase
          .from('chama_members')
          .select('id', { count: 'exact', head: true })
          .eq('chama_id', chama.id)
          .eq('approval_status', 'approved');

        totalMembers = memberCount || 0;
        console.log(`No cycle history for chama "${chama.name}", using member count: ${totalMembers}`);
      }

      if (totalMembers === 0) {
        console.log(`Chama "${chama.name}" has no members at all, marking for deletion`);
        totalMembers = 1; // Force deletion for empty chamas
      }

      // Count rejoin requests (pending + approved)
      const { count: rejoinCount } = await supabase
        .from('chama_rejoin_requests')
        .select('id', { count: 'exact', head: true })
        .eq('chama_id', chama.id)
        .in('status', ['pending', 'approved']);

      const threshold = Math.ceil(totalMembers * 0.4);
      const actualRejoins = rejoinCount || 0;

      console.log(`Chama "${chama.name}": ${actualRejoins}/${totalMembers} rejoins (need ${threshold} = 40%)`);

      if (actualRejoins < threshold) {
        console.log(`Deleting chama "${chama.name}" - below 40% threshold`);

        // Get all member phones for notification
        const { data: members } = await supabase
          .from('chama_members')
          .select('user_id, profiles!chama_members_user_id_fkey(phone, full_name)')
          .eq('chama_id', chama.id);

        // Set chama status to deleted
        await supabase
          .from('chama')
          .update({ status: 'deleted', updated_at: new Date().toISOString() })
          .eq('id', chama.id);

        // Delete all pending rejoin requests
        await supabase
          .from('chama_rejoin_requests')
          .delete()
          .eq('chama_id', chama.id);

        // Send SMS to all members
        if (members) {
          const smsPromises = members.map(async (member) => {
            const phone = (member.profiles as any)?.phone;
            if (!phone) return;

            const message = `❌ Chama "${chama.name}" did not meet the minimum 40% participation requirement (${actualRejoins}/${totalMembers} members rejoined). The chama has been closed. You can join another existing chama or create a new one.`;

            try {
              await supabase.functions.invoke('send-transactional-sms', {
                body: { phone, message, eventType: 'chama_auto_deleted' }
              });
            } catch (err) {
              console.error(`Failed to send SMS to ${phone}:`, err);
            }
          });

          await Promise.all(smsPromises);
        }

        deletedCount++;
      }
    }

    console.log(`Auto-cleanup complete. Deleted ${deletedCount} chamas.`);

    return new Response(JSON.stringify({ 
      message: 'Auto-cleanup complete', 
      checked: completedChamas.length,
      deleted: deletedCount 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error in chama-auto-cleanup:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
