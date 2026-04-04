import { supabase } from "@/integrations/supabase/client";

interface TrackDocumentParams {
  documentType: string;
  documentTitle: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, any>;
}

/**
 * Records a generated document and returns its serial number.
 * If database tracking fails, generates a local serial number so PDFs always have one.
 */
export async function trackGeneratedDocument(params: TrackDocumentParams): Promise<string> {
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.warn("Document tracking: no authenticated user, using local serial");
      return generateLocalSerial();
    }

    const { data, error } = await supabase
      .from("generated_documents")
      .insert({
        document_type: params.documentType,
        document_title: params.documentTitle,
        entity_type: params.entityType || null,
        entity_id: params.entityId || null,
        generated_by: user.id,
        metadata: params.metadata || {},
      })
      .select("serial_number")
      .single();

    if (error) {
      console.error("Document tracking insert error:", error.message, error.details, error.hint);
      return generateLocalSerial();
    }

    if (!data?.serial_number) {
      console.warn("Document tracking: no serial_number returned", data);
      return generateLocalSerial();
    }

    return String(data.serial_number);
  } catch (err) {
    console.error("Document tracking unexpected error:", err);
    return generateLocalSerial();
  }
}

/** Fallback serial: timestamp-based unique number */
function generateLocalSerial(): string {
  const now = Date.now();
  // Use last 8 digits of timestamp to create a unique-ish number
  return String(now).slice(-8);
}
