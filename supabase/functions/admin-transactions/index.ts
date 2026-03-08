import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    // Verify caller is admin
    const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const search = (body.search || "").toLowerCase();
    const limit = body.limit || 100;

    // Fetch from all payment tables in parallel
    const [orgDonations, mchangoDonations, welfareContribs, chamaContribs] = await Promise.all([
      supabaseAdmin
        .from("organization_donations")
        .select("id, amount, gross_amount, commission_amount, net_amount, payment_status, payment_reference, mpesa_receipt_number, created_at, completed_at, display_name, phone, email, organization_id, payment_method, organizations(name)")
        .order("created_at", { ascending: false })
        .limit(limit),

      supabaseAdmin
        .from("mchango_donations")
        .select("id, amount, gross_amount, commission_amount, net_amount, payment_status, payment_reference, mpesa_receipt_number, created_at, completed_at, display_name, phone, email, mchango_id, payment_method, mchango(title)")
        .order("created_at", { ascending: false })
        .limit(limit),

      supabaseAdmin
        .from("welfare_contributions")
        .select("id, gross_amount, commission_amount, net_amount, payment_status, payment_reference, mpesa_receipt_number, created_at, completed_at, user_id, welfare_id, payment_method, welfares(name), profiles:user_id(full_name, phone, email)")
        .order("created_at", { ascending: false })
        .limit(limit),

      supabaseAdmin
        .from("contributions")
        .select("id, amount, status, payment_reference, mpesa_receipt_number, created_at, chama_id, member_id, chama(name), chama_members!contributions_member_id_fkey(user_id, profiles:user_id(full_name, phone, email))")
        .order("created_at", { ascending: false })
        .limit(limit),
    ]);

    const unified: any[] = [];

    // Organization donations
    for (const d of orgDonations.data || []) {
      unified.push({
        id: d.id,
        source: "Organization",
        source_name: (d as any).organizations?.name || "Unknown",
        transaction_type: "donation",
        amount: d.gross_amount || d.amount,
        commission: d.commission_amount || 0,
        net_amount: d.net_amount || d.amount,
        status: d.payment_status,
        payment_reference: d.payment_reference,
        mpesa_receipt: d.mpesa_receipt_number,
        payment_method: d.payment_method,
        created_at: d.created_at,
        completed_at: d.completed_at,
        user_name: d.display_name || "Anonymous",
        user_phone: d.phone,
        user_email: d.email,
        entity_id: d.organization_id,
      });
    }

    // Mchango donations
    for (const d of mchangoDonations.data || []) {
      unified.push({
        id: d.id,
        source: "Mchango",
        source_name: (d as any).mchango?.title || "Unknown",
        transaction_type: "donation",
        amount: d.gross_amount || d.amount,
        commission: d.commission_amount || 0,
        net_amount: d.net_amount || d.amount,
        status: d.payment_status,
        payment_reference: d.payment_reference,
        mpesa_receipt: d.mpesa_receipt_number,
        payment_method: d.payment_method,
        created_at: d.created_at,
        completed_at: d.completed_at,
        user_name: d.display_name || "Anonymous",
        user_phone: d.phone,
        user_email: d.email,
        entity_id: d.mchango_id,
      });
    }

    // Welfare contributions
    for (const w of welfareContribs.data || []) {
      const profile = (w as any).profiles;
      unified.push({
        id: w.id,
        source: "Welfare",
        source_name: (w as any).welfares?.name || "Unknown",
        transaction_type: "contribution",
        amount: w.gross_amount,
        commission: w.commission_amount || 0,
        net_amount: w.net_amount,
        status: w.payment_status,
        payment_reference: w.payment_reference,
        mpesa_receipt: w.mpesa_receipt_number,
        payment_method: w.payment_method,
        created_at: w.created_at,
        completed_at: w.completed_at,
        user_name: profile?.full_name || "Unknown",
        user_phone: profile?.phone,
        user_email: profile?.email,
        user_id: w.user_id,
        entity_id: w.welfare_id,
      });
    }

    // Chama contributions
    for (const c of chamaContribs.data || []) {
      const member = (c as any).chama_members;
      const profile = member?.profiles;
      unified.push({
        id: c.id,
        source: "Chama",
        source_name: (c as any).chama?.name || "Unknown",
        transaction_type: "contribution",
        amount: c.amount,
        commission: 0,
        net_amount: c.amount,
        status: c.status,
        payment_reference: c.payment_reference,
        mpesa_receipt: c.mpesa_receipt_number,
        created_at: c.created_at,
        completed_at: null,
        user_name: profile?.full_name || "Unknown",
        user_phone: profile?.phone,
        user_email: profile?.email,
        user_id: member?.user_id,
        entity_id: c.chama_id,
      });
    }

    // Sort by created_at descending
    unified.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    // Apply search filter
    let filtered = unified;
    if (search) {
      filtered = unified.filter((tx) => {
        const phone = tx.user_phone ? `+${tx.user_phone}` : "";
        return (
          (tx.user_name || "").toLowerCase().includes(search) ||
          (tx.user_email || "").toLowerCase().includes(search) ||
          phone.includes(search) ||
          (tx.user_phone || "").includes(search) ||
          (tx.payment_reference || "").toLowerCase().includes(search) ||
          (tx.mpesa_receipt || "").toLowerCase().includes(search) ||
          (tx.source || "").toLowerCase().includes(search) ||
          (tx.source_name || "").toLowerCase().includes(search) ||
          (tx.transaction_type || "").toLowerCase().includes(search)
        );
      });
    }

    return new Response(
      JSON.stringify({ transactions: filtered.slice(0, limit), total: filtered.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("admin-transactions error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
