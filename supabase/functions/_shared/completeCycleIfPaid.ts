// Shared chama cycle completion routine.
//
// Single place where "every member has paid → create the payout → close the
// cycle → open the next one" happens. Every payment path (online STK, offline
// C2B, in-app contribution, scheduled cron) must call this so a cycle can never
// end up fully paid but silently un-paid-out.
//
// Idempotency: claim_cycle_for_processing() atomically flips payout_processed,
// and withdrawals has a unique constraint per cycle — retries are safe.

export interface CompleteCycleResult {
  completed: boolean;
  reason?: string;
  cycleId?: string;
  withdrawalId?: string;
  amount?: number;
}

export async function completeCycleIfAllPaid(
  supabase: any,
  chamaId: string,
): Promise<CompleteCycleResult> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  try {
    const nowIso = new Date().toISOString();

    // Current cycle awaiting payout (is_complete is deliberately ignored —
    // completion is only meaningful once the payout exists).
    let { data: cycle } = await supabase
      .from("contribution_cycles")
      .select("*")
      .eq("chama_id", chamaId)
      .eq("payout_processed", false)
      .lte("start_date", nowIso)
      .gte("end_date", nowIso)
      .order("cycle_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!cycle) {
      const { data: overdue } = await supabase
        .from("contribution_cycles")
        .select("*")
        .eq("chama_id", chamaId)
        .eq("payout_processed", false)
        .lt("end_date", nowIso)
        .order("cycle_number", { ascending: true })
        .limit(1)
        .maybeSingle();
      cycle = overdue;
    }

    if (!cycle) return { completed: false, reason: "no_open_cycle" };

    const { data: payments } = await supabase
      .from("member_cycle_payments")
      .select("is_paid, fully_paid, is_late_payment")
      .eq("cycle_id", cycle.id);

    const totalMembers = payments?.length || 0;
    const paidCount =
      payments?.filter((p: any) => (p.fully_paid ?? p.is_paid) === true).length || 0;
    if (totalMembers === 0 || paidCount < totalMembers) {
      return { completed: false, reason: "not_all_paid", cycleId: cycle.id };
    }

    // Duplicate payout guard
    const { data: existingPayout } = await supabase
      .from("withdrawals")
      .select("id")
      .eq("chama_id", chamaId)
      .eq("cycle_id", cycle.id)
      .not("status", "in", '("rejected","failed")')
      .maybeSingle();

    if (existingPayout) {
      return { completed: false, reason: "payout_exists", cycleId: cycle.id };
    }

    const { data: claimed } = await supabase.rpc("claim_cycle_for_processing", {
      p_cycle_id: cycle.id,
    });
    if (!claimed) return { completed: false, reason: "already_claimed", cycleId: cycle.id };

    const { data: chamaData } = await supabase
      .from("chama")
      .select("id, name, contribution_amount, available_balance")
      .eq("id", chamaId)
      .single();

    const { data: beneficiary } = await supabase
      .from("chama_members")
      .select("id, user_id, member_code, missed_payments_count, requires_admin_verification")
      .eq("id", cycle.beneficiary_member_id)
      .single();

    if (!chamaData || !beneficiary) {
      return { completed: false, reason: "missing_beneficiary", cycleId: cycle.id };
    }

    // Pool is already net of commission (deducted per contribution at settlement).
    const netPayoutAmount = Number(chamaData.available_balance || 0);

    const { data: paymentMethod } = await supabase
      .from("payment_methods")
      .select("*")
      .eq("user_id", beneficiary.user_id)
      .eq("is_default", true)
      .maybeSingle();

    if (!paymentMethod) {
      return { completed: false, reason: "no_payment_method", cycleId: cycle.id };
    }

    const canAutoApprove =
      paymentMethod.method_type === "mpesa" &&
      !beneficiary.requires_admin_verification &&
      (beneficiary.missed_payments_count || 0) === 0 &&
      netPayoutAmount > 0;

    const { data: newWithdrawal, error: withdrawalError } = await supabase
      .from("withdrawals")
      .insert({
        chama_id: chamaId,
        cycle_id: cycle.id,
        requested_by: beneficiary.user_id,
        amount: netPayoutAmount,
        commission_amount: 0,
        net_amount: netPayoutAmount,
        status: canAutoApprove ? "approved" : "pending",
        payment_method_id: paymentMethod.id,
        payment_method_type: paymentMethod.method_type,
        notes: `Automatic immediate payout - all ${totalMembers} members paid`,
        requested_at: new Date().toISOString(),
        b2c_attempt_count: 0,
        ...(canAutoApprove ? { reviewed_at: new Date().toISOString() } : {}),
      })
      .select("id")
      .single();

    if (withdrawalError) {
      console.error("completeCycleIfAllPaid withdrawal error:", withdrawalError);
      return { completed: false, reason: "withdrawal_failed", cycleId: cycle.id };
    }

    await supabase
      .from("contribution_cycles")
      .update({
        is_complete: true,
        payout_processed_at: new Date().toISOString(),
        payout_amount: netPayoutAmount,
        payout_type: "full",
        members_paid_count: totalMembers,
        total_collected_amount: netPayoutAmount,
      })
      .eq("id", cycle.id);

    // Advance to the next cycle through the shared idempotent creator.
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/cycle-auto-create`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ chamaId, lastCycleId: cycle.id }),
      });
      if (!res.ok) console.error("next-cycle creation failed:", await res.text());
    } catch (e) {
      console.error("next-cycle dispatch failed:", (e as Error)?.message);
    }

    // Notify + send the money
    const { data: beneficiaryProfile } = await supabase
      .from("profiles")
      .select("full_name, phone")
      .eq("id", beneficiary.user_id)
      .maybeSingle();

    await supabase.from("notifications").insert({
      user_id: beneficiary.user_id,
      title: "Payout ready",
      message: `All members have paid. Your payout of KES ${Math.round(
        netPayoutAmount,
      ).toLocaleString()} from "${chamaData.name}" ${
        canAutoApprove ? "is being sent to your M-Pesa" : "requires admin approval"
      }.`,
      type: "success",
      category: "withdrawal",
    });

    if (canAutoApprove && paymentMethod.phone_number) {
      const phone = beneficiaryProfile?.phone || paymentMethod.phone_number;
      if (phone) {
        try {
          await supabase.functions.invoke("send-transactional-sms", {
            body: {
              phone,
              message: `All members have paid for "${chamaData.name}". Your payout of KES ${Math.round(
                netPayoutAmount,
              ).toLocaleString()} is being processed now.\nSTOP 4569*5#`,
              eventType: "chama_payout_processing",
            },
          });
        } catch (_e) { /* non-critical */ }
      }

      try {
        const b2cRes = await fetch(`${supabaseUrl}/functions/v1/b2c-payout`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            withdrawal_id: newWithdrawal.id,
            phone_number: paymentMethod.phone_number,
            amount: netPayoutAmount,
          }),
        });
        const b2cResult = await b2cRes.json();
        if (!b2cRes.ok || !b2cResult.success) {
          await supabase
            .from("withdrawals")
            .update({
              status: "pending_retry",
              b2c_attempt_count: 1,
              last_b2c_attempt_at: new Date().toISOString(),
              b2c_error_details: { error: b2cResult?.error || "B2C initiation failed" },
            })
            .eq("id", newWithdrawal.id);
        }
      } catch (e) {
        console.error("B2C request error:", (e as Error)?.message);
      }
    }

    return {
      completed: true,
      cycleId: cycle.id,
      withdrawalId: newWithdrawal.id,
      amount: netPayoutAmount,
    };
  } catch (e) {
    console.error("completeCycleIfAllPaid failed:", (e as Error)?.message);
    return { completed: false, reason: "error" };
  }
}
