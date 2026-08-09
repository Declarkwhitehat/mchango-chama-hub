import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { trackDocumentWithId, uploadDocumentPDF } from "@/utils/documentTracker";
import { addPDFBrandingFooter } from "@/utils/pdfBranding";
import { maskPhone } from "@/utils/maskPhone";
import { savePdfNative } from "@/lib/nativeDownloadNotification";

interface Props {
  welfareId: string;
  welfareName: string;
  welfareCode?: string | null;
  members: any[];
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

export function WelfareMemberRegisterDownload({
  welfareId,
  welfareName,
  welfareCode,
  members,
  canViewPhones = false,
  issuedByName,
  issuedByRole,
}: Props) {
  const [generating, setGenerating] = useState(false);

  const generate = async () => {
    if (!members.length) {
      toast.error("No active members to include in the register");
      return;
    }
    setGenerating(true);
    try {
      const rows = members
        .slice()
        .sort((a, b) => String(a.member_code || "").localeCompare(String(b.member_code || "")))
        .map((m, i) => {
          const phoneRaw = m.profiles?.phone || m.phone || "";
          return [
            String(i + 1),
            m.member_code || "-",
            m.profiles?.full_name || "Unknown",
            canViewPhones ? (phoneRaw || "-") : maskPhone(phoneRaw),
            m.joined_at || m.created_at
              ? new Date(m.joined_at || m.created_at).toLocaleDateString("en-KE", {
                  year: "numeric",
                  month: "short",
                  day: "2-digit",
                })
              : "-",
            Number(m.total_contributed || 0).toLocaleString("en-KE", { minimumFractionDigits: 2 }),
          ];
        });

      const total = members.reduce((s, m) => s + Number(m.total_contributed || 0), 0);
      const issuedAt = new Date();

      // Tamper-evident integrity hash over the canonical content
      const canonical = [
        welfareId,
        welfareName,
        issuedAt.toISOString(),
        String(members.length),
        total.toFixed(2),
        ...rows.map((r) => r.join("|")),
      ].join("\n");
      const fullHash = await sha256Hex(canonical);
      const shortHash = fullHash.slice(0, 32);

      const { serialNumber, documentId } = await trackDocumentWithId({
        documentType: "welfare_member_register",
        documentTitle: `Member Register — ${welfareName}`,
        entityType: "welfare",
        entityId: welfareId,
        metadata: {
          members: members.length,
          total_contributed: total,
          integrity_hash: fullHash,
          issued_by: issuedByName || null,
          issued_role: issuedByRole || null,
        },
      });

      // Owner-password protected: printing allowed, editing/copying blocked in compliant readers
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
        encryption: {
          ownerPassword: `PN-${serialNumber}-${shortHash.slice(0, 8)}`,
          userPermissions: ["print"],
        },
      } as any);

      const pageWidth = doc.internal.pageSize.getWidth();

      // ── Header ──
      doc.setFillColor(22, 163, 74);
      doc.rect(0, 0, pageWidth, 34, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(15);
      doc.text("OFFICIAL MEMBER REGISTER", pageWidth / 2, 12, { align: "center" });
      doc.setFontSize(11);
      doc.text(welfareName.toUpperCase(), pageWidth / 2, 20, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(
        `${welfareCode ? `Group Code: ${welfareCode}  •  ` : ""}Serial No: ${serialNumber}`,
        pageWidth / 2,
        27,
        { align: "center" }
      );

      doc.setTextColor(0, 0, 0);
      doc.setFontSize(9);
      doc.text(`Issued: ${issuedAt.toLocaleString()}`, 14, 42);
      doc.text(
        `Issued by: ${issuedByName || "Authorised Officer"}${issuedByRole ? ` (${issuedByRole})` : ""}`,
        14,
        47
      );
      doc.text(`Active members: ${members.length}`, pageWidth - 14, 42, { align: "right" });
      doc.text(`Total deposited: KES ${total.toLocaleString("en-KE", { minimumFractionDigits: 2 })}`, pageWidth - 14, 47, {
        align: "right",
      });

      autoTable(doc, {
        startY: 53,
        head: [["#", "Member ID", "Full Name", "Phone", "Date Joined", "Deposited (KES)"]],
        body: rows,
        styles: { fontSize: 8, cellPadding: 1.8 },
        headStyles: { fillColor: [22, 163, 74], textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [246, 248, 246] },
        columnStyles: {
          0: { cellWidth: 10 },
          1: { cellWidth: 26, font: "courier" },
          3: { cellWidth: 28 },
          4: { cellWidth: 26 },
          5: { cellWidth: 28, halign: "right" },
        },
        margin: { left: 14, right: 14, bottom: 40 },
        didDrawPage: () => {
          // Diagonal tamper-evident watermark on every page
          const gs = (doc as any).GState ? (doc as any).GState({ opacity: 0.07 }) : null;
          if (gs) (doc as any).setGState(gs);
          doc.setTextColor(22, 163, 74);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(52);
          doc.text("CERTIFIED COPY", pageWidth / 2, 160, { align: "center", angle: 32 });
          if (gs) (doc as any).setGState((doc as any).GState({ opacity: 1 }));
          doc.setTextColor(0, 0, 0);
        },
      });

      let y = (doc as any).lastAutoTable.finalY + 8;
      if (y > 225) {
        doc.addPage();
        y = 20;
      }

      // ── Certification block ──
      doc.setDrawColor(22, 163, 74);
      doc.setLineWidth(0.5);
      doc.rect(14, y, pageWidth - 28, 34);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text("CERTIFICATE OF AUTHENTICITY", 18, y + 6);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.text(
        doc.splitTextToSize(
          `This register was generated by the Pamojanova platform and is tracked under Serial No. ${serialNumber}. ` +
            `Any alteration invalidates this document. Verify authenticity by scanning the QR code below or by submitting the serial number to Pamojanova support. ` +
            `The integrity hash below is computed (SHA-256) over the exact records listed above.`,
          pageWidth - 36
        ),
        18,
        y + 12
      );
      doc.setFont("courier", "bold");
      doc.setFontSize(7);
      doc.text(`Integrity Hash (SHA-256): ${fullHash}`, 18, y + 30);

      addPDFBrandingFooter(doc, serialNumber);

      const blob = doc.output("blob");
      const safe = welfareName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      await savePdfNative(blob, `member-register-${safe}-${serialNumber}.pdf`);
      uploadDocumentPDF(documentId, serialNumber, blob).catch(() => {});
      toast.success(`Register downloaded — Serial No. ${serialNumber}`);
    } catch (err: any) {
      console.error("Register PDF error:", err);
      toast.error(err?.message || "Failed to generate member register");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={generate} disabled={generating} className="gap-2">
      {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
      {generating ? "Generating..." : "Download Member Register"}
    </Button>
  );
}
