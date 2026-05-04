// One-off admin utility to clear all objects from storage buckets.
// Authenticated by a static admin token to prevent accidental misuse.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-token",
};

const ADMIN_TOKEN = "wipe-storage-2026-05-04";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const token = req.headers.get("x-admin-token");
  if (token !== ADMIN_TOKEN) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const buckets = [
    "campaign-images",
    "generated-pdfs",
    "group-documents",
    "id-documents",
    "verification-selfies",
    "welfare-documents",
  ];

  const summary: Record<string, { deleted: number; errors: string[] }> = {};

  for (const bucket of buckets) {
    summary[bucket] = { deleted: 0, errors: [] };

    // Recursively list all paths
    const allPaths: string[] = [];

    const walk = async (prefix: string) => {
      let offset = 0;
      while (true) {
        const { data, error } = await supabase.storage
          .from(bucket)
          .list(prefix, { limit: 1000, offset });
        if (error) {
          summary[bucket].errors.push(`list ${prefix}: ${error.message}`);
          return;
        }
        if (!data || data.length === 0) break;
        for (const item of data) {
          const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
          // A folder has no id; recurse into it
          if (item.id === null || item.id === undefined) {
            await walk(fullPath);
          } else {
            allPaths.push(fullPath);
          }
        }
        if (data.length < 1000) break;
        offset += 1000;
      }
    };

    await walk("");

    // Delete in chunks of 100
    for (let i = 0; i < allPaths.length; i += 100) {
      const chunk = allPaths.slice(i, i + 100);
      const { data, error } = await supabase.storage.from(bucket).remove(chunk);
      if (error) {
        summary[bucket].errors.push(`remove: ${error.message}`);
      } else {
        summary[bucket].deleted += data?.length ?? 0;
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, summary }, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
