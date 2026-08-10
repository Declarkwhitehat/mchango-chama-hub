import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { corsHeaders } from "../_shared/cors.ts";
import { createNotification } from "../_shared/notifications.ts";
import { LOAN_TERMS, quoteLoan, maxLoanFor, WelfareLoanType } from "../_shared/loanTerms.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const OPEN_STATUSES = ["pending", "approved", "disbursing", "active", "overdue"];
const EXEC_ROLES = ["chairman", "secretary", "treasurer"];
const round2 = (n: number) => Math.round(n * 100) / 100;

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

async function loadEligibility(db: any, welfareId: string, userId: string) {
  const { data: welfare } = await db
    .from("welfares")
    .select("id, name, status, is_frozen, available_balance, current_amount, registration_fee, contribution_amount, loans_enabled, loan_min_membership_months, loan_min_payment_rate")
    .eq("id", welfareId)
    .maybeSingle();
  if (!welfare) return { error: "Welfare not found" };

  const { data: member } = await db
    .from("welfare_members")
    .select("id, user_id, member_code, role, status, joined_at, registration_status, registration_fee_due, registration_fee_paid")
    .eq("welfare_id", welfareId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!member) return { error: "You are not a member of this welfare" };

  const [{ data: contribs }, { data: cycles }, { data: openLoans }] = await Promise.all([
    db.from("welfare_contributions")
      .select("gross_amount, category")
      .eq("member_id", member.id)
      .eq("payment_status", "completed"),
    db.from("welfare_contribution_cycles")
      .select("amount, start_date")
      .eq("welfare_id", welfareId),
    db.from("welfare_loans")
      .select("id, status")
      .eq("member_id", member.id)
      .in("status", OPEN_STATUSES),
  ]);

  const shares = round2(
    (contribs || [])
      .filter((c: any) => c.category !== "registration_fee")
      .reduce((s: number, c: any) => s + Number(c.gross_amount || 0), 0),
  );

  const joined = member.joined_at ? new Date(member.joined_at) : new Date();
  const expected = (cycles || [])
    .filter((c: any) => new Date(c.start_date) >= new Date(joined.toDateString()))
    .reduce((s: number, c: any) => s + Number(c.amount || 0), 0);
  const paymentRate = expected > 0 ? Math.min(shares / expected, 1) : 1;

  const monthsMember = (Date.now() - joined.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
  const minMonths = Number(welfare.loan_min_membership_months ?? 6);
  const minRate = Number(welfare.loan_min_payment_rate ?? 0.95);
  const regCleared =
    member.registration_status === "confirmed" ||
    Number(member.registration_fee_paid || 0) >= Number(member.registration_fee_due || 0);

  const reasons: string[] = [];
  if (welfare.loans_enabled === false) reasons.push("Loans are currently disabled for this welfare.");
  if (welfare.is_frozen || welfare.status !== "active") reasons.push("This welfare is frozen or inactive.");
  if (member.status !== "active") reasons.push("Only active members can borrow.");
  if (!regCleared) reasons.push("Clear your registration fee first.");
  if (monthsMember < minMonths)
    reasons.push(`You must be a member for at least ${minMonths} months (currently ${Math.floor(monthsMember)}).`);
  if (paymentRate < minRate)
    reasons.push(`You must have paid at least ${Math.round(minRate * 100)}% of your contributions (currently ${Math.round(paymentRate * 100)}%).`);
  if ((openLoans || []).length > 0) reasons.push("You already have a loan that is not fully repaid.");
  if (shares <= 0) reasons.push("You have no shares to borrow against.");

  return {
    welfare,
    member,
    shares,
    expected,
    paymentRate,
    monthsMember,
    minMonths,
    minRate,
    eligible: reasons.length === 0,
    reasons,
    maxMultiplier: maxLoanFor("multiplier", shares),
    maxShares: maxLoanFor("shares", shares),
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const db = createClient(supabaseUrl, serviceKey);
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "Please sign in to continue." }, 401);

    const { data: userData } = await db.auth.getUser(token);
    const user = userData?.user;
    if (!user) return json({ error: "Your session has expired. Please sign in again." }, 401);

    const { data: adminRole } = await db
      .from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    const isAdmin = Boolean(adminRole);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");

    // ─────────────────────────── QUOTE / OVERVIEW ───────────────────────────
    if (action === "overview") {
      const welfareId = String(body.welfare_id || "");
      if (!welfareId) return json({ error: "welfare_id is required" }, 400);
      const el: any = await loadEligibility(db, welfareId, user.id);
      if (el.error) return json({ error: el.error }, 404);

      const role = el.member.role;
      const isExec = EXEC_ROLES.includes(role);

      const { data: myLoans } = await db
        .from("welfare_loans")
        .select("*, welfare_loan_repayments(id, amount, mpesa_receipt, created_at, status)")
        .eq("member_id", el.member.id)
        .order("created_at", { ascending: false })
        .limit(20);

      let pendingApprovals: any[] = [];
      if (isExec || isAdmin) {
        const { data } = await db
          .from("welfare_loans")
          .select("*, welfare_members!member_id(member_code, profiles:user_id(full_name)), welfare_loan_approvals(approver_user_id, decision)")
          .eq("welfare_id", welfareId)
          .eq("status", "pending")
          .order("created_at", { ascending: true })
          .limit(50);
        pendingApprovals = data || [];
      }

      return json({
        shares: el.shares,
        payment_rate: el.paymentRate,
        months_member: Math.floor(el.monthsMember),
        min_months: el.minMonths,
        min_rate: el.minRate,
        eligible: el.eligible,
        reasons: el.reasons,
        max_multiplier: el.maxMultiplier,
        max_shares: el.maxShares,
        member_code: el.member.member_code,
        welfare_balance: Number(el.welfare.available_balance || 0),
        role,
        is_exec: isExec,
        is_admin: isAdmin,
        loans: myLoans || [],
        pending_approvals: pendingApprovals,
      });
    }

    // ─────────────────────────────── REQUEST ────────────────────────────────
    if (action === "request") {
      const welfareId = String(body.welfare_id || "");
      const loanType = String(body.loan_type || "") as WelfareLoanType;
      const amount = Number(body.amount || 0);

      if (!welfareId || !LOAN_TERMS[loanType]) return json({ error: "Invalid loan request." }, 400);
      if (!Number.isFinite(amount) || amount < 500)
        return json({ error: "The minimum loan amount is KES 500." }, 400);

      const el: any = await loadEligibility(db, welfareId, user.id);
      if (el.error) return json({ error: el.error }, 404);
      if (!el.eligible) return json({ error: el.reasons[0] }, 403);

      const max = loanType === "multiplier" ? el.maxMultiplier : el.maxShares;
      if (amount > max)
        return json({ error: `The most you can borrow on this product is KES ${max.toLocaleString()}.` }, 400);

      const q = quoteLoan(loanType, amount);
      const cashOut = round2(q.amountDisbursed + q.companyShare);
      if (Number(el.welfare.available_balance || 0) < cashOut)
        return json({ error: "The welfare does not have enough available balance to fund this loan right now." }, 400);

      const { data: loan, error } = await db
        .from("welfare_loans")
        .insert({
          welfare_id: welfareId,
          member_id: el.member.id,
          user_id: user.id,
          loan_type: loanType,
          principal: q.principal,
          charge_rate: q.chargeRate,
          charge_amount: q.chargeAmount,
          welfare_share: q.welfareShare,
          company_share: q.companyShare,
          amount_disbursed: q.amountDisbursed,
          balance: q.repayable,
          shares_at_request: el.shares,
          status: "pending",
        })
        .select("*")
        .single();
      if (error) throw error;

      // Notify executives to approve
      const { data: execs } = await db
        .from("welfare_members")
        .select("user_id, role")
        .eq("welfare_id", welfareId)
        .eq("status", "active")
        .in("role", EXEC_ROLES);

      const { data: prof } = await db.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
      for (const e of execs || []) {
        if (e.user_id === user.id) continue;
        await createNotification(db, {
          userId: e.user_id,
          title: "Loan approval needed",
          message: `${prof?.full_name || "A member"} (${el.member.member_code}) requested a ${LOAN_TERMS[loanType].label} of KES ${q.principal.toLocaleString()}. Two executive approvals are required.`,
          type: "warning",
          category: "welfare",
          relatedEntityId: welfareId,
          relatedEntityType: "welfare",
        });
      }

      return json({ success: true, loan, quote: q });
    }

    // ───────────────────────────── APPROVE / REJECT ─────────────────────────
    if (action === "decide") {
      const loanId = String(body.loan_id || "");
      const decision = body.decision === "rejected" ? "rejected" : "approved";
      const reason = typeof body.reason === "string" ? body.reason.slice(0, 300) : null;
      if (!loanId) return json({ error: "loan_id is required" }, 400);

      const { data: loan } = await db.from("welfare_loans").select("*").eq("id", loanId).maybeSingle();
      if (!loan) return json({ error: "Loan not found." }, 404);
      if (loan.status !== "pending") return json({ error: "This loan has already been processed." }, 400);

      const { data: approver } = await db
        .from("welfare_members")
        .select("id, role, status")
        .eq("welfare_id", loan.welfare_id)
        .eq("user_id", user.id)
        .maybeSingle();

      const isExec = approver && approver.status === "active" && EXEC_ROLES.includes(approver.role);
      if (!isExec && !isAdmin) return json({ error: "Only welfare executives can approve loans." }, 403);
      if (!isAdmin && loan.user_id === user.id)
        return json({ error: "You cannot approve your own loan." }, 403);

      if (decision === "rejected") {
        await db.from("welfare_loans")
          .update({ status: "rejected", rejection_reason: reason, closed_at: new Date().toISOString() })
          .eq("id", loanId);
        await db.from("welfare_loan_approvals").insert({
          loan_id: loanId, approver_user_id: user.id, approver_role: isAdmin ? "admin" : approver!.role,
          decision: "rejected", notes: reason,
        });
        await createNotification(db, {
          userId: loan.user_id,
          title: "Loan request declined",
          message: `Your loan request of KES ${Number(loan.principal).toLocaleString()} was declined.${reason ? ` Reason: ${reason}` : ""}`,
          type: "error", category: "welfare",
          relatedEntityId: loan.welfare_id, relatedEntityType: "welfare",
        });
        return json({ success: true, status: "rejected" });
      }

      const { error: apprErr } = await db.from("welfare_loan_approvals").insert({
        loan_id: loanId, approver_user_id: user.id,
        approver_role: isAdmin && !isExec ? "admin" : approver!.role,
        decision: "approved", notes: reason,
      });
      if (apprErr && !String(apprErr.message || "").includes("duplicate"))
        throw apprErr;

      const { data: approvals } = await db
        .from("welfare_loan_approvals").select("id").eq("loan_id", loanId).eq("decision", "approved");
      const count = (approvals || []).length;
      const forced = isAdmin && body.force === true;

      await db.from("welfare_loans").update({ approvals_count: count }).eq("id", loanId);

      if (count < 2 && !forced) {
        return json({ success: true, status: "pending", approvals: count, required: 2 });
      }

      // ── Fully approved → disburse ──
      const { data: claimed } = await db
        .from("welfare_loans")
        .update({ status: "disbursing" })
        .eq("id", loanId)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();
      if (!claimed) return json({ success: true, status: "already_processing" });

      const disburseRes = await disburseLoan(db, loanId);
      return json({ success: true, status: "approved", ...disburseRes });
    }

    // ───────────────────────────── REPAY (STK) ──────────────────────────────
    if (action === "repay") {
      const loanId = String(body.loan_id || "");
      const amount = Number(body.amount || 0);
      if (!loanId || !Number.isFinite(amount) || amount < 1)
        return json({ error: "Enter a valid repayment amount." }, 400);

      const { data: loan } = await db.from("welfare_loans").select("*").eq("id", loanId).maybeSingle();
      if (!loan) return json({ error: "Loan not found." }, 404);
      if (loan.user_id !== user.id && !isAdmin) return json({ error: "You can only repay your own loan." }, 403);
      if (!["active", "overdue"].includes(loan.status)) return json({ error: "This loan is not open for repayment." }, 400);
      if (amount > Number(loan.balance) + 1)
        return json({ error: `Your outstanding balance is KES ${Number(loan.balance).toLocaleString()}.` }, 400);

      const { data: prof } = await db.from("profiles").select("phone").eq("id", loan.user_id).maybeSingle();
      const phone = String(body.phone || prof?.phone || "").trim();
      if (!phone) return json({ error: "No M-Pesa number on file. Add one in your profile." }, 400);

      const { data: member } = await db
        .from("welfare_members").select("member_code").eq("id", loan.member_id).maybeSingle();

      const stk = await fetch(`${supabaseUrl}/functions/v1/payment-stk-push`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({
          phone_number: phone,
          amount: Math.round(amount),
          account_reference: (member?.member_code || "LOAN").substring(0, 12),
          transaction_desc: "Loan repay",
          callback_metadata: { type: "welfare_loan_repayment", loan_id: loanId },
        }),
      });
      const stkJson = await stk.json().catch(() => ({}));
      if (!stk.ok || !stkJson?.CheckoutRequestID) {
        return json({ error: stkJson?.error || "Could not start the M-Pesa prompt. Please try again." }, 400);
      }

      await db.from("welfare_loan_repayments").insert({
        loan_id: loanId,
        welfare_id: loan.welfare_id,
        member_id: loan.member_id,
        amount: Math.round(amount),
        source: "stk",
        status: "pending",
        checkout_request_id: stkJson.CheckoutRequestID,
        balance_after: Number(loan.balance),
      });

      return json({ success: true, checkout_request_id: stkJson.CheckoutRequestID });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    const err = e as Error;
    console.error("welfare-loans error:", err?.message, err?.stack);
    return json({ error: err?.message || "Something went wrong processing this loan." }, 500);
  }
});

