// chama-wallet-sweep: drains chama_overpayment_wallet for every member of a
// chama that has reached cycle_complete. Per v2 spec:
//   balance > 10  → floor to KES, send via B2C (if member has mpesa default).
//                   sub-shilling + fee.companyRevenue → company_earnings.
//                   No mpesa default → entire balance → company_earnings.
//   balance ≤ 10  → 100% to company_earnings (below payout threshold).
// Idempotent: rows are marked status='swept' after handling; re-invocation skips them.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { corsHeaders } from "../_shared/cors.ts";
import { getMpesaTransactionFee } from "../_shared/mpesaTransactionFee.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const celcomApiKey = Deno.env.get("CELCOM_API_KEY");
const celcomPartnerId = Deno.env.get("CELCOM_PARTNER_ID");
const celcomShortcode = Deno.env.get("CELCOM_SHORTCODE");

async function sendSMS(phone: string, message: string) {
  if (!phone || !celcomApiKey || !celcomPartnerId || !celcomShortcode) return;
  try {
    await fetch("https://api.celcomafrica.com/v1/sms/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${celcomApiKey}`,
      },
      body: JSON.stringify({
        partnerID: celcomPartnerId,
        shortCode: celcomShortcode,
        mobile: phone.startsWith("254") ? phone : `254${phone.replace(/^0+/, "")}`,
        message,
      }),
    });
  } catch (e) {
    console.error("[wallet-sweep] sms failed:", (e as Error)?.message);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Caller must be service-role (called from cycle-auto-create or admin)
    const auth = req.headers.get("Authorization") || "";
    const bearer = auth.replace(/^Bearer\s+/i, "").trim();
    if (bearer !== supabaseServiceKey) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { chamaId } = await req.json();
    if (!chamaId) {
      return new Response(JSON.stringify({ error: "chamaId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Load chama
    const { data: chama } = await supabase
      .from("chama")
      .select("id, name, status")
      .eq("id", chamaId)
      .maybeSingle();
    if (!chama) {
      return new Response(JSON.stringify({ error: "Chama not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Aggregate pending wallet balances per member (idempotent: only status='pending')
    const { data: walletRows, error: walletErr } = await supabase
      .from("chama_overpayment_wallet")
      .select("id, member_id, amount")
      .eq("chama_id", chamaId)
      .eq("status", "pending");

    if (walletErr) throw walletErr;

    if (!walletRows || walletRows.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No pending wallet balances to sweep", swept: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Group by member
    const byMember = new Map<string, { balance: number; rowIds: string[] }>();
    for (const r of walletRows) {
      const cur = byMember.get(r.member_id) || { balance: 0, rowIds: [] };
      cur.balance += Number(r.amount || 0);
      cur.rowIds.push(r.id);
      byMember.set(r.member_id, cur);
    }

    const results: any[] = [];

    for (const [memberId, bucket] of byMember.entries()) {
      const balance = Number(bucket.balance.toFixed(2));
      if (balance <= 0) {
        // Just close out rows
        await supabase
          .from("chama_overpayment_wallet")
          .update({ status: "swept", applied_at: new Date().toISOString() })
          .in("id", bucket.rowIds);
        continue;
      }

      // Resolve member, user, payment method, phone
      const { data: member } = await supabase
        .from("chama_members")
        .select("id, member_code, user_id")
        .eq("id", memberId)
        .maybeSingle();

      let memberPhone = "";
      let mpesaPaymentMethod: any = null;
      if (member?.user_id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("phone")
          .eq("id", member.user_id)
          .maybeSingle();
        memberPhone = profile?.phone || "";

        const { data: pm } = await supabase
          .from("payment_methods")
          .select("id, method_type, phone_number")
          .eq("user_id", member.user_id)
          .eq("is_default", true)
          .eq("method_type", "mpesa")
          .maybeSingle();
        mpesaPaymentMethod = pm || null;
      }

      // Decide path
      if (balance > 10 && mpesaPaymentMethod?.phone_number && member?.user_id) {
        const floorKes = Math.floor(balance);
        const subShilling = Number((balance - floorKes).toFixed(2));
        const fee = getMpesaTransactionFee(floorKes);
        const netToMember = floorKes - fee.transactionFee;

        if (netToMember <= 0) {
          // After fee, nothing left — forfeit entire balance to company
          await supabase.from("company_earnings").insert({
            source: "chama_wallet_forfeit",
            amount: balance,
            group_id: chamaId,
            description: `End-of-chama wallet forfeit (net after fee <= 0) — member ${member.member_code}`,
          });
          if (memberPhone) {
            await sendSMS(
              memberPhone,
              `"${chama.name}" has ended. Your remaining wallet balance of KES ${balance.toFixed(2)} was below the M-Pesa payout threshold after fees and absorbed by the platform.`,
            );
          }
        } else {
          // Create approved withdrawal and fire B2C
          const { data: withdrawal, error: wErr } = await supabase
            .from("withdrawals")
            .insert({
              chama_id: chamaId,
              requested_by: member.user_id,
              amount: floorKes,
              commission_amount: 0,
              net_amount: netToMember,
              transaction_fee: fee.transactionFee,
              safaricom_cost: fee.safaricomCost,
              company_revenue: fee.companyRevenue,
              status: "approved",
              reviewed_at: new Date().toISOString(),
              payment_method_id: mpesaPaymentMethod.id,
              payment_method_type: "mpesa",
              notes: `End-of-chama wallet sweep — member ${member.member_code} (balance KES ${balance.toFixed(2)})`,
              requested_at: new Date().toISOString(),
              b2c_attempt_count: 0,
              metadata: {
                kind: "chama_wallet_sweep",
                chama_id: chamaId,
                member_id: memberId,
                gross_balance: balance,
                sub_shilling_remainder: subShilling,
                source_wallet_ids: bucket.rowIds,
              },
            })
            .select("id")
            .single();

          if (wErr || !withdrawal) {
            console.error("[wallet-sweep] withdrawal insert failed:", wErr?.message);
            continue;
          }

          // Record sub-shilling + company markup as earnings now (B2C fee revenue
          // is also recorded by b2c-callback; we only record sub-shilling here.)
          if (subShilling > 0) {
            await supabase.from("company_earnings").insert({
              source: "chama_wallet_subshilling",
              amount: subShilling,
              group_id: chamaId,
              reference_id: withdrawal.id,
              description: `End-of-chama sub-shilling shed from KES ${balance.toFixed(2)} → KES ${floorKes}`,
            });
          }

          // Fire B2C
          try {
            await fetch(`${supabaseUrl}/functions/v1/b2c-payout`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${supabaseServiceKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                withdrawal_id: withdrawal.id,
                phone_number: mpesaPaymentMethod.phone_number,
                amount: netToMember,
              }),
            });
          } catch (b2cErr) {
            console.error("[wallet-sweep] b2c invoke failed:", (b2cErr as Error)?.message);
          }

          if (memberPhone) {
            await sendSMS(
              memberPhone,
              `Your final wallet balance of KES ${netToMember} from "${chama.name}" is being sent to M-Pesa. Mpesa Ref will follow shortly.`,
            );
          }

          results.push({ memberId, action: "b2c", net: netToMember, gross: balance });
        }
      } else {
        // Forfeit path: ≤10, or no mpesa default
        await supabase.from("company_earnings").insert({
          source: "chama_wallet_forfeit",
          amount: balance,
          group_id: chamaId,
          description: `End-of-chama wallet forfeit (${balance <= 10 ? "below KES 10 threshold" : "no mpesa payment method"}) — member ${member?.member_code || memberId}`,
        });
        if (memberPhone) {
          await sendSMS(
            memberPhone,
            `"${chama.name}" has ended. Your remaining wallet balance of KES ${balance.toFixed(2)} was below the KES 10 payout threshold and absorbed by the platform.`,
          );
        }
        results.push({ memberId, action: "forfeit", amount: balance });
      }

      // Mark wallet rows swept regardless of path
      await supabase
        .from("chama_overpayment_wallet")
        .update({ status: "swept", applied_at: new Date().toISOString() })
        .in("id", bucket.rowIds);
    }

    return new Response(
      JSON.stringify({ success: true, swept: results.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[wallet-sweep] error:", (err as Error)?.message);
    return new Response(JSON.stringify({ error: (err as Error)?.message || "unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
