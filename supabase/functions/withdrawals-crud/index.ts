import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(req.url);
    const withdrawalId = url.pathname.split('/').pop();

    // POST / - Create withdrawal request
    if (req.method === 'POST' && !withdrawalId) {
      const body = await req.json();
      const { chama_id, mchango_id, amount, notes } = body;

      console.log('Creating withdrawal request:', body);

      // Verify creator ownership
      let isCreator = false;
      let isManager = false;
      let totalAvailable = 0;
      let commissionRate = 0.05;

      if (chama_id) {
        const { data: chama, error: chamaError } = await supabaseClient
          .from('chama')
          .select('created_by, commission_rate')
          .eq('id', chama_id)
          .single();

        if (chamaError || !chama) {
          return new Response(JSON.stringify({ error: 'Chama not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        isCreator = chama.created_by === user.id;
        commissionRate = chama.commission_rate || 0.05;

        // Check if user is a manager
        const { data: membership } = await supabaseClient
          .from('chama_members')
          .select('is_manager, id, order_index')
          .eq('chama_id', chama_id)
          .eq('user_id', user.id)
          .eq('approval_status', 'approved')
          .maybeSingle();

        isManager = membership?.is_manager || false;

        // If not a manager, check if it's their turn
        if (!isManager) {
          // Get all approved members
          const { data: members } = await supabaseClient
            .from('chama_members')
            .select('id, order_index')
            .eq('chama_id', chama_id)
            .eq('approval_status', 'approved')
            .order('order_index', { ascending: true });

          if (members && members.length > 0) {
            // Get completed withdrawals
            const { data: completedWithdrawals } = await supabaseClient
              .from('withdrawals')
              .select('id')
              .eq('chama_id', chama_id)
              .eq('status', 'completed')
              .order('completed_at', { ascending: true });

            const withdrawalCount = completedWithdrawals?.length || 0;
            const currentTurnIndex = withdrawalCount % members.length;
            const currentTurnMember = members[currentTurnIndex];

            if (membership && membership.id !== currentTurnMember.id) {
              return new Response(JSON.stringify({ 
                error: 'It is not your turn to withdraw. Please wait for your turn or contact the manager.',
                current_turn_member_id: currentTurnMember.id
              }), {
                status: 403,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            }
          }
        }

        // Calculate available balance from contributions
        const { data: contributions } = await supabaseClient
          .from('contributions')
          .select('amount')
          .eq('chama_id', chama_id)
          .eq('status', 'completed');

        totalAvailable = contributions?.reduce((sum, c) => sum + Number(c.amount), 0) || 0;

      } else if (mchango_id) {
        const { data: mchango, error: mchangoError } = await supabaseClient
          .from('mchango')
          .select('created_by, current_amount')
          .eq('id', mchango_id)
          .single();

        if (mchangoError || !mchango) {
          return new Response(JSON.stringify({ error: 'Mchango not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        isCreator = mchango.created_by === user.id;
        commissionRate = 0.05;
        totalAvailable = Number(mchango.current_amount);
      }

      if (!isCreator && !isManager) {
        return new Response(JSON.stringify({ error: 'Only creators or managers can request withdrawals' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check for pending withdrawals
      const { data: pendingWithdrawals } = await supabaseClient
        .from('withdrawals')
        .select('id')
        .or(`chama_id.eq.${chama_id},mchango_id.eq.${mchango_id}`)
        .eq('status', 'pending')
        .maybeSingle();

      if (pendingWithdrawals) {
        return new Response(JSON.stringify({ error: 'There is already a pending withdrawal request' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (amount > totalAvailable) {
        return new Response(JSON.stringify({ 
          error: 'Insufficient funds',
          available: totalAvailable 
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Calculate commission and net amount
      const commissionAmount = amount * commissionRate;
      const netAmount = amount - commissionAmount;

      // Create withdrawal request
      const { data: withdrawal, error } = await supabaseClient
        .from('withdrawals')
        .insert({
          chama_id,
          mchango_id,
          requested_by: user.id,
          amount,
          commission_amount: commissionAmount,
          net_amount: netAmount,
          status: 'pending',
          notes,
        })
        .select()
        .single();

      if (error) throw error;

      console.log('Withdrawal request created:', withdrawal);

      return new Response(JSON.stringify({ data: withdrawal }), {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // GET / - List withdrawals
    if (req.method === 'GET' && !withdrawalId) {
      const chamaId = url.searchParams.get('chama_id');
      const mchangoId = url.searchParams.get('mchango_id');

      let query = supabaseClient
        .from('withdrawals')
        .select(`
          *,
          requester:requested_by(full_name, email),
          reviewer:reviewed_by(full_name, email)
        `)
        .order('created_at', { ascending: false });

      if (chamaId) {
        query = query.eq('chama_id', chamaId);
      } else if (mchangoId) {
        query = query.eq('mchango_id', mchangoId);
      }

      const { data, error } = await query;

      if (error) throw error;

      return new Response(JSON.stringify({ data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // PATCH /:id - Admin approval/rejection
    if (req.method === 'PATCH' && withdrawalId) {
      const body = await req.json();
      const { status, rejection_reason, payment_reference } = body;

      console.log('Updating withdrawal status:', { withdrawalId, status });

      // Verify admin role
      const { data: adminRole } = await supabaseClient
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .maybeSingle();

      if (!adminRole) {
        return new Response(JSON.stringify({ error: 'Admin access required' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: withdrawal, error } = await supabaseClient
        .from('withdrawals')
        .update({
          status,
          reviewed_at: new Date().toISOString(),
          reviewed_by: user.id,
          rejection_reason: status === 'rejected' ? rejection_reason : null,
          payment_reference: status === 'completed' ? payment_reference : null,
        })
        .eq('id', withdrawalId)
        .select()
        .single();

      if (error) throw error;

      console.log('Withdrawal updated:', withdrawal);

      return new Response(JSON.stringify({ data: withdrawal }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error in withdrawals-crud:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});