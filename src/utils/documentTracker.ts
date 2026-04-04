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
 * Returns null if tracking fails (PDF should still be generated).
 */
export async function trackGeneratedDocument(params: TrackDocumentParams): Promise<string | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

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
      console.error("Document tracking error:", error);
      return null;
    }

    return String(data.serial_number);
  } catch (err) {
    console.error("Document tracking error:", err);
    return null;
  }
}
