import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { chamaId } = await req.json();
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Notifying cycle completion for chama:', chamaId);

    // Get chama details with members
    const { data: chama, error: chamaError } = await supabase
      .from('chama')
      .select(`
        *,
        chama_members!inner(
          *,
          profiles!inner(*)
        )
      `)
      .eq('id', chamaId)
      .eq('chama_members.status', 'active')
      .eq('chama_members.approval_status', 'approved')
      .single();

    if (chamaError) {
      console.error('Error fetching chama:', chamaError);
      throw chamaError;
    }

    // Get manager info
    const manager = chama.chama_members.find((m: any) => m.is_manager);
    if (!manager) {
      throw new Error('No manager found for chama');
    }

    console.log(`Sending SMS to ${chama.chama_members.length} members`);

    // Send SMS to all members
    const smsPromises = chama.chama_members.map(async (member: any) => {
      const message = `🎉 Great news! Your chama "${chama.name}" has completed its full cycle. All members have received their payouts! Would you like to rejoin for another cycle? Reply to your manager ${manager.profiles.full_name} at ${manager.profiles.phone} or log in to the app. Member ID: ${member.member_code}`;

      try {
        const { error: smsError } = await supabase.functions.invoke('send-transactional-sms', {
          body: {
            phone: member.profiles.phone,
            message,
            eventType: 'cycle_complete'
          }
        });

        if (smsError) {
          console.error(`Failed to send SMS to ${member.profiles.phone}:`, smsError);
          return { success: false, phone: member.profiles.phone, error: smsError };
        }

        return { success: true, phone: member.profiles.phone };
      } catch (error) {
        console.error(`Exception sending SMS to ${member.profiles.phone}:`, error);
        return { success: false, phone: member.profiles.phone, error };
      }
    });

    const smsResults = await Promise.all(smsPromises);
    const successCount = smsResults.filter(r => r.success).length;

    console.log(`Sent ${successCount}/${chama.chama_members.length} SMS notifications`);

    return new Response(
      JSON.stringify({ 
        success: true,
        notificationsSent: successCount,
        totalMembers: chama.chama_members.length,
        results: smsResults
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );
  } catch (error) {
    console.error('Error in cycle completion notification:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to send cycle completion notifications';
    return new Response(
      JSON.stringify({ 
        error: errorMessage
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
