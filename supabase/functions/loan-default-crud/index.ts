import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";
import { corsHeaders } from "../_shared/cors.ts";

// Placeholder for the service functions
interface Loan {
  id: string;
  status: string;
}

interface DefaultService {
  handleLoanDefault: (loanId: string) => Promise<Loan>;
  refundGuarantors: (loanId: string) => Promise<void>;
  disqualifyBorrowerForDefault: (loanId: string) => Promise<void>;
}

// Mock service functions for demonstration
const defaultService: DefaultService = {
  handleLoanDefault: async (loanId) => ({
    id: loanId,
    status: "DEFAULTED",
  }),
  refundGuarantors: async (loanId) => {},
  disqualifyBorrowerForDefault: async (loanId) => {},
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
    const path = url.pathname.replace("/loan-default-crud", "");

    // NOTE: All default actions should be restricted to the group manager or a system cron job.
    // For simplicity, we assume the logged-in user is authorized for these actions.

    switch (method) {
      case "POST": {
        // Handle Loan Default
        if (path === "/default") {
          const { loanId } = await req.json();
          if (!loanId) {
            return new Response(
              JSON.stringify({ error: "Missing loan ID" }),
              {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 400,
              }
            );
          }

          const defaultedLoan = await defaultService.handleLoanDefault(loanId);
          await defaultService.disqualifyBorrowerForDefault(loanId);

          return new Response(JSON.stringify(defaultedLoan), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          });
        }

        // Refund Guarantors (Called after a defaulted loan is fully repaid)
        if (path === "/refund") {
          const { loanId } = await req.json();
          if (!loanId) {
            return new Response(
              JSON.stringify({ error: "Missing loan ID" }),
              {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 400,
              }
            );
          }

          await defaultService.refundGuarantors(loanId);

          return new Response(
            JSON.stringify({ message: "Guarantors refunded successfully." }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 200,
            }
          );
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
