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

    // Query the cron job run details for our cleanup job
    const { data, error } = await supabase.rpc('get_cleanup_job_last_run');

    if (error) {
      // If RPC doesn't exist, try direct query
      const { data: cronData, error: cronError } = await supabase
        .from('cron.job_run_details')
        .select('*')
        .ilike('command', '%cleanup-failed-transactions%')
        .order('start_time', { ascending: false })
        .limit(1);

      if (cronError) {
        // Fallback: return schedule info without last run
        return new Response(JSON.stringify({
          job_name: "cleanup-failed-transactions-10hrs",
          schedule: "Every 10 hours",
          last_run: null,
          status: "scheduled",
          message: "Job is scheduled but run history not accessible"
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        job_name: "cleanup-failed-transactions-10hrs",
        schedule: "Every 10 hours",
        last_run: cronData?.[0]?.start_time || null,
        status: cronData?.[0]?.status || "unknown",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error fetching cleanup job status:", error);
    return new Response(JSON.stringify({ 
      error: errorMessage,
      job_name: "cleanup-failed-transactions-10hrs",
      schedule: "Every 10 hours",
      last_run: null,
      status: "unknown"
    }), {
      status: 200, // Return 200 with fallback data
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
