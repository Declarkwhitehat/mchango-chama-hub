import { useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Search, FileText, Loader2, Hash, ShieldCheck, AlertTriangle, Clock, Download } from "lucide-react";
import { format, subMonths } from "date-fns";

interface GeneratedDoc {
  id: string;
  serial_number: number;
  document_type: string;
  document_title: string;
  entity_type: string | null;
  entity_id: string | null;
  generated_by: string;
  generated_by_name?: string;
  file_path?: string | null;
  metadata: Record<string, any>;
  created_at: string;
}

const RETENTION_MONTHS = 1;

const AdminDocuments = () => {
  const [serialQuery, setSerialQuery] = useState("");
  const [results, setResults] = useState<GeneratedDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchedSerial, setSearchedSerial] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);

  const handleSearch = async () => {
    const trimmed = serialQuery.trim();
    if (!trimmed) {
      toast.error("Please enter a serial number");
      return;
    }

    setLoading(true);
    setSearched(true);
    const isSerialSearch = /^\d+$/.test(trimmed);
    setSearchedSerial(isSerialSearch);

    try {
      const cutoff = subMonths(new Date(), RETENTION_MONTHS).toISOString();

      if (isSerialSearch) {
        const { data, error } = await supabase
          .from("generated_documents")
          .select("*")
          .eq("serial_number", parseInt(trimmed, 10))
          .gte("created_at", cutoff)
          .limit(1);

        if (error) throw error;
        const docs = await enrichWithProfiles((data as GeneratedDoc[]) || []);
        setResults(docs);
      } else {
        const { data, error } = await supabase
          .from("generated_documents")
          .select("*")
          .ilike("document_title", `%${trimmed}%`)
          .gte("created_at", cutoff)
          .order("created_at", { ascending: false })
          .limit(50);

        if (error) throw error;
        const docs = await enrichWithProfiles((data as GeneratedDoc[]) || []);
        setResults(docs);
      }
    } catch (err: any) {
      console.error(err);
      toast.error("Search failed");
    } finally {
      setLoading(false);
    }
  };

  const enrichWithProfiles = async (docs: GeneratedDoc[]): Promise<GeneratedDoc[]> => {
    if (docs.length === 0) return docs;
    const userIds = [...new Set(docs.map((d) => d.generated_by))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, phone")
      .in("id", userIds);

    const profileMap = new Map<string, string>();
    profiles?.forEach((p: any) => {
      profileMap.set(p.id, p.full_name || p.phone || "Unknown");
    });

    return docs.map((d) => ({
      ...d,
      generated_by_name: profileMap.get(d.generated_by) || d.generated_by,
    }));
  };

  const handleDownloadPDF = async (doc: GeneratedDoc) => {
    if (!doc.file_path) {
      toast.error("PDF file not available for this document");
      return;
    }

    setDownloading(doc.id);
    try {
      const { data, error } = await supabase.storage
        .from("generated-pdfs")
        .download(doc.file_path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `document-${doc.serial_number}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("Document downloaded");
    } catch (err: any) {
      console.error("Download error:", err);
      toast.error("Failed to download document");
    } finally {
      setDownloading(null);
    }
  };

  const typeColors: Record<string, string> = {
    contribution_report: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    activity_report: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    payment_receipt: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
    contributions_report: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            Verify Document
          </h1>
          <p className="text-sm text-muted-foreground">
            Enter a document serial number to verify its authenticity. Documents are retained for {RETENTION_MONTHS} month only.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Hash className="h-4 w-4" />
              Document Lookup
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="Enter serial number (e.g. 10000001)..."
                value={serialQuery}
                onChange={(e) => setSerialQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="flex-1 font-mono"
              />
              <Button onClick={handleSearch} disabled={loading} className="gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Verify
              </Button>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              Documents older than {RETENTION_MONTHS} month are automatically removed from the system.
            </div>
          </CardContent>
        </Card>

        {searched && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {results.length > 0
                  ? `✅ ${results.length} document(s) verified`
                  : "❌ Document not found"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {results.length === 0 ? (
                <div className="text-center py-8 space-y-3">
                  <div className="h-14 w-14 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
                    <AlertTriangle className="h-7 w-7 text-destructive" />
                  </div>
                  <p className="text-sm font-medium text-destructive">
                    {searchedSerial
                      ? `Document not found or expired (older than ${RETENTION_MONTHS} month).`
                      : `No documents match that search within the last ${RETENTION_MONTHS} month.`}
                  </p>
                  <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                    All system-generated documents are retained for {RETENTION_MONTHS} month only. If the document was generated more than {RETENTION_MONTHS} month ago, it has been automatically deleted from the system.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {results.map((doc) => (
                    <div key={doc.id} className="p-4 rounded-lg border bg-card space-y-3">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <ShieldCheck className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-semibold text-sm">{doc.document_title}</p>
                            <p className="text-xs text-muted-foreground font-mono font-bold">
                              Serial No: {doc.serial_number}
                            </p>
                          </div>
                        </div>
                        <Badge className={typeColors[doc.document_type] || "bg-muted text-muted-foreground"}>
                          {doc.document_type.replace(/_/g, " ")}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-muted-foreground">Generated:</span>{" "}
                          <strong>{format(new Date(doc.created_at), "MMM dd, yyyy HH:mm")}</strong>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Generated By:</span>{" "}
                          <strong>{doc.generated_by_name || doc.generated_by}</strong>
                        </div>
                        {doc.entity_type && (
                          <div>
                            <span className="text-muted-foreground">Type:</span>{" "}
                            <strong className="capitalize">{doc.entity_type}</strong>
                          </div>
                        )}
                        {doc.entity_id && (
                          <div>
                            <span className="text-muted-foreground">Entity ID:</span>{" "}
                            <span className="font-mono">{doc.entity_id.substring(0, 8)}...</span>
                          </div>
                        )}
                      </div>

                      {doc.metadata && Object.keys(doc.metadata).length > 0 && (
                        <div className="text-xs bg-muted/50 p-2 rounded">
                          <span className="text-muted-foreground font-medium">Details: </span>
                          {Object.entries(doc.metadata).map(([key, val]) => (
                            <span key={key} className="mr-3">
                              {key.replace(/_/g, " ")}: <strong>{String(val)}</strong>
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center gap-2 pt-1 flex-wrap">
                        <Badge variant="outline" className="text-xs bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300 border-green-200">
                          <ShieldCheck className="h-3 w-3 mr-1" />
                          Verified Authentic
                        </Badge>

                        {doc.file_path ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 text-xs h-7"
                            onClick={() => handleDownloadPDF(doc)}
                            disabled={downloading === doc.id}
                          >
                            {downloading === doc.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Download className="h-3 w-3" />
                            )}
                            View Document
                          </Button>
                        ) : (
                          <Badge variant="outline" className="text-xs text-muted-foreground">
                            <FileText className="h-3 w-3 mr-1" />
                            PDF not stored
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminDocuments;
