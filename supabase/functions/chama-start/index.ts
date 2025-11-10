import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: authHeader ? { Authorization: authHeader } : {},
        },
        auth: {
          persistSession: false,
        },
      }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { chamaId } = await req.json();

    if (!chamaId) {
      return new Response(
        JSON.stringify({ error: 'Chama ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user is manager of this chama
    const { data: membership, error: memberError } = await supabaseClient
      .from('chama_members')
      .select('is_manager, chama_id')
      .eq('chama_id', chamaId)
      .eq('user_id', user.id)
      .eq('is_manager', true)
      .eq('status', 'active')
      .eq('approval_status', 'approved')
      .maybeSingle();

    if (memberError || !membership) {
      return new Response(
        JSON.stringify({ error: 'Only the Chama manager can start the group' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get chama details
    const { data: chama, error: chamaError } = await supabaseClient
      .from('chama')
      .select('*, chama_members!chama_members_chama_id_fkey(id, user_id, order_index, profiles!chama_members_user_id_fkey(full_name, phone))')
      .eq('id', chamaId)
      .single();

    if (chamaError || !chama) {
      return new Response(
        JSON.stringify({ error: 'Chama not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if chama is already active
    if (chama.status === 'active') {
      return new Response(
        JSON.stringify({ error: 'Chama is already active' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update chama status to active
    const { error: updateError } = await supabaseClient
      .from('chama')
      .update({ status: 'active' })
      .eq('id', chamaId);

    if (updateError) {
      throw updateError;
    }

    // Send notifications to all approved members
    const approvedMembers = chama.chama_members?.filter(
      (m: any) => m.approval_status === 'approved'
    ) || [];

    const startDate = new Date();
    const frequencyText = chama.contribution_frequency === 'every_n_days' 
      ? `every ${chama.every_n_days_count} days`
      : chama.contribution_frequency;

    // Calculate payout dates based on order_index
    const cycleLength = getCycleLengthInDays(chama.contribution_frequency, chama.every_n_days_count);
    const totalMembers = approvedMembers.length;

    for (const member of approvedMembers) {
      const daysUntilPayout = (member.order_index - 1) * cycleLength * totalMembers;
      const payoutDate = new Date(startDate);
      payoutDate.setDate(payoutDate.getDate() + daysUntilPayout);

      const message = `Your Chama "${chama.name}" has officially started! You will contribute KES ${chama.contribution_amount.toLocaleString()} ${frequencyText}, starting ${startDate.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}. You are member #${member.order_index}, and your payout date will be ${payoutDate.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}.`;

      // Send SMS notification
      if (member.profiles?.phone) {
        try {
          await supabaseClient.functions.invoke('send-transactional-sms', {
            body: {
              phone: member.profiles.phone,
              message,
              eventType: 'chama_started',
            },
          });
          console.log(`SMS sent to ${member.profiles.full_name}`);
        } catch (smsError) {
          console.error(`Failed to send SMS to ${member.profiles.full_name}:`, smsError);
          // Continue with other notifications even if one fails
        }
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Chama started successfully and members notified',
        notificationsSent: approvedMembers.length 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error starting chama:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to start chama', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function getCycleLengthInDays(frequency: string, everyNDays?: number): number {
  switch (frequency) {
    case 'daily': return 1;
    case 'weekly': return 7;
    case 'monthly': return 30;
    case 'every_n_days': return everyNDays || 7;
    default: return 7;
  }
}
