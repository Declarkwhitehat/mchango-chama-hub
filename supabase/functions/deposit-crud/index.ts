import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";
import { corsHeaders } from "../_shared/cors.ts";

// Placeholder for the service functions
interface Deposit {
  id: string;
  savingGroupId: string;
  userId: string;
  payerId: string;
  amount: number;
  commissionAmount: number;
}

interface DepositService {
  createDeposit: (
    savingGroupId: string,
    userId: string,
    payerId: string,
    amount: number
  ) => Promise<Deposit>;
  getMemberTotalSavings: (
    savingGroupId: string,
    userId: string
  ) => Promise<number>;
  getGroupDepositHistory: (savingGroupId: string) => Promise<Deposit[]>;
}

// Mock service functions for demonstration
const depositService: DepositService = {
  createDeposit: async (savingGroupId, userId, payerId, amount) => ({
    id: "mock-deposit-id",
    savingGroupId,
    userId,
    payerId,
    amount,
    commissionAmount: amount * 0.01,
  }),
  getMemberTotalSavings: async (savingGroupId, userId) => 5000,
  getGroupDepositHistory: async (savingGroupId) => [
    {
      id: "mock-deposit-1",
      savingGroupId,
      userId: "user-1",
      payerId: "user-1",
      amount: 1000,
      commissionAmount: 10,
    },
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
    const path = url.pathname.replace("/deposit-crud", "");

    switch (method) {
      case "POST": {
        // Create Deposit
        if (path === "/create") {
          const { savingGroupId, userId, amount } = await req.json();
          if (!savingGroupId || !userId || !amount || amount < 100) {
            return new Response(
              JSON.stringify({
                error: "Missing group ID, user ID, or amount (min 100)",
              }),
              {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 400,
              }
            );
          }

          // The payer is the logged-in user (user.id)
          // The userId is the member whose account is being credited
          const deposit = await depositService.createDeposit(
            savingGroupId,
            userId,
            user.id,
            amount
          );
          return new Response(JSON.stringify(deposit), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 201,
          });
        }
        break;
      }

      case "GET": {
        // Get Member Total Savings
        if (path.startsWith("/savings/")) {
          const [savingGroupId, userId] = path.split("/savings/")[1].split("/");
          if (!savingGroupId || !userId) {
            return new Response(
              JSON.stringify({ error: "Missing group ID or user ID" }),
              {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 400,
              }
            );
          }

          const totalSavings = await depositService.getMemberTotalSavings(
            savingGroupId,
            userId
          );
          return new Response(JSON.stringify({ totalSavings }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          });
        }

        // Get Group Deposit History
        if (path.startsWith("/history/")) {
          const savingGroupId = path.split("/history/")[1];
          if (!savingGroupId) {
            return new Response(
              JSON.stringify({ error: "Missing group ID" }),
              {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 400,
              }
            );
          }

          const history = await depositService.getGroupDepositHistory(
            savingGroupId
          );
          return new Response(JSON.stringify(history), {
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
  } catch (error: any) {
    console.error(error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
