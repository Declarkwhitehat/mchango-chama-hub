import { supabase } from "@/integrations/supabase/client";

interface TrackDocumentParams {
  documentType: string;
  documentTitle: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, any>;
  pdfBlob?: Blob;
}

/**
 * Records a generated document, optionally uploads the PDF, and returns its serial number.
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
      .select("serial_number, id")
      .single();

    if (error) {
      console.error("Document tracking insert error:", error.message, error.details, error.hint);
      return generateLocalSerial();
    }

    if (!data?.serial_number) {
      console.warn("Document tracking: no serial_number returned", data);
      return generateLocalSerial();
    }

    const serialStr = String(data.serial_number);

    // Upload PDF blob to storage if provided
    if (params.pdfBlob) {
      try {
        const filePath = `${user.id}/${serialStr}.pdf`;
        const { error: uploadError } = await supabase.storage
          .from("generated-pdfs")
          .upload(filePath, params.pdfBlob, {
            contentType: "application/pdf",
            upsert: true,
          });

        if (uploadError) {
          console.error("PDF upload error:", uploadError.message);
        } else {
          // Update the record with the file path
          await supabase
            .from("generated_documents")
            .update({ file_path: filePath })
            .eq("id", data.id);
        }
      } catch (uploadErr) {
        console.error("PDF upload unexpected error:", uploadErr);
      }
    }

    return serialStr;
  } catch (err) {
    console.error("Document tracking unexpected error:", err);
    return generateLocalSerial();
  }
}

/** Fallback serial: timestamp-based unique number */
function generateLocalSerial(): string {
  const now = Date.now();
  return String(now).slice(-8);
}
