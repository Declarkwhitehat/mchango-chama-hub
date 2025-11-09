import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";
import { corsHeaders } from "../_shared/cors.ts";

// Placeholder for the service functions
interface Loan {
  id: string;
  savingGroupId: string;
  borrowerId: string;
  requestedAmount: number;
  disbursedAmount: number;
  principalAmount: number;
  commissionDeducted: number;
  profitDeducted: number;
  status: string;
  is_active: boolean;
}

interface LoanService {
  checkLoanRequestValidity: (
    savingGroupId: string,
    borrowerId: string,
    requestedAmount: number
  ) => Promise<{ isValid: boolean; message: string }>;
  createLoanRequest: (
    savingGroupId: string,
    borrowerId: string,
    requestedAmount: number
  ) => Promise<Loan>;
  getPendingLoans: (savingGroupId: string) => Promise<Loan[]>;
  getLoanDetails: (loanId: string) => Promise<Loan | null>;
}

// Mock service functions for demonstration
const loanService: LoanService = {
  checkLoanRequestValidity: async (
    savingGroupId,
    borrowerId,
    requestedAmount
  ) => {
    if (requestedAmount > 50000) {
      return { isValid: false, message: "Requested amount too high for mock." };
    }
    return { isValid: true, message: "Loan request is valid." };
  },
  createLoanRequest: async (savingGroupId, borrowerId, requestedAmount) => ({
    id: "mock-loan-id",
    savingGroupId,
    borrowerId,
    requestedAmount,
    disbursedAmount: requestedAmount * 0.93, // 7% deduction
    principalAmount: requestedAmount,
    commissionDeducted: requestedAmount * 0.02,
    profitDeducted: requestedAmount * 0.05,
    status: "PENDING_APPROVAL",
    is_active: true,
  }),
  getPendingLoans: async (savingGroupId) => [
    {
      id: "mock-loan-1",
      savingGroupId,
      borrowerId: "mock-user-1",
      requestedAmount: 10000,
      disbursedAmount: 9300,
      principalAmount: 10000,
      commissionDeducted: 200,
      profitDeducted: 500,
      status: "PENDING_APPROVAL",
      is_active: true,
    },
  ],
  getLoanDetails: async (loanId) => ({
    id: loanId,
    savingGroupId: "mock-group-id",
    borrowerId: "mock-user-1",
    requestedAmount: 10000,
    disbursedAmount: 9300,
    principalAmount: 10000,
    commissionDeducted: 200,
    profitDeducted: 500,
    status: "PENDING_APPROVAL",
    is_active: true,
  }),
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
    const path = url.pathname.replace("/loan-crud", "");

    switch (method) {
      case "POST": {
        // Create Loan Request
        if (path === "/request") {
          const { savingGroupId, requestedAmount } = await req.json();
          if (!savingGroupId || !requestedAmount || requestedAmount <= 0) {
            return new Response(
              JSON.stringify({
                error: "Missing group ID or valid requested amount.",
              }),
              {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 400,
              }
            );
          }

          // Check validity before creation
          const { isValid, message } = await loanService.checkLoanRequestValidity(
            savingGroupId,
            user.id,
            requestedAmount
          );

          if (!isValid) {
            return new Response(JSON.stringify({ error: message }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 403,
            });
          }

          const loan = await loanService.createLoanRequest(
            savingGroupId,
            user.id,
            requestedAmount
          );
          return new Response(JSON.stringify(loan), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 201,
          });
        }
        break;
      }

      case "GET": {
        // Get Pending Loans for a Group
        if (path.startsWith("/pending/")) {
          const savingGroupId = path.split("/pending/")[1];
          if (!savingGroupId) {
            return new Response(
              JSON.stringify({ error: "Missing group ID" }),
              {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 400,
              }
            );
          }

          const pendingLoans = await loanService.getPendingLoans(savingGroupId);
          return new Response(JSON.stringify(pendingLoans), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          });
        }

        // Get Loan Details
        if (path.startsWith("/details/")) {
          const loanId = path.split("/details/")[1];
          if (!loanId) {
            return new Response(
              JSON.stringify({ error: "Missing loan ID" }),
              {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 400,
              }
            );
          }

          const loan = await loanService.getLoanDetails(loanId);
          if (!loan) {
            return new Response(JSON.stringify({ error: "Loan not found" }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 404,
            });
          }

          return new Response(JSON.stringify(loan), {
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
