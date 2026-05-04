// GroupDocuments - shared document upload/download component with 72h deletion cooldown
import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  FileText,
  Upload,
  Download,
  Loader2,
  AlertCircle,
  Plus,
  Trash2,
  Clock,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";

interface GroupDocumentsProps {
  entityType: "welfare" | "chama" | "mchango" | "organization";
  entityId: string;
  canUpload: boolean;
  /** Group manager / executive — can request deletion (72h cooldown). */
  isManager?: boolean;
  /** Backwards compat — treated as manager too. */
  isAdmin?: boolean;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_EXTENSIONS = [".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png", ".webp"];

interface DocRecord {
  id: string;
  title: string;
  file_name: string;
  file_path: string;
  uploaded_by: string;
  created_at: string;
  deletion_status: string | null;
  deletion_requested_at: string | null;
  deletion_scheduled_for: string | null;
  deletion_reason: string | null;
}

export const GroupDocuments = ({
  entityType,
  entityId,
  canUpload,
  isManager = false,
  isAdmin = false,
}: GroupDocumentsProps) => {
  const { user } = useAuth();
  const canRequestDelete = isManager || isAdmin;
  const [documents, setDocuments] = useState<DocRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [requestingId, setRequestingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DocRecord | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchDocuments();
  }, [entityId]);

