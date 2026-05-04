import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Trash2, X, Download, FileText, Clock, RefreshCw } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

interface PendingDoc {
  id: string;
  title: string;
  file_name: string;
  file_path: string;
  entity_type: string;
  entity_id: string;
  deletion_requested_at: string;
  deletion_scheduled_for: string;
  deletion_reason: string | null;
  deletion_requested_by: string;
  requester_name?: string;
  entity_name?: string;
}

export default function AdminDocumentDeletions() {
  const [docs, setDocs] = useState<PendingDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);

  const fetchDocs = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("group_documents")
      .select("*")
      .eq("deletion_status", "pending")
      .order("deletion_scheduled_for", { ascending: true });

    if (error) {
      toast.error("Failed to load pending deletions");
      setLoading(false);
      return;
    }

    const rows = (data || []) as PendingDoc[];

    // Resolve requester names + entity names
    const userIds = [...new Set(rows.map((r) => r.deletion_requested_by).filter(Boolean))];
    const profilesById = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, phone")
        .in("id", userIds);
      profs?.forEach((p: any) => profilesById.set(p.id, p.full_name || p.phone || "Unknown"));
    }

    // Resolve entity names per type
    const enriched = await Promise.all(
      rows.map(async (r) => {
        let entity_name = "—";
        try {
          const table =
            r.entity_type === "chama"
              ? "chama"
              : r.entity_type === "welfare"
              ? "welfares"
              : r.entity_type === "mchango"
              ? "mchango"
              : "organizations";
          const nameCol = r.entity_type === "mchango" ? "title" : "name";
          const { data: ent } = await supabase
            .from(table as any)
            .select(`id, ${nameCol}`)
            .eq("id", r.entity_id)
            .maybeSingle();
          if (ent) entity_name = (ent as any)[nameCol] || "—";
        } catch {
          /* ignore */
        }
        return {
          ...r,
          requester_name: profilesById.get(r.deletion_requested_by) || "Unknown",
          entity_name,
        };
      }),
    );

    setDocs(enriched);
    setLoading(false);
  };

  useEffect(() => {
    fetchDocs();
  }, []);

  const handleAction = async (doc: PendingDoc, action: "cancel" | "delete_now") => {
    if (
      action === "delete_now" &&
      !confirm(`Permanently delete "${doc.title}" right now? This cannot be undone.`)
    )
      return;
    if (action === "cancel" && !confirm(`Cancel scheduled deletion of "${doc.title}"?`)) return;

    setActingId(doc.id);
    try {
      const { data, error } = await supabase.functions.invoke("admin-document-deletion", {
        body: { document_id: doc.id, action },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(action === "cancel" ? "Deletion cancelled" : "Document deleted");
      fetchDocs();
    } catch (err: any) {
      toast.error(err?.message || "Action failed");
    } finally {
      setActingId(null);
    }
  };

  const handleDownload = async (doc: PendingDoc) => {
    try {
      const { data, error } = await supabase.storage.from("group-documents").download(doc.file_path);
      if (error) throw error;
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.file_name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Download failed");
    }
  };

  return (
    <AdminLayout>
      <div className="container px-4 py-6 max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Clock className="h-6 w-6 text-primary" />
              Document Deletion Requests
            </h1>
            <p className="text-sm text-muted-foreground">
              Manager-initiated deletions in the 72-hour cooldown. Cancel to keep, or delete immediately.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchDocs} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {loading ? (
          <div className="py-16 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : docs.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No pending deletion requests.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {docs.map((doc) => {
              const overdue = new Date(doc.deletion_scheduled_for) <= new Date();
              return (
                <Card key={doc.id} className={overdue ? "border-destructive/50" : "border-amber-300"}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-5 w-5 text-primary flex-shrink-0" />
                        <span className="truncate">{doc.title}</span>
                      </div>
                      <Badge variant={overdue ? "destructive" : "secondary"} className="flex-shrink-0">
                        {overdue
                          ? "Due now"
                          : `In ${formatDistanceToNow(new Date(doc.deletion_scheduled_for))}`}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">File:</span>{" "}
                        <span className="font-mono">{doc.file_name}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Group:</span>{" "}
                        <strong className="capitalize">
                          {doc.entity_type} — {doc.entity_name}
                        </strong>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Requested by:</span>{" "}
                        <strong>{doc.requester_name}</strong>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Requested:</span>{" "}
                        {format(new Date(doc.deletion_requested_at), "dd MMM yyyy HH:mm")}
                      </div>
                      <div className="sm:col-span-2">
                        <span className="text-muted-foreground">Scheduled deletion:</span>{" "}
                        <strong>
                          {format(new Date(doc.deletion_scheduled_for), "dd MMM yyyy HH:mm")}
                        </strong>
                      </div>
                    </div>
                    {doc.deletion_reason && (
                      <div className="text-xs p-2 rounded bg-muted">
                        <span className="text-muted-foreground">Reason: </span>
                        {doc.deletion_reason}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownload(doc)}
                      >
                        <Download className="h-4 w-4 mr-1" /> Download
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleAction(doc, "cancel")}
                        disabled={actingId === doc.id}
                      >
                        {actingId === doc.id ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-1" />
                        ) : (
                          <X className="h-4 w-4 mr-1" />
                        )}
                        Cancel deletion
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleAction(doc, "delete_now")}
                        disabled={actingId === doc.id}
                      >
                        {actingId === doc.id ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-1" />
                        ) : (
                          <Trash2 className="h-4 w-4 mr-1" />
                        )}
                        Delete now
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
