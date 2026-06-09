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

    // Get chama + members
    const { data: chama, error: chamaError } = await supabase
      .from('chama')
      .select(`
        id, name, group_code, last_cycle_completed_at,
        chama_members!inner(
          id, member_code, is_manager, user_id, balance_deficit,
          profiles!inner(full_name, phone)
        )
      `)
      .eq('id', chamaId)
      .eq('chama_members.status', 'active')
      .eq('chama_members.approval_status', 'approved')
      .single();

    if (chamaError) throw chamaError;

    const manager = (chama.chama_members as any[]).find((m: any) => m.is_manager);
    const managerProfile = Array.isArray(manager?.profiles) ? manager.profiles[0] : manager?.profiles;

    // Determine actual settlement state for THIS chama
    const { data: cycles } = await supabase
      .from('contribution_cycles')
      .select('id, cycle_number, beneficiary_member_id, payout_amount, members_paid_count, members_skipped_count, payout_type')
      .eq('chama_id', chamaId)
      .order('cycle_number', { ascending: true });

    const { data: outstandingDebts } = await supabase
      .from('chama_member_debts')
      .select('id, member_id, principal_remaining, penalty_remaining, chama_cycle_deficits!debt_id(recipient_member_id, status)')
      .eq('chama_id', chamaId)
      .in('status', ['outstanding', 'partial']);

    const totalDebtPrincipal = (outstandingDebts || []).reduce(
      (s: number, d: any) => s + Number(d.principal_remaining || 0), 0
    );
    const hasOutstandingDebts = (outstandingDebts || []).length > 0;
    const skippedCount = (cycles || []).reduce(
      (s: number, c: any) => s + Number(c.members_skipped_count || 0), 0
    );
    const allFullyPaid = !hasOutstandingDebts && skippedCount === 0;

    // Build per-member SMS
    const debtorIds = new Set((outstandingDebts || []).map((d: any) => d.member_id));

    const smsPromises = (chama.chama_members as any[]).map(async (member: any) => {
      const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles;
      const phone = profile?.phone;
      if (!phone) return { success: false, phone: null, error: 'No phone' };

      let message: string;
      if (debtorIds.has(member.id)) {
        // This member owes other members money — remind them
        const owed = (outstandingDebts || [])
          .filter((d: any) => d.member_id === member.id)
          .reduce((s: number, d: any) => s + Number(d.principal_remaining || 0) + Number(d.penalty_remaining || 0), 0);
        message = `"${chama.name}" cycle is closed but you still owe KES ${owed.toFixed(0)} to other members. Pay via Paybill 4015351, Account ${member.member_code} to clear your debt. STOP 4569*5#`;
      } else if (allFullyPaid) {
        message = `"${chama.name}" cycle is complete. All members paid and all payouts settled. To rejoin a new cycle contact ${managerProfile?.full_name || 'your manager'} (${managerProfile?.phone || 'in app'}). Member ID: ${member.member_code}. STOP 4569*5#`;
      } else {
        message = `"${chama.name}" cycle ended. Some payments are still pending and shortchanged members will be settled as debts are cleared. Member ID: ${member.member_code}. STOP 4569*5#`;
      }

      try {
        const { error: smsError } = await supabase.functions.invoke('send-transactional-sms', {
          body: { phone, message, eventType: 'cycle_complete' }
        });
        if (smsError) return { success: false, phone, error: smsError };
        return { success: true, phone };
      } catch (err) {
        return { success: false, phone, error: err };
      }
    });

    // Manager summary
    if (managerProfile?.phone) {
      let summary: string;
      if (allFullyPaid) {
        summary = `"${chama.name}" cycle complete. All payouts settled, no debts.`;
      } else {
        summary = `"${chama.name}" cycle ended. ${debtorIds.size} member(s) still owe KES ${totalDebtPrincipal.toFixed(0)} to shortchanged members. Reminders sent. STOP 4569*5#`;
      }
      try {
        await supabase.functions.invoke('send-transactional-sms', {
          body: { phone: managerProfile.phone, message: summary, eventType: 'cycle_complete_manager' }
        });
      } catch (err) {
        console.error('Manager summary SMS error:', err);
      }
    }

    const smsResults = await Promise.all(smsPromises);
    const successCount = smsResults.filter(r => r.success).length;

    return new Response(
      JSON.stringify({
        success: true,
        notificationsSent: successCount,
        totalMembers: (chama.chama_members as any[]).length,
        allFullyPaid,
        outstandingDebtors: debtorIds.size,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    console.error('Error in cycle completion notification:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message || 'Failed to send cycle completion notifications' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
