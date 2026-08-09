import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FileText, Download, Loader2 } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, parseISO, startOfMonth, endOfMonth } from "date-fns";
import { savePdfNative } from "@/lib/nativeDownloadNotification";
import { trackDocumentWithId, uploadDocumentPDF } from "@/utils/documentTracker";
import { addPDFBrandingFooter } from "@/utils/pdfBranding";
import { maskPhone } from "@/utils/maskPhone";

interface Props {
  welfareId: string;
  welfareName: string;
  welfareCode?: string | null;
  canViewPhones?: boolean;
  issuedByName?: string | null;
  issuedByRole?: string | null;
}

/** SHA-256 of a string -> uppercase hex */
async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

export const WelfareContributionReport = ({
  welfareId,
  welfareName,
  welfareCode,
  canViewPhones = false,
  issuedByName,
  issuedByRole,
}: Props) => {
  const [month, setMonth] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(false);

  const applyMonth = (value: string) => {
    setMonth(value);
    if (!value) return;
    const base = parseISO(`${value}-01`);
    setStartDate(format(startOfMonth(base), "yyyy-MM-dd"));
    setEndDate(format(endOfMonth(base), "yyyy-MM-dd"));
  };

  const generateReport = async () => {
    if (!startDate || !endDate) {
      toast.error("Pick a month or a custom date range");
      return;
    }

    setLoading(true);
    try {
      const { data: contributions, error } = await supabase
        .from("welfare_contributions")
        .select(
          "gross_amount, net_amount, commission_amount, payment_status, payment_method, mpesa_receipt_number, created_at, member_id, user_id"
        )
        .eq("welfare_id", welfareId)
        .gte("created_at", startDate)
        .lte("created_at", endDate + "T23:59:59")
        .eq("payment_status", "completed")
        .order("created_at", { ascending: true })
        .limit(500);

      if (error) throw error;

      if (!contributions || contributions.length === 0) {
        toast.error("No contributions found in the selected period");
        setLoading(false);
        return;
      }

      const memberIds = [...new Set(contributions.map((c) => c.member_id))];
      const { data: members } = await supabase
        .from("welfare_members")
        .select("id, member_code, profiles(full_name, phone)")
        .eq("welfare_id", welfareId)
        .in("id", memberIds);

      const memberMap = new Map<string, any>();
      members?.forEach((m) => memberMap.set(m.id, m));

      const rows = contributions.map((c: any, i: number) => {
        const member = memberMap.get(c.member_id);
        const phoneRaw = member?.profiles?.phone || "";
        return [
          String(i + 1),
          format(parseISO(c.created_at), "dd MMM yyyy HH:mm"),
          member?.member_code || "-",
          member?.profiles?.full_name || "Unknown",
          canViewPhones ? phoneRaw || "-" : maskPhone(phoneRaw),
          c.mpesa_receipt_number || "-",
          Number(c.gross_amount || 0).toLocaleString("en-KE"),
          Number(c.commission_amount || 0).toLocaleString("en-KE"),
          Number(c.net_amount || 0).toLocaleString("en-KE"),
        ];
      });

      const totalGross = contributions.reduce((s, c: any) => s + Number(c.gross_amount || 0), 0);
      const totalCommission = contributions.reduce((s, c: any) => s + Number(c.commission_amount || 0), 0);
      const totalNet = contributions.reduce((s, c: any) => s + Number(c.net_amount || 0), 0);

      const issuedAt = new Date();
      const canonical = [
        welfareId,
        welfareName,
        issuedAt.toISOString(),
        `${startDate}..${endDate}`,
        String(contributions.length),
        totalGross.toFixed(2),
        totalNet.toFixed(2),
        ...rows.map((r) => r.join("|")),
      ].join("\n");
      const fullHash = await sha256Hex(canonical);
      const shortHash = fullHash.slice(0, 8);

      const { serialNumber, documentId } = await trackDocumentWithId({
        documentType: "welfare_contribution_report",
        documentTitle: `Contribution Report — ${welfareName}`,
        entityType: "welfare",
        entityId: welfareId,
        metadata: {
          startDate,
          endDate,
          count: contributions.length,
          total_gross: totalGross,
          total_net: totalNet,
          integrity_hash: fullHash,
          issued_by: issuedByName || null,
          issued_role: issuedByRole || null,
        },
      });

      const doc = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4",
        encryption: {
          ownerPassword: `PN-${serialNumber}-${shortHash}`,
          userPermissions: ["print"],
        },
      } as any);

      const pageWidth = doc.internal.pageSize.getWidth();

      // Header
      doc.setFillColor(22, 163, 74);
      doc.rect(0, 0, pageWidth, 32, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(15);
      doc.text("OFFICIAL CONTRIBUTION REPORT", pageWidth / 2, 12, { align: "center" });
      doc.setFontSize(11);
      doc.text(welfareName.toUpperCase(), pageWidth / 2, 19, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(
        `${welfareCode ? `Group Code: ${welfareCode}  •  ` : ""}Serial No: ${serialNumber}`,
        pageWidth / 2,
        26,
        { align: "center" }
      );

      doc.setTextColor(0, 0, 0);
      doc.setFontSize(9);
      doc.text(
        `Period: ${format(parseISO(startDate), "dd MMM yyyy")} – ${format(parseISO(endDate), "dd MMM yyyy")}`,
        14,
        40
      );
      doc.text(
        `Issued by: ${issuedByName || "Authorised Officer"}${issuedByRole ? ` (${issuedByRole})` : ""}`,
        14,
        45
      );
      doc.text(`Issued: ${issuedAt.toLocaleString()}`, pageWidth - 14, 40, { align: "right" });
      doc.text(`Payments: ${contributions.length}  •  Members: ${memberIds.length}`, pageWidth - 14, 45, {
        align: "right",
      });

      autoTable(doc, {
        startY: 50,
        head: [["#", "Date & Time", "Member ID", "Full Name", "Phone", "Receipt", "Gross", "Commission", "Net"]],
        body: rows,
        foot: [
          [
            "",
            "TOTALS",
            "",
            "",
            "",
            "",
            totalGross.toLocaleString("en-KE"),
            totalCommission.toLocaleString("en-KE"),
            totalNet.toLocaleString("en-KE"),
          ],
        ],
        styles: { fontSize: 8, cellPadding: 1.6 },
        headStyles: { fillColor: [22, 163, 74], textColor: 255, fontStyle: "bold" },
        footStyles: { fillColor: [232, 245, 236], textColor: 20, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [246, 248, 246] },
        columnStyles: {
          0: { cellWidth: 10 },
          2: { cellWidth: 26, font: "courier" },
          6: { halign: "right" },
          7: { halign: "right" },
          8: { halign: "right" },
        },
        margin: { left: 14, right: 14, bottom: 40 },
        didDrawPage: () => {
          const gs = (doc as any).GState ? (doc as any).GState({ opacity: 0.07 }) : null;
          if (gs) (doc as any).setGState(gs);
          doc.setTextColor(22, 163, 74);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(52);
          doc.text("CERTIFIED COPY", pageWidth / 2, 120, { align: "center", angle: 20 });
          if (gs) (doc as any).setGState((doc as any).GState({ opacity: 1 }));
          doc.setTextColor(0, 0, 0);
        },
      });

      let y = (doc as any).lastAutoTable.finalY + 8;
      if (y > 150) {
        doc.addPage();
        y = 20;
      }

      doc.setDrawColor(22, 163, 74);
      doc.setLineWidth(0.5);
      doc.rect(14, y, pageWidth - 28, 30);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text("CERTIFICATE OF AUTHENTICITY", 18, y + 6);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.text(
        doc.splitTextToSize(
          `This report was generated by the Pamojanova platform and is tracked under Serial No. ${serialNumber}. ` +
            `Any alteration invalidates this document. Verify authenticity by scanning the QR code below or by submitting the serial number to Pamojanova support. ` +
            `The integrity hash below is computed (SHA-256) over the exact records listed above.`,
          pageWidth - 36
        ),
        18,
        y + 12
      );
      doc.setFont("courier", "bold");
      doc.setFontSize(7);
      doc.text(`Integrity Hash (SHA-256): ${fullHash}`, 18, y + 26);

      addPDFBrandingFooter(doc, serialNumber);

      const blob = doc.output("blob");
      const safe = welfareName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      const filename = `contributions-${safe}-${startDate}-to-${endDate}-${serialNumber}.pdf`;
      await savePdfNative(blob, filename);
      uploadDocumentPDF(documentId, serialNumber, blob).catch(() => {});

      toast.success(`Report downloaded — Serial No. ${serialNumber}`);
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
          Pick a month (or a custom date range) to download a certified PDF of all payments made.
        </p>
        <div className="space-y-2">
          <Label>Month</Label>
          <Input type="month" value={month} onChange={(e) => applyMonth(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>From</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setMonth("");
              }}
            />
          </div>
          <div className="space-y-2">
            <Label>To</Label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setMonth("");
              }}
            />
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
