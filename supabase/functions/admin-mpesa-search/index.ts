import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: authError } = await adminClient.auth.getUser(token);
    if (authError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = userData.user.id;

    // Verify admin role
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { transaction_id } = await req.json();
    if (!transaction_id || typeof transaction_id !== "string" || transaction_id.trim().length === 0) {
      return new Response(JSON.stringify({ error: "Transaction ID is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const searchId = transaction_id.trim().toUpperCase();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Search all three tables in parallel
    const [transactionsRes, mchangoRes, orgRes] = await Promise.all([
      adminClient
        .from("transactions")
        .select("id, payment_reference, amount, status, created_at, chama_id, mchango_id")
        .eq("payment_reference", searchId)
        .gte("created_at", thirtyDaysAgo),
      adminClient
        .from("mchango_donations")
        .select("id, payment_reference, amount, payment_status, created_at, completed_at, mchango_id, display_name, phone")
        .eq("payment_reference", searchId)
        .gte("created_at", thirtyDaysAgo),
      adminClient
        .from("organization_donations")
        .select("id, payment_reference, amount, payment_status, created_at, completed_at, organization_id, display_name, phone")
        .eq("payment_reference", searchId)
        .gte("created_at", thirtyDaysAgo),
    ]);

    const results: any[] = [];

    // Process transactions (Chama contributions)
    if (transactionsRes.data && transactionsRes.data.length > 0) {
      for (const tx of transactionsRes.data) {
        let destinationName = "Unknown";
        let destinationType = "Chama";

        if (tx.chama_id) {
          const { data: chama } = await adminClient
            .from("chama")
            .select("name")
            .eq("id", tx.chama_id)
            .maybeSingle();
          destinationName = chama?.name || "Unknown Chama";
          destinationType = "Chama";
        } else if (tx.mchango_id) {
          const { data: mchango } = await adminClient
            .from("mchango")
            .select("title")
            .eq("id", tx.mchango_id)
            .maybeSingle();
          destinationName = mchango?.title || "Unknown Campaign";
          destinationType = "Campaign";
        }

        const dt = new Date(tx.created_at);
        results.push({
          transaction_id: tx.payment_reference,
          date: dt.toISOString().split("T")[0],
          time: dt.toTimeString().split(" ")[0],
          amount: tx.amount,
          destination_type: destinationType,
          destination_name: destinationName,
          status: tx.status,
          source_table: "transactions",
        });
      }
    }

    // Process mchango donations
    if (mchangoRes.data && mchangoRes.data.length > 0) {
      for (const d of mchangoRes.data) {
        const { data: mchango } = await adminClient
          .from("mchango")
          .select("title")
          .eq("id", d.mchango_id)
          .maybeSingle();

        const dt = new Date(d.completed_at || d.created_at);
        results.push({
          transaction_id: d.payment_reference,
          date: dt.toISOString().split("T")[0],
          time: dt.toTimeString().split(" ")[0],
          amount: d.amount,
          destination_type: "Campaign",
          destination_name: mchango?.title || "Unknown Campaign",
          status: d.payment_status,
          sender: d.display_name || d.phone || "Anonymous",
          source_table: "mchango_donations",
        });
      }
    }

    // Process organization donations
    if (orgRes.data && orgRes.data.length > 0) {
      for (const d of orgRes.data) {
        const { data: org } = await adminClient
          .from("organizations")
          .select("name")
          .eq("id", d.organization_id)
          .maybeSingle();

        const dt = new Date(d.completed_at || d.created_at);
        results.push({
          transaction_id: d.payment_reference,
          date: dt.toISOString().split("T")[0],
          time: dt.toTimeString().split(" ")[0],
          amount: d.amount,
          destination_type: "Organization",
          destination_name: org?.name || "Unknown Organization",
          status: d.payment_status,
          sender: d.display_name || d.phone || "Anonymous",
          source_table: "organization_donations",
        });
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Admin M-Pesa search error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
