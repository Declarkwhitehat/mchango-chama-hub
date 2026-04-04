import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FileText, Download, Loader2 } from "lucide-react";
import jsPDF from "jspdf";
import { format, parseISO } from "date-fns";
import { trackDocumentWithId, uploadDocumentPDF } from "@/utils/documentTracker";

interface Props {
  welfareId: string;
  welfareName: string;
}

export const WelfareContributionReport = ({ welfareId, welfareName }: Props) => {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(false);

  const generateReport = async () => {
    if (!startDate || !endDate) {
      toast.error("Please select both start and end dates");
      return;
    }

    setLoading(true);
    try {
      // Fetch contributions in the date range
      const { data: contributions, error } = await supabase
        .from('welfare_contributions')
        .select('gross_amount, net_amount, commission_amount, payment_status, payment_method, mpesa_receipt_number, created_at, member_id, user_id')
        .eq('welfare_id', welfareId)
        .gte('created_at', startDate)
        .lte('created_at', endDate + 'T23:59:59')
        .eq('payment_status', 'completed')
        .order('created_at', { ascending: true })
        .limit(500);

      if (error) throw error;

      if (!contributions || contributions.length === 0) {
        toast.error("No contributions found in the selected period");
        setLoading(false);
        return;
      }

      // Fetch member profiles
      const memberIds = [...new Set(contributions.map(c => c.member_id))];
      const { data: members } = await supabase
        .from('welfare_members')
        .select('id, member_code, profiles(full_name, phone)')
        .eq('welfare_id', welfareId)
        .in('id', memberIds);

      const memberMap = new Map<string, any>();
      members?.forEach(m => memberMap.set(m.id, m));

      // Track document
      const { serialNumber, documentId } = await trackDocumentWithId({
        documentType: "contribution_report",
        documentTitle: `${welfareName} - Contribution Report`,
        entityType: "welfare",
        entityId: welfareId,
        metadata: { startDate, endDate, count: contributions.length },
      });

      // Generate PDF
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 14;

      // Title
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text(welfareName, pageWidth / 2, 18, { align: "center" });

      doc.setFontSize(12);
      doc.text("Contribution Report", pageWidth / 2, 26, { align: "center" });

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(
        `Period: ${format(parseISO(startDate), "MMM dd, yyyy")} – ${format(parseISO(endDate), "MMM dd, yyyy")}`,
        pageWidth / 2, 33, { align: "center" }
      );
      doc.text(`Generated: ${format(new Date(), "MMM dd, yyyy HH:mm")}`, pageWidth / 2, 39, { align: "center" });
      doc.setFont("helvetica", "bold");
      doc.text(`Serial No: ${serialNumber}`, pageWidth / 2, 45, { align: "center" });
      doc.setFont("helvetica", "normal");

      // Table headers
      let y = 50;
      const lineHeight = 7;

      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.text("Date", margin, y);
      doc.text("Member", margin + 30, y);
      doc.text("Code", margin + 75, y);
      doc.text("Gross (KES)", margin + 100, y);
      doc.text("Commission", margin + 130, y);
      doc.text("Net (KES)", margin + 160, y);

      // Divider line
      y += 2;
      doc.setDrawColor(200);
      doc.line(margin, y, pageWidth - margin, y);
      y += lineHeight;

      doc.setFont("helvetica", "normal");

      let totalGross = 0;
      let totalNet = 0;
      let totalCommission = 0;

      contributions.forEach((c: any) => {
        if (y > 270) {
          doc.addPage();
          y = 20;
        }

        const member = memberMap.get(c.member_id);
        const name = (member?.profiles?.full_name || 'Unknown').substring(0, 18);
        const code = member?.member_code || '-';
        const gross = c.gross_amount || 0;
        const commission = c.commission_amount || 0;
        const net = c.net_amount || 0;

        totalGross += gross;
        totalNet += net;
        totalCommission += commission;

        doc.text(format(parseISO(c.created_at), "MMM dd, yy"), margin, y);
        doc.text(name, margin + 30, y);
        doc.text(code.substring(0, 12), margin + 75, y);
        doc.text(gross.toLocaleString(), margin + 100, y);
        doc.text(commission.toLocaleString(), margin + 130, y);
        doc.text(net.toLocaleString(), margin + 160, y);

        y += lineHeight;
      });

      // Summary
      y += 4;
      if (y > 260) { doc.addPage(); y = 20; }

      doc.setDrawColor(200);
      doc.line(margin, y, pageWidth - margin, y);
      y += lineHeight;

      doc.setFont("helvetica", "bold");
      doc.text("TOTALS", margin, y);
      doc.text(totalGross.toLocaleString(), margin + 100, y);
      doc.text(totalCommission.toLocaleString(), margin + 130, y);
      doc.text(totalNet.toLocaleString(), margin + 160, y);

      y += lineHeight * 2;
      doc.setFontSize(9);
      doc.text(`Total Contributions: ${contributions.length}`, margin, y);
      doc.text(`Unique Members: ${memberIds.length}`, margin + 70, y);

      // Member summary section
      y += lineHeight * 2;
      if (y > 250) { doc.addPage(); y = 20; }

      doc.setFontSize(11);
      doc.text("Contributors Summary", margin, y);
      y += lineHeight;

      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.text("Member", margin, y);
      doc.text("Code", margin + 55, y);
      doc.text("Contributions", margin + 95, y);
      doc.text("Total (KES)", margin + 130, y);
      y += 2;
      doc.line(margin, y, pageWidth - margin, y);
      y += lineHeight;

      doc.setFont("helvetica", "normal");

      // Aggregate per member
      const memberTotals = new Map<string, { count: number; total: number }>();
      contributions.forEach((c: any) => {
        const existing = memberTotals.get(c.member_id) || { count: 0, total: 0 };
        existing.count++;
        existing.total += c.net_amount || 0;
        memberTotals.set(c.member_id, existing);
      });

      // Sort by total descending
      const sorted = [...memberTotals.entries()].sort((a, b) => b[1].total - a[1].total);

      sorted.forEach(([memberId, stats]) => {
        if (y > 270) { doc.addPage(); y = 20; }
        const member = memberMap.get(memberId);
        const name = (member?.profiles?.full_name || 'Unknown').substring(0, 22);
        const code = member?.member_code || '-';

        doc.text(name, margin, y);
        doc.text(code.substring(0, 14), margin + 55, y);
        doc.text(String(stats.count), margin + 95, y);
        doc.text(stats.total.toLocaleString(), margin + 130, y);
        y += lineHeight;
      });

      const pdfBlob = doc.output('blob');
      const filename = `${welfareName.replace(/\s+/g, '-')}-contributions-${startDate}-to-${endDate}.pdf`;
      doc.save(filename);

      // Upload to storage in background
      uploadDocumentPDF(documentId, serialNumber, pdfBlob).catch(() => {});

      toast.success(`Report downloaded: ${filename}`);
    } catch (error: any) {
      console.error("Report generation error:", error);
      toast.error(error.message || "Failed to generate report");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Contribution Report
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Select a date range to generate a PDF report of all contributions.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>From</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>To</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
        <Button onClick={generateReport} disabled={loading || !startDate || !endDate} className="w-full gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {loading ? "Generating..." : "Download PDF Report"}
        </Button>
      </CardContent>
    </Card>
  );
};
