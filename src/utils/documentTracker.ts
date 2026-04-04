import { supabase } from "@/integrations/supabase/client";

interface TrackDocumentParams {
  documentType: string;
  documentTitle: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, any>;
}

interface TrackResult {
  serialNumber: string;
  documentId: string | null;
}

/**
 * Records a generated document and returns its serial number.
 * If database tracking fails, generates a local serial number so PDFs always have one.
 */
export async function trackGeneratedDocument(params: TrackDocumentParams): Promise<string> {
  const result = await trackDocumentWithId(params);
  return result.serialNumber;
}

/**
 * Same as trackGeneratedDocument but also returns the document ID for subsequent blob upload.
 */
export async function trackDocumentWithId(params: TrackDocumentParams): Promise<TrackResult> {
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { serialNumber: generateLocalSerial(), documentId: null };
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
      .select("serial_number, id")
      .single();

    if (error) {
      console.error("Document tracking insert error:", error.message, error.details, error.hint);
      return { serialNumber: generateLocalSerial(), documentId: null };
    }

    if (!data?.serial_number) {
      return { serialNumber: generateLocalSerial(), documentId: null };
    }

    return { serialNumber: String(data.serial_number), documentId: data.id };
  } catch (err) {
    console.error("Document tracking unexpected error:", err);
    return { serialNumber: generateLocalSerial(), documentId: null };
  }
}

/**
 * Uploads the PDF blob to storage and links it to the document record.
 * Call this after the PDF has been generated with the serial number.
 */
export async function uploadDocumentPDF(documentId: string | null, serialNumber: string, pdfBlob: Blob): Promise<void> {
  if (!documentId) return;

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const filePath = `${user.id}/${serialNumber}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from("generated-pdfs")
      .upload(filePath, pdfBlob, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      console.error("PDF upload error:", uploadError.message);
      return;
    }

    await supabase
      .from("generated_documents")
      .update({ file_path: filePath } as any)
      .eq("id", documentId);
  } catch (err) {
    console.error("PDF upload unexpected error:", err);
  }
}

/** Fallback serial: timestamp-based unique number */
function generateLocalSerial(): string {
  const now = Date.now();
  return String(now).slice(-8);
}
