import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Authenticate user
    const authHeader = req.headers.get("Authorization")!;
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { groupId } = await req.json();

    if (!groupId) {
      return new Response(JSON.stringify({ error: "Missing groupId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify user is manager
    const { data: group, error: groupError } = await supabase
      .from("saving_groups")
      .select("*")
      .eq("id", groupId)
      .eq("manager_id", user.id)
      .single();

    if (groupError || !group) {
      return new Response(
        JSON.stringify({ error: "Unauthorized or group not found" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get all active members with profiles
    const { data: members, error: membersError } = await supabase
      .from("saving_group_members")
      .select(`
        *,
        profiles:user_id (
          full_name,
          phone
        )
      `)
      .eq("group_id", groupId)
      .eq("status", "active");

    if (membersError) throw membersError;

    // Send SMS to each member
    let notificationsSent = 0;
    for (const member of members || []) {
      const memberName = member.profiles?.full_name || "Member";
      const memberPhone = member.profiles?.phone;

      if (memberPhone) {
        const message = `Hello ${memberName}! Your Savings Group "${group.name}" has started. Your member ID: ${member.id.substring(0, 8)}. Monthly target: KES 2,000. Start saving today!`;

        try {
          await supabase.functions.invoke("send-transactional-sms", {
            body: {
              phone: memberPhone,
              message,
              eventType: "savings_group_started",
            },
          });
          notificationsSent++;
        } catch (error) {
          console.error(`Failed to send SMS to ${memberPhone}:`, error);
        }
      }
    }

    // Update group status
    await supabase
      .from("saving_groups")
      .update({ status: "active" })
      .eq("id", groupId);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Group started successfully",
        notificationsSent,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error starting group:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
