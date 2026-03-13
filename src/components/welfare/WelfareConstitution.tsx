import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FileText, Upload, Download, Loader2, AlertCircle, ShieldCheck } from "lucide-react";
import { format } from "date-fns";

interface WelfareConstitutionProps {
  welfareId: string;
  welfareName: string;
  constitutionFilePath: string | null;
  constitutionFileName: string | null;
  constitutionUploadedAt: string | null;
  isExecutive: boolean;
  onUploaded: () => void;
}

const MAX_FILE_SIZE = 3 * 1024 * 1024; // 3MB
const ALLOWED_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const ALLOWED_EXTENSIONS = [".pdf", ".doc", ".docx"];

export const WelfareConstitution = ({
  welfareId,
  welfareName,
  constitutionFilePath,
  constitutionFileName,
  constitutionUploadedAt,
  isExecutive,
  onUploaded,
}: WelfareConstitutionProps) => {
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasDocument = !!constitutionFilePath;

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      toast.error("File size exceeds 3MB limit");
      return;
    }

    // Validate file type
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!ALLOWED_TYPES.includes(file.type) && !ALLOWED_EXTENSIONS.includes(ext)) {
      toast.error("Only PDF, DOC, and DOCX files are allowed");
      return;
    }

    setUploading(true);
    try {
      const filePath = `${welfareId}/constitution${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("welfare-documents")
        .upload(filePath, file, { upsert: false });

      if (uploadError) {
        if (uploadError.message?.includes("already exists") || uploadError.message?.includes("Duplicate")) {
          toast.error("A document already exists. Contact admin to delete it before uploading a new one.");
        } else {
          throw uploadError;
        }
        return;
      }

      // Update welfares table with file info
      const { error: updateError } = await supabase
        .from("welfares")
        .update({
          constitution_file_path: filePath,
          constitution_file_name: file.name,
          constitution_uploaded_by: (await supabase.auth.getUser()).data.user?.id,
          constitution_uploaded_at: new Date().toISOString(),
        })
        .eq("id", welfareId);

      if (updateError) throw updateError;

      toast.success("Constitution uploaded successfully");
      onUploaded();
    } catch (err: any) {
      console.error("Upload error:", err);
      toast.error(err.message || "Failed to upload document");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDownload = async () => {
    if (!constitutionFilePath) return;
    setDownloading(true);
    try {
      const { data, error } = await supabase.storage
        .from("welfare-documents")
        .download(constitutionFilePath);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = constitutionFileName || "constitution";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error("Download error:", err);
      toast.error("Failed to download document");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          Constitution & Rules
        </CardTitle>
      </CardHeader>
      <CardContent>
        {hasDocument ? (
          <div className="space-y-4">
            <div className="flex items-start gap-4 p-4 rounded-lg border border-primary/20 bg-primary/5">
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <FileText className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground truncate">{constitutionFileName}</p>
                {constitutionUploadedAt && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Uploaded on {format(new Date(constitutionUploadedAt), "dd MMM yyyy, HH:mm")}
                  </p>
                )}
                <Badge variant="outline" className="mt-1.5 text-xs">
                  <ShieldCheck className="h-3 w-3 mr-1" />
                  Official Document
                </Badge>
              </div>
            </div>

            <Button onClick={handleDownload} disabled={downloading} className="w-full">
              {downloading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Download Constitution
            </Button>

            {isExecutive && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-muted text-sm text-muted-foreground">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <p>To replace this document, contact a platform admin to delete the current one first.</p>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8 space-y-4">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mx-auto">
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium text-foreground">No Constitution Uploaded</p>
              <p className="text-sm text-muted-foreground mt-1">
                {isExecutive
                  ? "Upload your welfare group's constitution or rules document (PDF, DOC, DOCX — max 3MB)."
                  : "The group's constitution has not been uploaded yet."}
              </p>
            </div>

            {isExecutive && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx"
                  onChange={handleUpload}
                  className="hidden"
                />
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="w-full sm:w-auto"
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Upload className="h-4 w-4 mr-2" />
                  )}
                  Upload Constitution
                </Button>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
