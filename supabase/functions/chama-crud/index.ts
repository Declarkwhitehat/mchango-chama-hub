// supabase/functions/chama-crud/index.ts

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  try {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(supabaseUrl, supabaseServiceRoleKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await userClient.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json().catch(() => ({}));

    // 🧩 Check KYC status
    const { data: profile, error: profileError } = await userClient
      .from("profiles")
      .select("kyc_status")
      .eq("id", user.id)
      .single();

    if (profileError || profile?.kyc_status !== "approved") {
      return new Response(
        JSON.stringify({ error: "KYC approval required to create chama" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ✅ Validate required fields safely
    const { name, contribution_amount, contribution_frequency, max_members } = body ?? {};

    if (!name || !contribution_amount || !contribution_frequency || !max_members) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ✅ Normalize the name safely
    const normalizedName = (typeof name === "string" ? name.toLowerCase() : "");

    // ✅ Validate constraints
    const minMembers = body.min_members || 2;

    if (minMembers < 2) {
      return new Response(
        JSON.stringify({ error: "Minimum members must be at least 2" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (max_members > 200) {
      return new Response(
        JSON.stringify({ error: "Maximum members cannot exceed 200" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (max_members < minMembers) {
      return new Response(
        JSON.stringify({ error: "Maximum members cannot be less than minimum members" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ✅ Insert chama safely
    const { data: chama, error: chamaError } = await userClient
      .from("chamas")
      .insert([
        {
          name: normalizedName,
          contribution_amount,
          contribution_frequency,
          max_members,
          min_members: minMembers,
          created_by: user.id,
        },
      ])
      .select()
      .single();

    if (chamaError) {
      console.error("Chama insert error:", chamaError);
      return new Response(
        JSON.stringify({ error: "Failed to create chama", details: chamaError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ✅ Success response
    return new Response(
      JSON.stringify({ success: true, chama }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("Error in chama-crud:", err);
    return new Response(
      JSON.stringify({ error: err?.message || "Unknown error in chama-crud" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
