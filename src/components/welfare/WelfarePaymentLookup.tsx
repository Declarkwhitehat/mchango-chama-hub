import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { Search, Loader2, User, Wallet, Download } from "lucide-react";
import { format } from "date-fns";
import jsPDF from "jspdf";
import { trackDocumentWithId, uploadDocumentPDF } from "@/utils/documentTracker";
import { addPDFBrandingFooter } from "@/utils/pdfBranding";
import { savePdfNative } from "@/lib/nativeDownloadNotification";
import { toast } from "sonner";

interface WelfarePaymentLookupProps {
  welfareId: string;
}

export const WelfarePaymentLookup = ({ welfareId }: WelfarePaymentLookupProps) => {
  const [searchName, setSearchName] = useState("");
  const [searchMemberId, setSearchMemberId] = useState("");
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [results, setResults] = useState<any[] | null>(null);
  const [memberInfo, setMemberInfo] = useState<any>(null);


  const handleSearch = async () => {
    if (!searchName.trim() && !searchMemberId.trim()) return;
    setLoading(true);
    setResults(null);
    setMemberInfo(null);

    try {
      // Find member(s) matching criteria
      let query = supabase
        .from("welfare_members")
        .select("id, member_code, role, status, total_contributed, user_id, profiles:user_id(full_name, phone)")
        .eq("welfare_id", welfareId);

      if (searchMemberId.trim()) {
        query = query.ilike("member_code", `%${searchMemberId.trim()}%`);
      }

      const { data: members, error: mErr } = await query;
      if (mErr) throw mErr;

      // Filter by name if provided
      let filtered = members || [];
      if (searchName.trim()) {
        const nameLC = searchName.trim().toLowerCase();
        filtered = filtered.filter((m: any) =>
          (m.profiles?.full_name || "").toLowerCase().includes(nameLC)
        );
      }

      if (filtered.length === 0) {
        setResults([]);
        return;
      }

      // Use first matching member
      const member = filtered[0];
      setMemberInfo(member);

      // Fetch contributions for this member
      const { data: contributions, error: cErr } = await supabase
        .from("welfare_contributions")
        .select("id, gross_amount, net_amount, payment_status, mpesa_receipt_number, created_at, payment_reference")
        .eq("welfare_id", welfareId)
        .eq("member_id", member.id)
        .order("created_at", { ascending: false });

      if (cErr) throw cErr;
      setResults(contributions || []);
    } catch (err: any) {
      console.error("Payment lookup error:", err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const totalPaid = results?.filter(r => r.payment_status === "completed").reduce((sum, r) => sum + Number(r.gross_amount || 0), 0) || 0;
  const completedCount = results?.filter(r => r.payment_status === "completed").length || 0;

  const handleDownload = async () => {
    if (!memberInfo || !results || results.length === 0) return;
    setDownloading(true);
    try {
      const { serialNumber, documentId } = await trackDocumentWithId({
        documentType: "welfare_member_payments",
        documentTitle: "Member Payment Statement",
        entityType: "welfare",
        entityId: welfareId,
        metadata: { member_code: memberInfo.member_code, count: results.length },
      });

      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 14;

      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text("Member Payment Statement", pageWidth / 2, 20, { align: "center" });

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`Generated: ${format(new Date(), "dd MMM yyyy HH:mm")}`, pageWidth / 2, 27, { align: "center" });
      doc.setFont("helvetica", "bold");
      doc.text(`Serial No: ${serialNumber}`, pageWidth / 2, 33, { align: "center" });

      let y = 43;
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`Member: ${memberInfo.profiles?.full_name || "Unknown"}`, margin, y);
      y += 6;
      doc.text(`Member ID: ${memberInfo.member_code || "-"}`, margin, y);
      y += 6;
      doc.text(`Role: ${memberInfo.role || "-"}    Status: ${memberInfo.status || "-"}`, margin, y);
      y += 10;

      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text("Date", margin, y);
      doc.text("Time", margin + 32, y);
      doc.text("Amount (KES)", margin + 58, y);
      doc.text("Status", margin + 100, y);
      doc.text("Receipt", margin + 135, y);
      y += 7;
      doc.setFont("helvetica", "normal");

      results.forEach((tx: any) => {
        if (y > 250) {
          doc.addPage();
          y = 20;
        }
        const d = new Date(tx.created_at);
        doc.text(format(d, "dd MMM yyyy"), margin, y);
        doc.text(format(d, "HH:mm:ss"), margin + 32, y);
        doc.text(Number(tx.gross_amount || 0).toLocaleString(), margin + 58, y);
        doc.text(String(tx.payment_status || "-"), margin + 100, y);
        doc.text(String(tx.mpesa_receipt_number || tx.payment_reference || "-").substring(0, 20), margin + 135, y);
        y += 7;
      });

      y += 4;
      if (y > 250) {
        doc.addPage();
        y = 20;
      }
      doc.setFont("helvetica", "bold");
      doc.text(`Total Paid: KES ${totalPaid.toLocaleString()}`, margin, y);
      doc.text(`Completed Payments: ${completedCount}`, margin + 90, y);

      addPDFBrandingFooter(doc, serialNumber);

      const blob = doc.output("blob");
      const filename = `payments-${memberInfo.member_code || "member"}-${format(new Date(), "yyyy-MM-dd")}.pdf`;
      await savePdfNative(blob, filename);
      uploadDocumentPDF(documentId, serialNumber, blob).catch(() => {});
      toast.success("Payment statement downloaded");
    } catch (err) {
      console.error("Payment statement error:", err);
      toast.error("Could not generate payment statement");
    } finally {
      setDownloading(false);
    }
  };


  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Search className="h-4 w-4 text-primary" />
          Check Member Payments
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            placeholder="Search by name..."
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
          <Input
            placeholder="Search by Member ID..."
            value={searchMemberId}
            onChange={(e) => setSearchMemberId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
        </div>
        <Button onClick={handleSearch} disabled={loading || (!searchName.trim() && !searchMemberId.trim())} className="w-full sm:w-auto">
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
          Search
        </Button>

        {memberInfo && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-foreground">{memberInfo.profiles?.full_name || "Unknown"}</p>
                  <p className="text-xs text-muted-foreground font-mono">{memberInfo.member_code}</p>
                </div>
                <Badge variant="outline" className="capitalize">{memberInfo.role}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-3">
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Total Paid</p>
                    <p className="font-bold text-sm">KES {totalPaid.toLocaleString()}</p>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Payments</p>
                  <p className="font-bold text-sm">{completedCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {results !== null && results.length === 0 && !memberInfo && (
          <div className="text-center py-6 text-muted-foreground">
            <p>No member found matching your search.</p>
          </div>
        )}

        {results !== null && results.length > 0 && (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden sm:table-cell">Receipt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="text-xs">{format(new Date(tx.created_at), "dd MMM yyyy")}</TableCell>
                    <TableCell className="font-medium">KES {Number(tx.gross_amount || 0).toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge
                        variant={tx.payment_status === "completed" ? "default" : "secondary"}
                        className={tx.payment_status === "completed" ? "bg-green-500/10 text-green-700 border-green-200" : ""}
                      >
                        {tx.payment_status}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-xs text-muted-foreground font-mono">
                      {tx.mpesa_receipt_number || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {results !== null && results.length === 0 && memberInfo && (
          <div className="text-center py-6 text-muted-foreground">
            <p>No payment records found for this member.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
