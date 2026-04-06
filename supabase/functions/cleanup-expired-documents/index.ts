import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Retention: 1 month
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - 1);

    // Get documents to delete (with file paths for storage cleanup)
    const { data: expiredDocs, error: fetchError } = await supabase
      .from("generated_documents")
      .select("id, file_path")
      .lt("created_at", threeMonthsAgo.toISOString());

    if (fetchError) throw fetchError;

    // Delete associated PDF files from storage
    const filePaths = (expiredDocs || [])
      .map((d: any) => d.file_path)
      .filter(Boolean);

    if (filePaths.length > 0) {
      const { error: storageError } = await supabase.storage
        .from("generated-pdfs")
        .remove(filePaths);

      if (storageError) {
        console.error("Storage cleanup error:", storageError.message);
      } else {
        console.log(`Deleted ${filePaths.length} PDF files from storage`);
      }
    }

    // Delete the document records
    const { data, error } = await supabase
      .from("generated_documents")
      .delete()
      .lt("created_at", threeMonthsAgo.toISOString())
      .select("id");

    if (error) throw error;

    const deletedCount = data?.length || 0;
    console.log(`Cleaned up ${deletedCount} expired documents`);

    return new Response(
      JSON.stringify({ success: true, deleted: deletedCount, files_deleted: filePaths.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Cleanup error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
