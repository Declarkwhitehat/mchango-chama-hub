// Shared helper: apply pending chama_overpayment_wallet + chama_late_payment_buffer
// credits to a specific cycle's member_cycle_payments rows BEFORE any
// payout-eligibility / missed-payment / debt-accrual processing happens.
//
// Wallet/buffer amounts are already NET of commission (commission was extracted
// at deposit time). Compare them against the NET cycle target and NEVER charge
// commission again — that would be double-charging the member.
//
// Returns a summary so callers can log how much credit was applied.

export interface ApplyChamaWalletResult {
  membersCredited: number;
  netCreditApplied: number;
  walletRowsApplied: number;
  bufferRowsApplied: number;
}

export async function applyPendingWalletToCycle(
  supabase: any,
  chamaId: string,
  cycleId: string,
  contributionAmount: number,
  commissionRate: number,
): Promise<ApplyChamaWalletResult> {
  const onTimeRate = Number(commissionRate ?? 0.05) || 0.05;
  const netCycleCost = contributionAmount * (1 - onTimeRate);

  const summary: ApplyChamaWalletResult = {
    membersCredited: 0,
    netCreditApplied: 0,
    walletRowsApplied: 0,
    bufferRowsApplied: 0,
  };

  if (!chamaId || !cycleId || contributionAmount <= 0) return summary;

  // Pending wallet rows (FIFO oldest first)
  const { data: pendingWalletRows } = await supabase
    .from("chama_overpayment_wallet")
    .select("id, member_id, amount, created_at")
    .eq("chama_id", chamaId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  // Pending late-payment buffer rows (FIFO oldest first)
  const { data: pendingBufferRows } = await supabase
    .from("chama_late_payment_buffer")
    .select("id, member_id, net_amount, created_at")
    .eq("chama_id", chamaId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  const totalsByMember = new Map<string, number>();
  for (const r of pendingWalletRows || []) {
    totalsByMember.set(r.member_id, (totalsByMember.get(r.member_id) || 0) + Number(r.amount));
  }
  for (const r of pendingBufferRows || []) {
    totalsByMember.set(r.member_id, (totalsByMember.get(r.member_id) || 0) + Number(r.net_amount));
  }

  if (totalsByMember.size === 0) return summary;

  // Load member payment rows for the target cycle
  const { data: paymentRows } = await supabase
    .from("member_cycle_payments")
    .select("id, member_id, amount_due, amount_paid, amount_remaining, fully_paid, payment_allocations")
    .eq("cycle_id", cycleId);

  const paymentByMember = new Map<string, any>();
  for (const p of paymentRows || []) paymentByMember.set(p.member_id, p);

  let totalNetCreditApplied = 0;

  for (const [memberId, walletTotal] of totalsByMember.entries()) {
    if (walletTotal <= 0) continue;
    const payment = paymentByMember.get(memberId);
    if (!payment) continue; // member has no row for this cycle — nothing to credit
    if (payment.fully_paid) continue; // already paid by other means

    const due = Number(payment.amount_due ?? contributionAmount);
    const alreadyPaid = Number(payment.amount_paid ?? 0);
    if (alreadyPaid >= due) continue;

    // Net the member still owes on this cycle, expressed as gross-equivalent
    const grossOutstanding = due - alreadyPaid;
    const netOutstanding = grossOutstanding * (1 - onTimeRate);

    // Credit is net — apply against net outstanding
    const creditToUse = Math.min(walletTotal, netOutstanding);
    if (creditToUse <= 0.0001) continue;

    // Gross-equivalent paid by this credit (so amount_paid stays in gross terms)
    const isFullyPaid = creditToUse >= netOutstanding - 0.0001;
    const grossEquivalentPaid = isFullyPaid
      ? grossOutstanding
      : Math.round((creditToUse / (1 - onTimeRate)) * 100) / 100;

    const newAmountPaid = alreadyPaid + grossEquivalentPaid;
    const newRemaining = Math.max(0, due - newAmountPaid);

    const existingAllocs = Array.isArray(payment.payment_allocations)
      ? payment.payment_allocations
      : [];

    await supabase
      .from("member_cycle_payments")
      .update({
        amount_paid: newAmountPaid,
        amount_remaining: newRemaining,
        fully_paid: isFullyPaid,
        is_paid: isFullyPaid,
        ...(isFullyPaid ? { paid_at: new Date().toISOString() } : {}),
        payment_allocations: JSON.stringify([
          ...existingAllocs,
          {
            amount: creditToUse,
            net_credit_used: creditToUse,
            gross_equivalent: grossEquivalentPaid,
            commission: 0,
            commission_rate: 0,
            timestamp: new Date().toISOString(),
            source: "wallet_auto_apply",
            note: `Pending wallet/late-buffer credit auto-applied to open cycle (already net of ${
              onTimeRate * 100
            }% commission).`,
          },
        ]),
      })
      .eq("id", payment.id);

    totalNetCreditApplied += creditToUse;
    summary.membersCredited += 1;

    // Drain wallet rows first, then late-buffer rows (FIFO)
    let toConsume = creditToUse;

    const walletEntries = (pendingWalletRows || []).filter((r: any) => r.member_id === memberId);
    for (const entry of walletEntries) {
      if (toConsume <= 0) break;
      const entryAmount = Number(entry.amount);
      const consume = Math.min(entryAmount, toConsume);
      const remainder = entryAmount - consume;
      toConsume -= consume;

      if (remainder <= 0.0001) {
        await supabase
          .from("chama_overpayment_wallet")
          .update({
            status: "applied",
            applied_to_cycle_id: cycleId,
            applied_at: new Date().toISOString(),
          })
          .eq("id", entry.id);
        summary.walletRowsApplied += 1;
      } else {
        await supabase
          .from("chama_overpayment_wallet")
          .update({
            amount: remainder,
            description: `Partially applied KES ${consume.toFixed(
              2,
            )} to open cycle. KES ${remainder.toFixed(2)} remaining.`,
          })
          .eq("id", entry.id);
      }
    }

    const bufferEntries = (pendingBufferRows || []).filter((r: any) => r.member_id === memberId);
    for (const entry of bufferEntries) {
      if (toConsume <= 0) break;
      const entryAmount = Number(entry.net_amount);
      const consume = Math.min(entryAmount, toConsume);
      const remainder = entryAmount - consume;
      toConsume -= consume;

      if (remainder <= 0.0001) {
        await supabase
          .from("chama_late_payment_buffer")
          .update({
            status: "applied",
            applied_to_cycle_id: cycleId,
            applied_at: new Date().toISOString(),
            note: `Applied KES ${consume.toFixed(2)} to open cycle ${cycleId}.`,
          })
          .eq("id", entry.id);
        summary.bufferRowsApplied += 1;
      } else {
        await supabase
          .from("chama_late_payment_buffer")
          .update({
            net_amount: remainder,
            note: `Partially applied KES ${consume.toFixed(
              2,
            )} to open cycle. KES ${remainder.toFixed(2)} remaining.`,
          })
          .eq("id", entry.id);
      }
    }
  }

  // Push net credit into the chama pool (no commission — already collected at deposit)
  if (totalNetCreditApplied > 0) {
    const { data: chamaRow } = await supabase
      .from("chama")
      .select("available_balance")
      .eq("id", chamaId)
      .single();
    if (chamaRow) {
      await supabase
        .from("chama")
        .update({
          available_balance: (chamaRow.available_balance || 0) + totalNetCreditApplied,
        })
        .eq("id", chamaId);
    }
  }

  summary.netCreditApplied = Number(totalNetCreditApplied.toFixed(2));
  return summary;
}
