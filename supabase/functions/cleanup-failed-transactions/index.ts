import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
    
    // Delete failed contributions older than 12 hours
    const { data: deletedContributions, error: contribError } = await supabase
      .from("contributions")
      .delete()
      .eq("status", "FAILED")
      .lt("created_at", twelveHoursAgo)
      .select("id");
    
    if (contribError) {
      console.error("Error deleting failed contributions:", contribError);
    }
    
    // Delete failed mchango donations older than 12 hours
    const { data: deletedDonations, error: donationError } = await supabase
      .from("mchango_donations")
      .delete()
      .eq("payment_status", "failed")
      .lt("created_at", twelveHoursAgo)
      .select("id");
    
    if (donationError) {
      console.error("Error deleting failed donations:", donationError);
    }
    
    // Delete failed withdrawals older than 12 hours
    const { data: deletedWithdrawals, error: withdrawalError } = await supabase
      .from("withdrawals")
      .delete()
      .eq("status", "failed")
      .lt("created_at", twelveHoursAgo)
      .select("id");
    
    if (withdrawalError) {
      console.error("Error deleting failed withdrawals:", withdrawalError);
    }
    
    // Delete failed transactions older than 12 hours
    const { data: deletedTransactions, error: transactionError } = await supabase
      .from("transactions")
      .delete()
      .eq("status", "failed")
      .lt("created_at", twelveHoursAgo)
      .select("id");
    
    if (transactionError) {
      console.error("Error deleting failed transactions:", transactionError);
    }

    const summary = {
      contributions_deleted: deletedContributions?.length || 0,
      donations_deleted: deletedDonations?.length || 0,
      withdrawals_deleted: deletedWithdrawals?.length || 0,
      transactions_deleted: deletedTransactions?.length || 0,
      cleaned_at: new Date().toISOString(),
    };

    console.log("Cleanup completed:", summary);

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Cleanup error:", error);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
