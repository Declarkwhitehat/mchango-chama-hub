import { useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Search, FileText, Loader2, Hash } from "lucide-react";
import { format } from "date-fns";

interface GeneratedDoc {
  id: string;
  serial_number: number;
  document_type: string;
  document_title: string;
  entity_type: string | null;
  entity_id: string | null;
  generated_by: string;
  metadata: Record<string, any>;
  created_at: string;
}

const AdminDocuments = () => {
  const [serialQuery, setSerialQuery] = useState("");
  const [results, setResults] = useState<GeneratedDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    const trimmed = serialQuery.trim();
    if (!trimmed) {
      toast.error("Please enter a serial number");
      return;
    }

    setLoading(true);
    setSearched(true);

    try {
      if (/^\d+$/.test(trimmed)) {
        // Exact serial number search
        const { data, error } = await supabase
          .from("generated_documents")
          .select("*")
          .eq("serial_number", parseInt(trimmed, 10))
          .limit(1);

        if (error) throw error;
        setResults((data as GeneratedDoc[]) || []);
      } else {
        // Search by title
        const { data, error } = await supabase
          .from("generated_documents")
          .select("*")
          .ilike("document_title", `%${trimmed}%`)
          .order("created_at", { ascending: false })
          .limit(50);

        if (error) throw error;
        setResults((data as GeneratedDoc[]) || []);
      }
    } catch (err: any) {
      console.error(err);
      toast.error("Search failed");
    } finally {
      setLoading(false);
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
          <h1 className="text-2xl font-bold">Generated Documents</h1>
          <p className="text-sm text-muted-foreground">Search documents by serial number or title</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Hash className="h-4 w-4" />
              Document Lookup
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                placeholder="Enter serial number or document title..."
                value={serialQuery}
                onChange={(e) => setSerialQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="flex-1"
              />
              <Button onClick={handleSearch} disabled={loading} className="gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Search
              </Button>
            </div>
          </CardContent>
        </Card>

        {searched && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {results.length > 0 ? `${results.length} document(s) found` : "No documents found"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {results.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">No documents match that serial number or title.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {results.map((doc) => (
                    <div key={doc.id} className="p-4 rounded-lg border bg-card space-y-3">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <FileText className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-semibold text-sm">{doc.document_title}</p>
                            <p className="text-xs text-muted-foreground font-mono">
                              Serial: {doc.serial_number}
                            </p>
                          </div>
                        </div>
                        <Badge className={typeColors[doc.document_type] || "bg-muted text-muted-foreground"}>
                          {doc.document_type.replace(/_/g, " ")}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-muted-foreground">Generated:</span>{" "}
                          {format(new Date(doc.created_at), "MMM dd, yyyy HH:mm")}
                        </div>
                        {doc.entity_type && (
                          <div>
                            <span className="text-muted-foreground">Entity:</span>{" "}
                            {doc.entity_type}
                          </div>
                        )}
                        {doc.entity_id && (
                          <div className="col-span-2">
                            <span className="text-muted-foreground">Entity ID:</span>{" "}
                            <span className="font-mono text-xs">{doc.entity_id}</span>
                          </div>
                        )}
                        <div className="col-span-2">
                          <span className="text-muted-foreground">Generated By:</span>{" "}
                          <span className="font-mono text-xs">{doc.generated_by}</span>
                        </div>
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
