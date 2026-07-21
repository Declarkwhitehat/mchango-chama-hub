// Compute a chama member's remaining dues for SMS suffix.
// Fails soft — returns zeros on any error so SMS never blocks.

export interface MemberOutstanding {
  shortfall: number;   // remaining on the current active cycle
  priorDebt: number;   // sum of remaining debt from previous cycles
}

export async function getMemberOutstanding(
  supabase: any,
  memberId: string,
  chamaId: string,
): Promise<MemberOutstanding> {
  const result: MemberOutstanding = { shortfall: 0, priorDebt: 0 };
  if (!memberId || !chamaId) return result;

  try {
    // Current active cycle for this chama (unpaid payouts).
    const today = new Date().toISOString().split('T')[0];
    const { data: cycle } = await supabase
      .from('contribution_cycles')
      .select('id')
      .eq('chama_id', chamaId)
      .lte('start_date', today)
      .gte('end_date', today)
      .eq('payout_processed', false)
      .maybeSingle();

    if (cycle?.id) {
      const { data: mcp } = await supabase
        .from('member_cycle_payments')
        .select('amount_due, amount_paid, is_paid')
        .eq('cycle_id', cycle.id)
        .eq('member_id', memberId)
        .maybeSingle();

      if (mcp && !mcp.is_paid) {
        const due = Number(mcp.amount_due || 0);
        const paid = Number(mcp.amount_paid || 0);
        const remaining = due - paid;
        if (remaining > 0) result.shortfall = remaining;
      }
    }
  } catch (e) {
    console.warn('getMemberOutstanding: cycle lookup failed', (e as Error).message);
  }

  try {
    const { data: debts } = await supabase
      .from('chama_member_debts')
      .select('principal_remaining, penalty_remaining, status')
      .eq('member_id', memberId)
      .neq('status', 'cleared');

    if (Array.isArray(debts)) {
      const sum = debts.reduce(
        (t: number, d: any) =>
          t + Number(d.principal_remaining || 0) + Number(d.penalty_remaining || 0),
        0,
      );
      if (sum > 0) result.priorDebt = sum;
    }
  } catch (e) {
    console.warn('getMemberOutstanding: debt lookup failed', (e as Error).message);
  }

  return result;
}
