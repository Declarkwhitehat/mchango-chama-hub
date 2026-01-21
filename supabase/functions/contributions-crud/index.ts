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
    // Validate Authorization header upfront
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ 
        error: 'Missing authorization header',
        code: 'AUTH_REQUIRED' 
      }), {
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

    // Verify authentication for all requests
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ 
        error: 'Invalid or expired token',
        code: 'AUTH_INVALID',
        details: authError?.message 
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('contributions-crud request', { 
      method: req.method,
      userId: user.id,
      timestamp: new Date().toISOString()
    });

    const url = new URL(req.url);
    const chamaId = url.searchParams.get('chama_id');

    // GET /contributions-crud?chama_id=xxx - List contributions for a chama
    if (req.method === 'GET') {
      if (!chamaId) {
        return new Response(JSON.stringify({ error: 'chama_id is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data, error } = await supabaseClient
        .from('contributions')
        .select(`
          *,
          chama_members!contributions_member_id_fkey (
            member_code,
            profiles (
              full_name,
              email
            )
          ),
          paid_by:chama_members!contributions_paid_by_member_id_fkey (
            member_code,
            profiles (
              full_name,
              email
            )
          )
        `)
        .eq('chama_id', chamaId)
        .order('contribution_date', { ascending: false });

      if (error) throw error;

      return new Response(JSON.stringify({ data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST /contributions-crud - Create new contribution
    if (req.method === 'POST') {
      const body = await req.json();

      console.log('Creating contribution:', body);
      
      // Verify KYC status
      const { data: profile } = await supabaseClient
        .from('profiles')
        .select('kyc_status, phone, full_name')
        .eq('id', user.id)
        .single();

      if (!profile || profile.kyc_status !== 'approved') {
        return new Response(JSON.stringify({ 
          error: 'KYC verification required to make contributions',
          kyc_status: profile?.kyc_status || 'unknown'
        }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Validate member exists
      const { data: member, error: memberError } = await supabaseClient
        .from('chama_members')
        .select('*, chama(contribution_amount, slug, name)')
        .eq('id', body.member_id)
        .maybeSingle();

      // Validate payer (if different from recipient)
      if (body.paid_by_member_id && body.paid_by_member_id !== body.member_id) {
        const { data: payer, error: payerError } = await supabaseClient
          .from('chama_members')
          .select('id, chama_id')
          .eq('id', body.paid_by_member_id)
          .maybeSingle();

        if (payerError || !payer || payer.chama_id !== member.chama_id) {
          return new Response(JSON.stringify({ error: 'Payer must be a member of the same chama' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      if (memberError || !member) {
        return new Response(JSON.stringify({ error: 'Member not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const expectedAmount = member.chama.contribution_amount;
      const paidAmount = body.amount;

      // Calculate overpayment or underpayment
      let creditDelta = 0;
      let deficitDelta = 0;

      if (paidAmount > expectedAmount) {
        // Overpayment - add to credit
        creditDelta = paidAmount - expectedAmount;
        console.log('Overpayment detected:', { paidAmount, expectedAmount, creditDelta });
      } else if (paidAmount < expectedAmount) {
        // Underpayment - add to deficit
        deficitDelta = expectedAmount - paidAmount;
        console.log('Underpayment detected:', { paidAmount, expectedAmount, deficitDelta });
      }

      // ============================================
      // FIRST PAYMENT ACTIVATION LOGIC
      // ============================================
      let isFirstPayment = false;
      let assignedOrderIndex: number | null = null;
      let assignedMemberCode: string | null = null;

      if (!member.first_payment_completed) {
        isFirstPayment = true;
        console.log('Processing FIRST PAYMENT for member:', member.id);

        // Get next available order_index using database function
        const { data: nextIndex, error: indexError } = await supabaseClient
          .rpc('get_next_order_index', { p_chama_id: member.chama_id });

        if (indexError) {
          console.error('Error getting next order index:', indexError);
          // Fallback: calculate manually
          const { data: existingMembers } = await supabaseClient
            .from('chama_members')
            .select('order_index')
            .eq('chama_id', member.chama_id)
            .not('order_index', 'is', null)
            .order('order_index', { ascending: false })
            .limit(1);
          
          assignedOrderIndex = existingMembers && existingMembers.length > 0
            ? (existingMembers[0].order_index || 0) + 1
            : 1;
        } else {
          assignedOrderIndex = nextIndex || 1;
        }

        // Generate member code
        const { data: memberCode } = await supabaseClient
          .rpc('generate_member_code', {
            p_chama_id: member.chama_id,
            p_order_index: assignedOrderIndex
          });

        assignedMemberCode = memberCode || `${member.chama.slug}-M${assignedOrderIndex}`;

        // Update member with first payment activation
        const { error: activationError } = await supabaseClient
          .from('chama_members')
          .update({
            first_payment_completed: true,
            first_payment_at: new Date().toISOString(),
            order_index: assignedOrderIndex,
            member_code: assignedMemberCode,
            status: 'active',
          })
          .eq('id', member.id);

        if (activationError) {
          console.error('Error activating member:', activationError);
        } else {
          console.log('Member activated with first payment:', {
            memberId: member.id,
            orderIndex: assignedOrderIndex,
            memberCode: assignedMemberCode
          });

          // Send SMS notification for first payment
          if (profile?.phone) {
            try {
              await supabaseClient.functions.invoke('send-transactional-sms', {
                body: {
                  phone: profile.phone,
                  message: `Payment received! You are now Member #${assignedOrderIndex} in "${member.chama.name}". Your member code is ${assignedMemberCode}. Your payout position is secured.`,
                  eventType: 'first_payment_received'
                }
              });
            } catch (smsError) {
              console.error('Failed to send first payment SMS:', smsError);
            }
          }
        }
      }

      // Create contribution record
      const { data, error } = await supabaseClient
        .from('contributions')
        .insert(body)
        .select()
        .maybeSingle();

      if (error) throw error;

      // Check for active cycle and handle cycle payment tracking
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      
      const { data: cycle } = await supabaseClient
        .from('contribution_cycles')
        .select('*')
        .eq('chama_id', body.chama_id)
        .lte('start_date', today)
        .gte('end_date', today)
        .eq('payout_processed', false)
        .maybeSingle();

      let isLatePayment = false;
      
      if (cycle) {
        // Check if payment is after 8 PM on cycle end date
        const cycleEndDate = new Date(cycle.end_date);
        const cutoffTime = new Date(cycleEndDate);
        cutoffTime.setHours(20, 0, 0, 0); // 8:00 PM on end date

        isLatePayment = now > cutoffTime;

        if (isLatePayment) {
          // Credit to next cycle
          const { error: creditError } = await supabaseClient
            .from('chama_members')
            .update({
              next_cycle_credit: member.next_cycle_credit + body.amount
            })
            .eq('id', body.member_id);

          if (!creditError) {
            // Send late payment notification
            const { data: profile } = await supabaseClient
              .from('profiles')
              .select('phone')
              .eq('id', member.user_id)
              .single();

            if (profile?.phone) {
              const nextCycleDate = new Date(cycle.end_date);
              nextCycleDate.setDate(nextCycleDate.getDate() + 1);
              
              await supabaseClient.functions.invoke('send-transactional-sms', {
                body: {
                  phone: profile.phone,
                  message: `Your payment of KES ${body.amount} was received after 8 PM. It has been credited to your next cycle contribution on ${nextCycleDate.toISOString().split('T')[0]}.`,
                  eventType: 'late_payment_credit'
                }
              });
            }
          }
        } else {
          // Record in member_cycle_payments
          const { error: paymentError } = await supabaseClient
            .from('member_cycle_payments')
            .upsert({
              member_id: body.member_id,
              cycle_id: cycle.id,
              amount_paid: body.amount,
              amount_due: cycle.due_amount,
              is_paid: true,
              paid_at: now.toISOString(),
              payment_time: now.toISOString(),
              is_late_payment: false
            }, {
              onConflict: 'member_id,cycle_id'
            });

          if (paymentError) {
            console.error('Error recording cycle payment:', paymentError);
          }

          // Reset missed payment count if this resolves it
          if (member.missed_payments_count > 0) {
            await supabaseClient
              .from('chama_members')
              .update({
                missed_payments_count: Math.max(0, member.missed_payments_count - 1),
                requires_admin_verification: member.missed_payments_count - 1 >= 1
              })
              .eq('id', body.member_id);
          }
        }
      }

      // Update member balance
      if (creditDelta > 0 || deficitDelta > 0) {
        const { error: updateError } = await supabaseClient
          .from('chama_members')
          .update({
            balance_credit: member.balance_credit + creditDelta,
            balance_deficit: member.balance_deficit + deficitDelta,
            last_payment_date: new Date().toISOString(),
          })
          .eq('id', body.member_id);

        if (updateError) {
          console.error('Error updating member balance:', updateError);
        } else {
          console.log('Member balance updated:', { creditDelta, deficitDelta });
        }
      }

      return new Response(JSON.stringify({ 
        data,
        balance_update: {
          credit_added: creditDelta,
          deficit_added: deficitDelta,
        },
        first_payment: isFirstPayment ? {
          activated: true,
          order_index: assignedOrderIndex,
          member_code: assignedMemberCode
        } : null
      }), {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error in contributions-crud:', {
      message: error.message,
      code: error.code,
      details: error.details
    });
    
    let safeMessage = 'An error occurred processing your request';
    if (error.code === '23505') safeMessage = 'Duplicate record';
    else if (error.code === '23503') safeMessage = 'Referenced record not found';
    else if (error.code === '42501') safeMessage = 'Permission denied';
    
    return new Response(JSON.stringify({ error: safeMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
