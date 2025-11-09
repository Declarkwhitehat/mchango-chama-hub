import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";
import { corsHeaders } from "../_shared/cors.ts";

// Placeholder for the service functions
interface LoanApproval {
  loanId: string;
  approverId: string;
}

interface LoanApprovalService {
  canApproveLoan: (savingGroupId: string, userId: string) => Promise<boolean>;
  recordLoanApproval: (loanId: string, approverId: string) => Promise<LoanApproval>;
  getLoanApprovals: (loanId: string) => Promise<LoanApproval[]>;
}

// Mock service functions for demonstration
const loanApprovalService: LoanApprovalService = {
  canApproveLoan: async (savingGroupId, userId) => true, // Mocked to always be true
  recordLoanApproval: async (loanId, approverId) => ({
    loanId,
    approverId,
  }),
  getLoanApprovals: async (loanId) => [
    { loanId, approverId: "mock-manager-id" },
    { loanId, approverId: "mock-member-id-1" },
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
    const path = url.pathname.replace("/loan-approval-crud", "");

    switch (method) {
      case "POST": {
        // Record Loan Approval
        if (path === "/approve") {
          const { loanId, savingGroupId } = await req.json();
          if (!loanId || !savingGroupId) {
            return new Response(
              JSON.stringify({ error: "Missing loan ID or group ID" }),
              {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 400,
              }
            );
          }

          // Check if user is eligible to approve
          const isEligible = await loanApprovalService.canApproveLoan(
            savingGroupId,
            user.id
          );
          if (!isEligible) {
            return new Response(
              JSON.stringify({
                error: "User is not eligible to approve this loan.",
              }),
              {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 403,
              }
            );
          }

          const approval = await loanApprovalService.recordLoanApproval(
            loanId,
            user.id
          );
          return new Response(JSON.stringify(approval), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 201,
          });
        }
        break;
      }

      case "GET": {
        // Get Loan Approvals
        if (path.startsWith("/list/")) {
          const loanId = path.split("/list/")[1];
          if (!loanId) {
            return new Response(
              JSON.stringify({ error: "Missing loan ID" }),
              {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 400,
              }
            );
          }

          const approvals = await loanApprovalService.getLoanApprovals(loanId);
          return new Response(JSON.stringify(approvals), {
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
