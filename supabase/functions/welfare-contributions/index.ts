import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { corsHeaders } from "../_shared/cors.ts";
import { COMMISSION_RATES } from "../_shared/commissionRates.ts";
import { createNotification, NotificationTemplates, notifyManyUsers } from "../_shared/notifications.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '').trim();
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAdmin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    // GET - List contributions
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const welfareId = url.searchParams.get('welfare_id');
      
      if (!welfareId) {
        return new Response(JSON.stringify({ error: 'welfare_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const { data, error } = await supabaseAdmin
        .from('welfare_contributions')
        .select('*, welfare_members!member_id(member_code, role, profiles:user_id(full_name, phone))')
        .eq('welfare_id', welfareId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return new Response(JSON.stringify({ data }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // POST - Record contribution
    if (req.method === 'POST') {
      if (!token) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const { data: userData } = await supabaseAdmin.auth.getUser(token);
      if (!userData?.user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const body = await req.json();
      const { welfare_id, amount, payment_method, payment_reference } = body;

      if (!welfare_id || !amount || amount <= 0) {
        return new Response(JSON.stringify({ error: 'welfare_id and positive amount required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Select ALL balance fields needed for the update
      const { data: welfare } = await supabaseAdmin
        .from('welfares')
        .select('id, is_frozen, status, commission_rate, total_gross_collected, total_commission_paid, available_balance, current_amount')
        .eq('id', welfare_id)
        .single();

      if (!welfare || welfare.status !== 'active') {
        return new Response(JSON.stringify({ error: 'Welfare not found or inactive' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (welfare.is_frozen) {
        return new Response(JSON.stringify({ error: 'Welfare is frozen. Contact admin.' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Get member record with total_contributed + registration status
      const { data: member } = await supabaseAdmin
        .from('welfare_members')
        .select('id, total_contributed, registration_status, registration_fee_due, registration_fee_paid, member_code')
        .eq('welfare_id', welfare_id)
        .eq('user_id', userData.user.id)
        .eq('status', 'active')
        .single();

      if (!member) {
        return new Response(JSON.stringify({ error: 'Not a member of this welfare' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const commissionRate = Number(welfare.commission_rate) || COMMISSION_RATES.WELFARE;
      const grossAmount = Number(amount);

      const cycleMonth = new Date().toISOString().substring(0, 7);
      const paymentRef = payment_reference || `WC-${crypto.randomUUID().substring(0, 8)}`;

      // Idempotency guard
      const { data: existing } = await supabaseAdmin
        .from('welfare_contributions')
        .select('*')
        .eq('welfare_id', welfare_id)
        .eq('payment_reference', paymentRef)
        .maybeSingle();

      if (existing) {
        console.log('Duplicate contribution detected, returning existing:', existing.id);
        return new Response(JSON.stringify({ data: existing }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // ===== Registration-fee allocation FIRST =====
      let regApplied = 0;
      let regFullyPaid = false;
      if (member.registration_status === 'pending' || member.registration_status === 'partial') {
        const { data: allocRes } = await supabaseAdmin.rpc('apply_welfare_registration_payment', {
          p_member_id: member.id,
          p_gross: grossAmount,
        });
        regApplied = Number(allocRes?.applied || 0);
        regFullyPaid = !!allocRes?.fully_paid;
      }

      const contributionGross = grossAmount - regApplied;

      // Registration fee carries a higher 10% platform commission; normal contributions stay at the welfare's rate.
      const REGISTRATION_COMMISSION_RATE = 0.10;

      // Helper to insert a welfare_contributions row + update balances
      const recordRow = async (gross: number, refSuffix: string, category: string, rate: number) => {
        const commission = Math.round(gross * rate * 100) / 100;
        const net = Math.round((gross - commission) * 100) / 100;
        const ref = refSuffix ? `${paymentRef}-${refSuffix}` : paymentRef;
        const { data: row, error: insErr } = await supabaseAdmin
          .from('welfare_contributions')
          .insert({
            welfare_id,
            member_id: member.id,
            user_id: userData.user.id,
            gross_amount: gross,
            commission_amount: commission,
            net_amount: net,
            payment_reference: ref,
            payment_method: payment_method || 'mpesa',
            payment_status: 'completed',
            cycle_month: cycleMonth,
            category,
            completed_at: new Date().toISOString(),
          })
          .select()
          .single();
        if (insErr) throw insErr;
        await supabaseAdmin.rpc('record_company_earning', {
          p_source: category === 'registration_fee' ? 'welfare_registration' : 'welfare_contribution',
          p_amount: commission,
          p_group_id: welfare_id,
          p_reference_id: row.id,
          p_description: `Welfare ${category} commission (${(rate * 100).toFixed(0)}%)`,
        });
        return { row, commission, net };
      };

      let totalCommission = 0;
      let totalNet = 0;
      let primaryContribution: any = null;

      if (regApplied > 0) {
        const r = await recordRow(regApplied, 'REG', 'registration_fee', REGISTRATION_COMMISSION_RATE);
        totalCommission += r.commission;
        totalNet += r.net;
        primaryContribution = r.row;
      }
      if (contributionGross > 0) {
        const r = await recordRow(contributionGross, '', 'contribution', commissionRate);
        totalCommission += r.commission;
        totalNet += r.net;
        primaryContribution = r.row;
      }

      // Update welfare balances once
      await supabaseAdmin
        .from('welfares')
        .update({
          total_gross_collected: (welfare.total_gross_collected || 0) + grossAmount,
          total_commission_paid: (welfare.total_commission_paid || 0) + totalCommission,
          available_balance: (welfare.available_balance || 0) + totalNet,
          current_amount: (welfare.current_amount || 0) + totalNet,
        })
        .eq('id', welfare_id);

      // Update member total_contributed
      await supabaseAdmin
        .from('welfare_members')
        .update({ total_contributed: (member.total_contributed || 0) + grossAmount })
        .eq('id', member.id);

      const contribution = primaryContribution;
      const commissionAmount = totalCommission;
      const netAmount = totalNet;

      // Notify member if registration just became confirmed
      if (regFullyPaid) {
        try {
          const { data: w } = await supabaseAdmin.from('welfares').select('name').eq('id', welfare_id).single();
          await supabaseAdmin.from('notifications').insert({
            user_id: userData.user.id,
            title: 'Registration Confirmed',
            message: `Your registration to "${w?.name || 'the welfare'}" is complete. You are now an active member.`,
            type: 'success',
            category: 'welfare',
            related_entity_type: 'welfare',
            related_entity_id: welfare_id,
          });
        } catch (_) { /* ignore */ }
      }


      // Push + in-app notification + confirmation SMS to the contributing member
      try {
        const { data: welfareName } = await supabaseAdmin
          .from('welfares')
          .select('name')
          .eq('id', welfare_id)
          .single();
        const wName = welfareName?.name || 'Welfare';

        await createNotification(supabaseAdmin, {
          userId: userData.user.id,
          ...NotificationTemplates.paymentReceived(grossAmount, wName),
          relatedEntityId: welfare_id,
          relatedEntityType: 'welfare',
        });

        // Send confirmation SMS to the contributor
        const { data: contribProfile } = await supabaseAdmin
          .from('profiles')
          .select('full_name, phone')
          .eq('id', userData.user.id)
          .maybeSingle();
        if (contribProfile?.phone) {
          const firstName = (contribProfile.full_name || '').split(' ')[0] || 'Member';
          try {
            await supabaseAdmin.functions.invoke('send-transactional-sms', {
              body: {
                phone: contribProfile.phone,
                message: `Thank you ${firstName}! Your contribution of KES ${grossAmount.toLocaleString()} to "${wName}" has been received. Ref: ${paymentRef}.`,
                eventType: 'welfare_contribution_confirmation',
              },
            });
          } catch (smsErr) {
            console.warn('Failed to send welfare contribution SMS:', smsErr);
          }
        }

        // Notify ALL active welfare members of new contribution
        const { data: allMembers } = await supabaseAdmin
          .from('welfare_members')
          .select('user_id')
          .eq('welfare_id', welfare_id)
          .eq('status', 'active');

        const memberIds = (allMembers || [])
          .map((m: any) => m.user_id)
          .filter((id: string) => id && id !== userData.user.id);

        if (memberIds.length > 0) {
          await notifyManyUsers(supabaseAdmin, memberIds, {
            title: 'New Welfare Contribution 🤝',
            message: `A member contributed KES ${grossAmount.toLocaleString()} to "${wName}".`,
            type: 'success',
            category: 'welfare',
            relatedEntityId: welfare_id,
            relatedEntityType: 'welfare',
          });
        }
      } catch (notifyErr) {
        console.warn('Failed to send welfare contribution notifications:', notifyErr);
      }

      return new Response(JSON.stringify({ data: contribution }), { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    console.error('welfare-contributions error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