  const fetchDocuments = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("group_documents")
      .select("*")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false });

    if (!error && data) setDocuments(data as DocRecord[]);
    setLoading(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      toast.error("File size exceeds 5MB limit");
      return;
    }
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      toast.error("Allowed: PDF, DOC, DOCX, JPG, PNG, WEBP");
      return;
    }
    setSelectedFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile || !title.trim() || !user) {
      toast.error(!user ? "You must be logged in" : "Provide a title and file");
      return;
    }
    if (!entityId) {
      toast.error("Missing group reference. Refresh the page and try again.");
      return;
    }

    setUploading(true);
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) {
        throw new Error("Your session has expired. Please log in again.");
      }

      const ext = "." + selectedFile.name.split(".").pop()?.toLowerCase();
      const filePath = `${entityType}/${entityId}/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("group-documents")
        .upload(filePath, selectedFile, {
          contentType: selectedFile.type || "application/octet-stream",
          upsert: false,
        });

      if (uploadError) throw new Error("Storage: " + (uploadError.message || JSON.stringify(uploadError)));

      const { error: insertError } = await supabase
        .from("group_documents")
        .insert({
          entity_type: entityType,
          entity_id: entityId,
          title: title.trim(),
          file_name: selectedFile.name,
          file_path: filePath,
          uploaded_by: user.id,
        });

      if (insertError) {
        await supabase.storage.from("group-documents").remove([filePath]);
        throw new Error("Database: " + (insertError.message || JSON.stringify(insertError)));
      }

      toast.success("Document uploaded successfully");
      setTitle("");
      setSelectedFile(null);
      setShowForm(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      fetchDocuments();
    } catch (err: any) {
      console.error("[GroupDocuments] Upload error:", err);
      toast.error(err?.message || "Failed to upload document", { duration: 8000 });
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (doc: DocRecord) => {
    setDownloadingId(doc.id);
    try {
      const { data, error } = await supabase.storage
        .from("group-documents")
        .download(doc.file_path);
      if (error) throw error;
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.file_name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error("Download error:", err);
      toast.error("Failed to download document");
    } finally {
      setDownloadingId(null);
    }
  };

  const submitDeletionRequest = async () => {
    if (!deleteTarget) return;
    setRequestingId(deleteTarget.id);
    try {
      const { data, error } = await supabase.functions.invoke("request-document-deletion", {
        body: { document_id: deleteTarget.id, reason: deleteReason.trim() || null },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(
        "Deletion scheduled. The document will be removed in 72 hours unless an admin cancels.",
        { duration: 6000 },
      );
      setDeleteTarget(null);
      setDeleteReason("");
      fetchDocuments();
    } catch (err: any) {
      console.error("Deletion request error:", err);
      toast.error(err?.message || "Failed to request deletion");
    } finally {
      setRequestingId(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Documents
          </CardTitle>
          {canUpload && !showForm && (
            <Button variant="outline" size="sm" onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4 mr-1" /> Upload
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Upload Form */}
        {showForm && canUpload && (
          <div className="space-y-3 p-4 rounded-lg border border-dashed border-primary/30 bg-primary/5">
            <div className="space-y-2">
              <Label htmlFor="doc-title">Document Title *</Label>
              <Input
                id="doc-title"
                placeholder="e.g. Constitution, Meeting Minutes, Rules"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={100}
              />
            </div>
            <div className="space-y-2">
              <Label>File (PDF, DOC, DOCX, JPG, PNG, WEBP — max 5MB)</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
                onChange={handleFileSelect}
                className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
              />
              {selectedFile && (
                <p className="text-xs text-muted-foreground">
                  Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button onClick={handleUpload} disabled={uploading || !selectedFile || !title.trim()} size="sm">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />}
                Upload
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowForm(false);
                  setTitle("");
                  setSelectedFile(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Documents List */}
        {documents.length > 0 ? (
          <div className="space-y-3">
            {documents.map((doc) => {
              const isPending = doc.deletion_status === "pending" && doc.deletion_scheduled_for;
              return (
                <div
                  key={doc.id}
                  className={`p-3 rounded-lg border bg-card transition-colors ${
                    isPending ? "border-amber-300 bg-amber-50/40 dark:bg-amber-950/10" : "hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-foreground">{doc.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{doc.file_name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Uploaded {format(new Date(doc.created_at), "dd MMM yyyy, HH:mm")}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDownload(doc)}
                      disabled={downloadingId === doc.id}
                    >
                      {downloadingId === doc.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                    </Button>
                    {canRequestDelete && !isPending && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => {
                          setDeleteTarget(doc);
                          setDeleteReason("");
                        }}
                        disabled={requestingId === doc.id}
                      >
                        {requestingId === doc.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </div>

                  {isPending && (
                    <div className="mt-3 p-2.5 rounded-md bg-amber-100/60 dark:bg-amber-950/30 border border-amber-300 text-xs space-y-1">
                      <div className="flex items-center gap-1.5 font-medium text-amber-800 dark:text-amber-300">
                        <Clock className="h-3.5 w-3.5" />
                        Scheduled for deletion {formatDistanceToNow(new Date(doc.deletion_scheduled_for!), { addSuffix: true })}
                      </div>
                      {doc.deletion_reason && (
                        <p className="text-amber-700 dark:text-amber-400">Reason: {doc.deletion_reason}</p>
                      )}
                      <p className="text-amber-700/80 dark:text-amber-400/80">
                        An admin can cancel or expedite this deletion.
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          !showForm && (
            <div className="text-center py-6">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                <FileText className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">
                {canUpload ? "No documents yet. Upload your first document." : "No documents uploaded yet."}
              </p>
            </div>
          )
        )}

        {canRequestDelete && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-muted text-xs text-muted-foreground">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <p>
              Deleting a document starts a 72-hour cooldown. All members are notified and the document remains
              visible during this period. A platform admin can cancel or expedite the deletion.
            </p>
          </div>
        )}
      </CardContent>

      {/* Confirm Delete Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request document deletion</DialogTitle>
            <DialogDescription>
              "{deleteTarget?.title}" will be permanently deleted in <strong>72 hours</strong>. All members will
              be notified now and again when the document is removed. A platform admin can cancel this request
              before it completes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="del-reason">Reason (optional)</Label>
            <Textarea
              id="del-reason"
              placeholder="Why is this being deleted?"
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              maxLength={300}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={submitDeletionRequest}
              disabled={requestingId === deleteTarget?.id}
            >
              {requestingId === deleteTarget?.id ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Trash2 className="h-4 w-4 mr-1" />
              )}
              Schedule Deletion
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
