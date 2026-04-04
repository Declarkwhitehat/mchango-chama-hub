import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function getCycleLengthInDays(frequency: string, everyNDays?: number): number {
  switch (frequency) {
    case "daily":
      return 1;
    case "weekly":
      return 7;
    case "monthly":
      return 30;
    case "every_n_days":
      return everyNDays || 7;
    default:
      return 7;
  }
}

function throwIfError(error: unknown) {
  if (error) {
    throw error;
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === "object") {
    const errorObject = error as { message?: unknown; details?: unknown };

    if (typeof errorObject.message === "string" && errorObject.message.trim()) {
      return errorObject.message;
    }

    if (typeof errorObject.details === "string" && errorObject.details.trim()) {
      return errorObject.details;
    }
  }

  return "Unknown error occurred";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(
      JSON.stringify({ error: "Missing authorization header" }),
      {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: userError } = await supabase.auth.getUser(
    token,
  );

  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { chamaId } = await req.json();
    console.log("Starting new cycle for chama:", chamaId);

    // Get chama details
    const { data: chama, error: chamaError } = await supabase
      .from("chama")
      .select("*")
      .eq("id", chamaId)
      .single();

    throwIfError(chamaError);

    // Verify user is manager (allow 'removed' status since cycle_complete sets all to removed)
    const { data: membership } = await supabase
      .from("chama_members")
      .select("is_manager")
      .eq("chama_id", chamaId)
      .eq("user_id", user.id)
      .eq("is_manager", true)
      .in("status", ["active", "removed", "inactive"])
      .maybeSingle();

    if (!membership?.is_manager) {
      return new Response(
        JSON.stringify({ error: "Only managers can start new cycles" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Get all approved rejoin requests with profiles
    const { data: approvedRequests, error: requestsError } = await supabase
      .from("chama_rejoin_requests")
      .select("*, profiles!chama_rejoin_requests_user_id_fkey(*)")
      .eq("chama_id", chamaId)
      .eq("status", "approved");

    throwIfError(requestsError);

    if (
      !approvedRequests || approvedRequests.length < (chama.min_members || 2)
    ) {
      return new Response(
        JSON.stringify({
          error: `Need at least ${
            chama.min_members || 2
          } approved members to start new cycle. Currently have ${
            approvedRequests?.length || 0
          }`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.log(`Creating new cycle with ${approvedRequests.length} members`);

    // ========== CLEAN UP OLD CYCLE DATA ==========
    console.log("Cleaning up old cycle data...");

    // Get old cycle IDs for cleanup
    const { data: oldCycles } = await supabase
      .from("contribution_cycles")
      .select("id")
      .eq("chama_id", chamaId);

    const oldCycleIds = oldCycles?.map((c) => c.id) || [];

    // Delete old member_cycle_payments (depends on cycle IDs)
    if (oldCycleIds.length > 0) {
      const { error: deleteMemberPaymentsError } = await supabase
        .from("member_cycle_payments")
        .delete()
        .in("cycle_id", oldCycleIds);

      throwIfError(deleteMemberPaymentsError);
    }

    // Delete old chama_cycle_deficits
    const { error: deleteDeficitsError } = await supabase
      .from("chama_cycle_deficits")
      .delete()
      .eq("chama_id", chamaId);

    throwIfError(deleteDeficitsError);

    // Delete old chama_member_debts
    const { error: deleteDebtsError } = await supabase
      .from("chama_member_debts")
      .delete()
      .eq("chama_id", chamaId);

    throwIfError(deleteDebtsError);

    // Delete old payout_skips
    const { error: deletePayoutSkipsError } = await supabase
      .from("payout_skips")
      .delete()
      .eq("chama_id", chamaId);

    throwIfError(deletePayoutSkipsError);

    // Delete old contributions (payment records from previous cycle)
    const { error: deleteContributionsError } = await supabase
      .from("contributions")
      .delete()
      .eq("chama_id", chamaId);

    throwIfError(deleteContributionsError);

    // Delete old payout approval requests
    const { error: deletePayoutApprovalsError } = await supabase
      .from("payout_approval_requests")
      .delete()
      .eq("chama_id", chamaId);

    throwIfError(deletePayoutApprovalsError);

    // Delete old withdrawals
    const { error: deleteWithdrawalsError } = await supabase
      .from("withdrawals")
      .delete()
      .eq("chama_id", chamaId);

    throwIfError(deleteWithdrawalsError);

    // Delete old contribution_cycles
    const { error: deleteCyclesError } = await supabase
      .from("contribution_cycles")
      .delete()
      .eq("chama_id", chamaId);

    throwIfError(deleteCyclesError);

    // Clean up old chama_member_removals
    const { error: deleteRemovalsError } = await supabase
      .from("chama_member_removals")
      .delete()
      .eq("chama_id", chamaId);

    throwIfError(deleteRemovalsError);

    // Break foreign-key links to previous cycle members before removing those member rows
    const { error: clearPreviousMemberRefsError } = await supabase
      .from("chama_rejoin_requests")
      .update({ previous_member_id: null })
      .eq("chama_id", chamaId);

    throwIfError(clearPreviousMemberRefsError);

    console.log("Old cycle data cleaned up.");

    // ========== DELETE OLD MEMBERS ==========
    const { error: deleteOldMembersError } = await supabase
      .from("chama_members")
      .delete()
      .eq("chama_id", chamaId)
      .in("status", ["active", "removed", "inactive"]);

    throwIfError(deleteOldMembersError);

    // Find manager ID (the user starting the cycle is the manager)
    const managerId = user.id;

    // Create random order indices
    const memberCount = approvedRequests.length;
    const randomIndices = shuffleArray(
      [...Array(memberCount)].map((_, i) => i + 1),
    );

    // Ensure manager gets first position
    const managerRequestIndex = approvedRequests.findIndex((req) =>
      req.user_id === managerId
    );
    if (managerRequestIndex !== -1) {
      const managerIndexPosition = randomIndices.indexOf(1);
      [
        randomIndices[managerRequestIndex],
        randomIndices[managerIndexPosition],
      ] = [
        randomIndices[managerIndexPosition],
        randomIndices[managerRequestIndex],
      ];
    }

    // Generate unique member codes
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const generateUniqueSuffix = async (existingCodes: Set<string>) => {
      for (let attempt = 0; attempt < 20; attempt++) {
        let suffix = "";
        for (let i = 0; i < 4; i++) {
          suffix += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        const fullCode = chama.group_code + suffix;
        if (!existingCodes.has(fullCode)) {
          existingCodes.add(fullCode);
          return fullCode;
        }
      }
      return chama.group_code + Date.now().toString(36).toUpperCase().slice(-4);
    };

    const existingCodes = new Set<string>();
    const memberCodes = await Promise.all(
      approvedRequests.map(() => generateUniqueSuffix(existingCodes)),
    );

    // Create new member records with clean data
    const newMembers = approvedRequests.map((req, idx) => ({
      chama_id: chamaId,
      user_id: req.user_id,
      order_index: randomIndices[idx],
      is_manager: req.user_id === managerId,
      status: "active",
      approval_status: "approved",
      member_code: memberCodes[idx],
      missed_payments_count: 0,
      balance_deficit: 0,
      balance_credit: 0,
      total_contributed: 0,
      carry_forward_credit: 0,
      next_cycle_credit: 0,
    }));

    const { data: insertedMembers, error: insertError } = await supabase
      .from("chama_members")
      .insert(newMembers)
      .select("*, profiles!chama_members_user_id_fkey(*)");

    throwIfError(insertError);

    const createdMembers = insertedMembers ?? [];

    if (createdMembers.length === 0) {
      throw new Error("Failed to create members for the new cycle");
    }

    // ========== RESET CHAMA TO BRAND NEW ==========
    const startDate = new Date();

    const { error: updateError } = await supabase
      .from("chama")
      .update({
        current_cycle_round: 1,
        accepting_rejoin_requests: false,
        status: "active",
        start_date: startDate.toISOString(),
        total_gross_collected: 0,
        total_commission_paid: 0,
        available_balance: 0,
        total_withdrawn: 0,
        updated_at: startDate.toISOString(),
      })
      .eq("id", chamaId);

    throwIfError(updateError);

    // ========== CALCULATE GRACE PERIOD (24hrs, cutoff at 22:00) ==========
    const graceDeadline = new Date(startDate);
    graceDeadline.setDate(graceDeadline.getDate() + 1);
    graceDeadline.setHours(22, 0, 0, 0);

    // ========== CREATE FIRST CONTRIBUTION CYCLE ==========
    const cycleLength = getCycleLengthInDays(
      chama.contribution_frequency,
      chama.every_n_days_count,
    );

    const normalCycleEndDate = calculateCycleEndDate(
      startDate,
      chama.contribution_frequency,
      chama.every_n_days_count,
      chama.monthly_contribution_day,
      chama.monthly_contribution_day_2,
    );
    // Ensure first cycle end is at least the grace deadline
    const cycleEndDate = normalCycleEndDate > graceDeadline ? normalCycleEndDate : graceDeadline;

    // Sort members by order_index to find first beneficiary
    const sortedMembers = [...createdMembers].sort((a, b) => a.order_index - b.order_index);

    console.log("Creating first contribution cycle with grace period until:", graceDeadline.toISOString());

    const { data: firstCycle, error: cycleCreateError } = await supabase
      .from("contribution_cycles")
      .insert({
        chama_id: chamaId,
        cycle_number: 1,
        start_date: startDate.toISOString(),
        end_date: cycleEndDate.toISOString(),
        due_amount: chama.contribution_amount,
        beneficiary_member_id: sortedMembers[0]?.id || null,
        total_expected_amount: chama.contribution_amount * sortedMembers.length,
        total_collected_amount: 0,
        members_paid_count: 0,
        members_skipped_count: 0,
      })
      .select()
      .single();

    throwIfError(cycleCreateError);

    // ========== CREATE MEMBER CYCLE PAYMENTS ==========
    if (firstCycle) {
      const memberPayments = sortedMembers.map((member) => ({
        member_id: member.id,
        cycle_id: firstCycle.id,
        amount_due: chama.contribution_amount,
        amount_paid: 0,
        amount_remaining: chama.contribution_amount,
        is_paid: false,
        fully_paid: false,
        is_late_payment: false,
        payment_allocations: [],
      }));

      const { error: paymentsError } = await supabase
        .from("member_cycle_payments")
        .insert(memberPayments);

      if (paymentsError) {
        console.error("Error creating member cycle payments:", paymentsError);
      } else {
        console.log(`Created ${memberPayments.length} member_cycle_payments for cycle 1`);
      }
    }

    // Mark rejoin requests as processed
    const { error: requestUpdateError } = await supabase
      .from("chama_rejoin_requests")
      .delete()
      .eq("chama_id", chamaId);

    if (requestUpdateError) {
      console.error("Error cleaning up requests:", requestUpdateError);
    }

    // Send SMS notifications with grace period info
    const graceDeadlineStr = graceDeadline.toLocaleDateString("en-US", {
      weekday: "long",
      day: "numeric",
      month: "short",
      year: "numeric",
    });

    const smsPromises = sortedMembers.map(async (member) => {
      const payoutDate = new Date(startDate);
      payoutDate.setDate(
        payoutDate.getDate() + (member.order_index - 1) * cycleLength,
      );

      const message =
        `🔄 New cycle started for "${chama.name}"! You're member #${member.order_index}. You have a 24hr grace period - first payment of KES ${chama.contribution_amount.toLocaleString()} is due by ${graceDeadlineStr} at 10:00 PM. Your payout date: ${payoutDate.toLocaleDateString()}. Good luck! 🎯`;

      try {
        await supabase.functions.invoke("send-transactional-sms", {
          body: {
            phone: member.profiles.phone,
            message,
            eventType: "new_cycle_started",
          },
        });
        return { success: true, phone: member.profiles.phone };
      } catch (error) {
        console.error(
          `Failed to send SMS to ${member.profiles.phone}:`,
          error,
        );
        return { success: false, phone: member.profiles.phone, error };
      }
    });

    const smsResults = await Promise.all(smsPromises);
    const successCount = smsResults.filter((r) => r.success).length;

    console.log(
      `New cycle started FRESH. Sent ${successCount}/${createdMembers.length} SMS notifications`,
    );

    return new Response(
      JSON.stringify({
        success: true,
        memberCount: createdMembers.length,
        cycleRound: 1,
        notificationsSent: successCount,
        firstCycleId: firstCycle?.id || null,
        graceDeadline: graceDeadline.toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error starting new cycle:", error);
    const errorMessage = getErrorMessage(error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