// ───────────────────────────── disbursement ──────────────────────────────────
async function disburseLoan(db: any, loanId: string) {
  const { data: loan } = await db.from("welfare_loans").select("*").eq("id", loanId).maybeSingle();
  if (!loan) return { disbursed: false, error: "Loan not found" };

  const { data: welfare } = await db
    .from("welfares").select("id, name, available_balance, current_amount").eq("id", loan.welfare_id).maybeSingle();
  const { data: prof } = await db
    .from("profiles").select("full_name, phone").eq("id", loan.user_id).maybeSingle();

  const cashOut = round2(Number(loan.amount_disbursed) + Number(loan.company_share));
  if (Number(welfare?.available_balance || 0) < cashOut) {
    await db.from("welfare_loans").update({ status: "pending" }).eq("id", loanId);
    return { disbursed: false, error: "Insufficient welfare balance to disburse this loan." };
  }

  const dueDate = new Date(Date.now() + LOAN_TERMS[loan.loan_type as WelfareLoanType].termDays * 86400000);

  // Take the company share out of the pool now. The cash sent to the member is
  // deducted when the B2C payout completes (process_withdrawal_completion), so we
  // must NOT deduct it twice here. The welfare share stays in the pool as income.
  await db.from("welfares").update({
    available_balance: round2(Math.max(0, Number(welfare!.available_balance || 0) - Number(loan.company_share))),
    current_amount: round2(Math.max(0, Number(welfare!.current_amount || 0) - Number(loan.company_share))),
  }).eq("id", loan.welfare_id);

  // Company revenue + ledger
  try {
    await db.rpc("record_company_earning", {
      p_source: "welfare_loan_commission",
      p_amount: Number(loan.company_share),
      p_group_id: loan.welfare_id,
      p_reference_id: loanId,
      p_description: `Welfare loan service charge (${(Number(loan.charge_rate) * 100).toFixed(1)}% total)`,
    });
  } catch (_e) { /* revenue logging best effort */ }


  try {
    await db.from("financial_ledger").insert({
      transaction_type: "loan_disbursement",
      source_type: "welfare",
      source_id: loan.welfare_id,
      reference_id: loanId,
      gross_amount: Number(loan.principal),
      commission_amount: Number(loan.company_share),
      net_amount: Number(loan.amount_disbursed),
      commission_rate: Number(loan.charge_rate),
      description: `Welfare loan disbursed (${loan.loan_type})`,
    });
  } catch (_e) { /* analytics only */ }

  // Create the payout record and send via B2C
  const { data: withdrawal, error: wErr } = await db
    .from("withdrawals")
    .insert({
      welfare_id: loan.welfare_id,
      requested_by: loan.user_id,
      amount: Number(loan.amount_disbursed),
      commission_amount: Number(loan.charge_amount),
      net_amount: Number(loan.amount_disbursed),
      status: "approved",
      reviewed_at: new Date().toISOString(),
      payment_method_type: "mpesa",
      metadata: { kind: "welfare_loan", loan_id: loanId },
      notes: `Welfare loan disbursement (${loan.loan_type})`,
    })
    .select("id")
    .single();
  if (wErr) throw wErr;

  await db.from("welfare_loans").update({
    status: "active",
    due_date: dueDate.toISOString(),
    disbursed_at: new Date().toISOString(),
    last_interest_at: new Date().toISOString(),
    withdrawal_id: withdrawal.id,
  }).eq("id", loanId);

  let payoutOk = false;
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/b2c-payout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({
        withdrawal_id: withdrawal.id,
        phone_number: prof?.phone,
        amount: Number(loan.amount_disbursed),
      }),
    });
    payoutOk = res.ok;
    if (!res.ok) console.error("Loan B2C payout failed:", await res.text());
  } catch (e) {
    console.error("Loan B2C payout threw:", (e as Error).message);
  }

  await createNotification(db, {
    userId: loan.user_id,
    title: "Loan approved",
    message: `Your ${LOAN_TERMS[loan.loan_type as WelfareLoanType].label} of KES ${Number(loan.principal).toLocaleString()} was approved. KES ${Number(loan.amount_disbursed).toLocaleString()} (less the M-Pesa fee) is on its way to your phone. Repay KES ${Number(loan.principal).toLocaleString()} by ${dueDate.toLocaleDateString("en-GB")}.`,
    type: "success",
    category: "welfare",
    relatedEntityId: loan.welfare_id,
    relatedEntityType: "welfare",
  });

  try {
    if (prof?.phone) {
      await db.functions.invoke("send-transactional-sms", {
        body: {
          phone: prof.phone,
          message: `Dear ${prof.full_name || "member"}, your loan of KES ${Number(loan.principal).toLocaleString()} from ${welfare?.name || "your welfare"} is approved. KES ${Number(loan.amount_disbursed).toLocaleString()} has been sent to your M-Pesa. Repay KES ${Number(loan.principal).toLocaleString()} on or before ${dueDate.toLocaleDateString("en-GB")} via Paybill 4015351.`,
          eventType: "welfare_loan_disbursed",
        },
      });
    }
  } catch (_e) { /* SMS best effort */ }

  return { disbursed: true, payout_started: payoutOk, withdrawal_id: withdrawal.id };
}
