import { useState } from "react";
import { jsPDF } from "jspdf";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { addPDFBrandingFooter } from "@/utils/pdfBranding";
import { NEXT_OF_KIN_NOTICE, type NextOfKinRecord } from "./NextOfKinForm";

interface Props {
  record: NextOfKinRecord;
  welfareName: string;
  memberCode?: string | null;
  memberName?: string | null;
}

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export function NextOfKinPDFDownload({ record, welfareName, memberCode, memberName }: Props) {
  const [busy, setBusy] = useState(false);

  const generate = () => {
    setBusy(true);
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();

      doc.setFillColor(16, 78, 61);
      doc.rect(0, 0, pageWidth, 30, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("PAMOJA NOVA", 14, 13);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text("Next of Kin Nomination Record", 14, 21);

      doc.setTextColor(30, 30, 30);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text(welfareName.toUpperCase(), 14, 44);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(90, 90, 90);
      doc.text(`Member: ${memberName || "—"}`, 14, 52);
      doc.text(`Member ID: ${memberCode || "—"}`, 14, 58);
      doc.text(`Submitted on: ${fmtDate(record.updated_at)}`, 14, 64);
      doc.text(`Editable from: ${fmtDate(record.locked_until)}`, 14, 70);

      doc.setDrawColor(210, 210, 210);
      doc.line(14, 76, pageWidth - 14, 76);

      doc.setTextColor(30, 30, 30);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("NOMINATED NEXT OF KIN", 14, 86);

      const relationship =
        record.relationship === "Other" ? record.relationship_other || "Other" : record.relationship;

      const rows: [string, string][] = [
        ["Full legal name", record.full_name],
        ["Phone number", record.phone],
        ["Date of birth", fmtDate(record.date_of_birth)],
        ["Relationship to member", relationship || "—"],
        ["Gender", record.gender ? record.gender.charAt(0).toUpperCase() + record.gender.slice(1) : "—"],
      ];

      let y = 96;
      doc.setFontSize(10);
      rows.forEach(([label, value]) => {
        doc.setFont("helvetica", "normal");
        doc.setTextColor(110, 110, 110);
        doc.text(label, 16, y);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(20, 20, 20);
        doc.text(String(value), 90, y);
        doc.setDrawColor(235, 235, 235);
        doc.line(14, y + 3, pageWidth - 14, y + 3);
        y += 12;
      });

      y += 6;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(30, 30, 30);
      doc.text("DECLARATION", 14, y);
      y += 7;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(80, 80, 80);
      const lines = doc.splitTextToSize(NEXT_OF_KIN_NOTICE, pageWidth - 28);
      doc.text(lines, 14, y);
      y += lines.length * 5 + 8;
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      doc.text(
        `Electronically accepted by ${memberName || "the member"} on ${fmtDate(record.acknowledged_at)}.`,
        14,
        y
      );
      y += 5;
      doc.text(
        "This record is confidential and accessible only to the member and Pamoja Nova administration.",
        14,
        y
      );

      const serial = `NOK-${(memberCode || "MEMBER").toUpperCase()}-${record.id.slice(0, 8).toUpperCase()}`;
      addPDFBrandingFooter(doc, serial);
      doc.save(`next-of-kin-${(memberCode || "record").toLowerCase()}.pdf`);
      toast.success("Next of kin record downloaded");
    } catch (e: any) {
      console.error(e);
      toast.error("Could not generate the document");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={generate} disabled={busy}>
      {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
      Download copy
    </Button>
  );
}
