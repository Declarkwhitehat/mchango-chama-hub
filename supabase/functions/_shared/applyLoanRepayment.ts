import { createNotification } from "./notifications.ts";

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Applies a confirmed M-Pesa repayment against a welfare loan.
 * Returns { applied, balance } — never throws.
 */
export async function applyLoanRepayment(
  db: any,
  opts: {
    loanId: string;
    amount: number;
    receipt: string | null;
    source: "stk" | "paybill" | "shares" | "manual";
    repaymentId?: string | null;
  },
): Promise<{ applied: boolean; balance?: number; error?: string }> {
  try {
    const { data: loan } = await db
      .from("welfare_loans").select("*").eq("id", opts.loanId).maybeSingle();
    if (!loan) return { applied: false, error: "Loan not found" };

    const amount = round2(Number(opts.amount || 0));
    if (amount <= 0) return { applied: false, error: "Invalid amount" };

    const newBalance = round2(Math.max(0, Number(loan.balance || 0) - amount));
    const cleared = newBalance <= 0;

    if (opts.repaymentId) {
      await db.from("welfare_loan_repayments").update({
        status: "completed",
        amount,
        mpesa_receipt: opts.receipt,
        balance_after: newBalance,
      }).eq("id", opts.repaymentId);
    } else {
      await db.from("welfare_loan_repayments").insert({
        loan_id: loan.id,
        welfare_id: loan.welfare_id,
        member_id: loan.member_id,
        amount,
        mpesa_receipt: opts.receipt,
        source: opts.source,
        status: "completed",
        balance_after: newBalance,
      });
    }

    await db.from("welfare_loans").update({
      balance: newBalance,
      status: cleared ? "repaid" : loan.status,
      closed_at: cleared ? new Date().toISOString() : null,
      mpesa_receipt: opts.receipt ?? loan.mpesa_receipt,
    }).eq("id", loan.id);

    // Cash returns to the welfare pool (shares repayments are internal only)
    if (opts.source !== "shares") {
      const { data: w } = await db
        .from("welfares").select("name, available_balance, current_amount").eq("id", loan.welfare_id).maybeSingle();
      await db.from("welfares").update({
        available_balance: round2(Number(w?.available_balance || 0) + amount),
        current_amount: round2(Number(w?.current_amount || 0) + amount),
      }).eq("id", loan.welfare_id);

      try {
        await db.from("financial_ledger").insert({
          transaction_type: "loan_repayment",
          source_type: "welfare",
          source_id: loan.welfare_id,
          reference_id: loan.id,
          gross_amount: amount,
          commission_amount: 0,
          net_amount: amount,
          commission_rate: 0,
          description: `Welfare loan repayment (${opts.source})`,
        });
      } catch (_e) { /* analytics only */ }
    }

    const { data: welfare } = await db
      .from("welfares").select("name").eq("id", loan.welfare_id).maybeSingle();

    await createNotification(db, {
      userId: loan.user_id,
      title: cleared ? "Loan fully repaid" : "Loan repayment received",
      message: cleared
        ? `Your loan with ${welfare?.name || "your welfare"} is fully repaid. Thank you — you are now eligible to borrow again.`
        : `KES ${amount.toLocaleString()} received. Your remaining loan balance is KES ${newBalance.toLocaleString()}.`,
      type: cleared ? "success" : "info",
      category: "welfare",
      relatedEntityId: loan.welfare_id,
      relatedEntityType: "welfare",
    });

    return { applied: true, balance: newBalance };
  } catch (e) {
    console.error("applyLoanRepayment failed:", (e as Error).message);
    return { applied: false, error: (e as Error).message };
  }
}

/** Finds the member's open loan (if any) for offline/Paybill matching. */
export async function findOpenLoan(db: any, memberId: string) {
  const { data } = await db
    .from("welfare_loans")
    .select("id, balance, status")
    .eq("member_id", memberId)
    .in("status", ["active", "overdue"])
    .order("created_at", { ascending: true })
    .limit(1);
  return data?.[0] || null;
}
