import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";
import { corsHeaders } from "../_shared/cors.ts";

// Placeholder for the service functions
interface ProfitDistribution {
  userId: string;
  amount: number;
}

interface ProfitService {
  distributeProfits: (
    savingGroupId: string,
    cycleEndDate: Date
  ) => Promise<ProfitDistribution[]>;
}

// Mock service functions for demonstration
const profitService: ProfitService = {
  distributeProfits: async (savingGroupId, cycleEndDate) => [
    { userId: "mock-user-1", amount: 100 },
    { userId: "mock-user-2", amount: 50 },
  ],
};

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: { headers: { Authorization: req.headers.get("Authorization")! } },
      }
    );

    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const url = new URL(req.url);
    const method = req.method;
    const path = url.pathname.replace("/profit-crud", "");

    // NOTE: This action should be restricted to the group manager or a system cron job.

    switch (method) {
      case "POST": {
        // Distribute Profits
        if (path === "/distribute") {
          const { savingGroupId, cycleEndDate } = await req.json();
          if (!savingGroupId || !cycleEndDate) {
            return new Response(
              JSON.stringify({ error: "Missing group ID or cycle end date" }),
              {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 400,
              }
            );
          }

          const distributions = await profitService.distributeProfits(
            savingGroupId,
            new Date(cycleEndDate)
          );

          return new Response(JSON.stringify(distributions), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          });
        }
        break;
      }
    }

    return new Response(JSON.stringify({ error: "Not Found" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 404,
    });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
