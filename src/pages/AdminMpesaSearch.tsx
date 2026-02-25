import { useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Search, Loader2, Info, Calendar, Clock, Banknote, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface SearchResult {
  transaction_id: string;
  date: string;
  time: string;
  amount: number;
  destination_type: "Chama" | "Campaign" | "Organization";
  destination_name: string;
  status: string;
  sender?: string;
  source_table: string;
}

const destinationColors: Record<string, string> = {
  Chama: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  Campaign: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  Organization: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
};

const statusColors: Record<string, string> = {
  completed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

const AdminMpesaSearch = () => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    const trimmed = query.trim();
    if (!trimmed) {
      toast({ title: "Enter a Transaction ID", variant: "destructive" });
      return;
    }

    setLoading(true);
    setSearched(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({ title: "Session expired", variant: "destructive" });
        return;
      }

      const response = await supabase.functions.invoke("admin-payment-search", {
        body: { transaction_id: trimmed },
      });

      if (response.error) throw response.error;
      setResults(response.data?.results || []);
    } catch (err: any) {
      console.error(err);
      toast({ title: "Search failed", description: err.message, variant: "destructive" });
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-4xl mx-auto">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">M-Pesa Transaction Search</h1>
          <p className="text-muted-foreground mt-1">
            Look up where an M-Pesa payment was directed within the last 30 days.
          </p>
        </div>

        {/* Info Banner */}
        <Alert className="border-primary/20 bg-primary/5">
          <Info className="h-4 w-4 text-primary" />
          <AlertDescription className="text-sm">
            Search is limited to transactions made within the <strong>last 30 days</strong>. Enter the exact M-Pesa Transaction ID to find matching records across Chamas, Campaigns, and Organizations.
          </AlertDescription>
        </Alert>

        {/* Search Bar */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Enter M-Pesa Transaction ID e.g. SLK7H6Y5X4"
                  value={query}
                  onChange={(e) => setQuery(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  className="pl-10 font-mono tracking-wider uppercase"
                />
              </div>
              <Button onClick={handleSearch} disabled={loading} className="min-w-[120px]">
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
                Search
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {!loading && searched && results.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="rounded-full bg-muted p-4 mb-4">
                <Search className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-1">No transaction found</h3>
              <p className="text-muted-foreground text-sm max-w-sm">
                No transaction matching that ID was found within the last 30 days. Please verify the Transaction ID and try again.
              </p>
            </CardContent>
          </Card>
        )}

        {!loading && results.length > 0 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Found <strong>{results.length}</strong> result{results.length > 1 ? "s" : ""}
            </p>
            {results.map((r, i) => (
              <Card key={i} className="overflow-hidden transition-shadow hover:shadow-md">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <CardTitle className="text-base font-mono tracking-wider">{r.transaction_id}</CardTitle>
                    <div className="flex gap-2">
                      <Badge className={destinationColors[r.destination_type] || ""}>{r.destination_type}</Badge>
                      <Badge className={statusColors[r.status] || "bg-muted text-muted-foreground"}>{r.status}</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                    <div className="flex items-start gap-2">
                      <Calendar className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-muted-foreground text-xs">Date</p>
                        <p className="font-medium">{r.date}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Clock className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-muted-foreground text-xs">Time</p>
                        <p className="font-medium">{r.time}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Banknote className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-muted-foreground text-xs">Amount</p>
                        <p className="font-bold text-foreground">KES {Number(r.amount).toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-muted-foreground text-xs">Destination</p>
                        <p className="font-medium">{r.destination_name}</p>
                      </div>
                    </div>
                  </div>
                  {r.sender && (
                    <p className="text-xs text-muted-foreground mt-3 pt-3 border-t">
                      Sender: <span className="font-medium text-foreground">{r.sender}</span>
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminMpesaSearch;
