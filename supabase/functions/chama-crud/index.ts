// supabase/functions/chama-crud/index.ts

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle GET request
    if (req.method === "GET") {
      const url = new URL(req.url);
      const id = url.searchParams.get("id");
      const slug = url.searchParams.get("slug");

      if (!id && !slug) {
        return new Response(
          JSON.stringify({ error: "ID or slug required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let query = supabaseClient
        .from("chama")
        .select(`
          *,
          chama_members (
            id,
            user_id,
            is_manager,
            member_code,
            order_index,
            status,
            approval_status,
            joined_at,
            profiles (full_name)
          )
        `);

      if (id) {
        query = query.eq("id", id);
      } else if (slug) {
        query = query.eq("slug", slug);
      }

      const { data, error } = await query.maybeSingle();

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ data }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle POST request (create chama)
    if (req.method === "POST") {
      const body = await req.json();

      // Check KYC status
      const { data: profile } = await supabaseClient
        .from("profiles")
        .select("kyc_status")
        .eq("id", user.id)
        .single();

      if (profile?.kyc_status !== "approved") {
        return new Response(
          JSON.stringify({ error: "KYC approval required" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { name, description, contribution_amount, contribution_frequency, max_members, min_members, is_public, payout_order, whatsapp_link, every_n_days_count } = body;

      if (!name || !contribution_amount || !contribution_frequency || !max_members) {
        return new Response(
          JSON.stringify({ error: "Missing required fields" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const minMembersValue = min_members || 2;
      if (minMembersValue < 2 || max_members > 200 || max_members < minMembersValue) {
        return new Response(
          JSON.stringify({ error: "Invalid member limits" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Generate slug from name
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

      const { data: chama, error: insertError } = await supabaseClient
        .from("chama")
        .insert({
          name,
          slug,
          description,
          contribution_amount,
          contribution_frequency,
          every_n_days_count,
          max_members,
          min_members: minMembersValue,
          is_public: is_public ?? true,
          payout_order: payout_order || "join_date",
          whatsapp_link,
          created_by: user.id,
          commission_rate: 0.05,
          status: "active"
        })
        .select()
        .single();

      if (insertError) {
        return new Response(
          JSON.stringify({ error: insertError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ data: chama }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
