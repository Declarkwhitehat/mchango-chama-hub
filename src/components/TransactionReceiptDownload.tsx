import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileDown, Loader2 } from "lucide-react";
import jsPDF from "jspdf";
import { trackDocumentWithId, uploadDocumentPDF } from "@/utils/documentTracker";

interface AllocationLine {
  type: string;
  amount: number;
  destination: string;
  description: string;
  cycle_number?: number;
  debt_id?: string;
}

interface ReceiptData {
  transactionId: string;
  timestamp: string;
  memberCode: string;
  chamaName: string;
  grossAmount: number;
  mpesaReceipt?: string;
  allocations: AllocationLine[];
  totalToCompany: number;
  totalToRecipients: number;
  totalToCyclePot: number;
  carryForward: number;
  periodsCleared: number;
}

interface TransactionReceiptDownloadProps {
  receiptData: ReceiptData;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
  label?: string;
}

export function TransactionReceiptDownload({
  receiptData,
  variant = "outline",
  size = "sm",
  label = "Download Receipt"
}: TransactionReceiptDownloadProps) {
  const [generating, setGenerating] = useState(false);

  const generatePDF = async () => {
    setGenerating(true);
    try {
      const { serialNumber, documentId } = await trackDocumentWithId({
        documentType: "payment_receipt",
        documentTitle: `Receipt - ${receiptData.chamaName} - ${receiptData.memberCode}`,
        entityType: "chama",
        metadata: { transactionId: receiptData.transactionId, memberCode: receiptData.memberCode },
      });

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 20;
      let y = margin;

      // ── Header ──
      doc.setFillColor(22, 163, 74);
      doc.rect(0, 0, pageWidth, 40, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('CHAMA PAYMENT RECEIPT', pageWidth / 2, 13, { align: 'center' });
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Transaction ID: ${receiptData.transactionId}`, pageWidth / 2, 23, { align: 'center' });
      doc.setFont('helvetica', 'bold');
      doc.text(`Serial No: ${serialNumber}`, pageWidth / 2, 32, { align: 'center' });

      y = 50;
      doc.setTextColor(0, 0, 0);

      // ── Meta info ──
      doc.setFillColor(245, 245, 245);
      doc.rect(margin, y - 3, pageWidth - margin * 2, 35, 'F');
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Chama:', margin + 3, y + 5);
      doc.text('Member:', margin + 3, y + 13);
      doc.text('Date/Time:', margin + 3, y + 21);
      if (receiptData.mpesaReceipt) {
        doc.text('M-Pesa Ref:', margin + 3, y + 29);
      }

      doc.setFont('helvetica', 'normal');
      doc.text(receiptData.chamaName, margin + 40, y + 5);
      doc.text(receiptData.memberCode, margin + 40, y + 13);
      doc.text(new Date(receiptData.timestamp).toLocaleString(), margin + 40, y + 21);
      if (receiptData.mpesaReceipt) {
        doc.text(receiptData.mpesaReceipt, margin + 40, y + 29);
      }

      y += receiptData.mpesaReceipt ? 45 : 40;

      // ── Gross Amount ──
      doc.setFillColor(22, 163, 74);
      doc.setTextColor(255, 255, 255);
      doc.rect(margin, y, pageWidth - margin * 2, 12, 'F');
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text(`GROSS PAYMENT: KES ${receiptData.grossAmount.toLocaleString('en-KE', { minimumFractionDigits: 2 })}`, pageWidth / 2, y + 8, { align: 'center' });
      y += 18;

      doc.setTextColor(0, 0, 0);

      // ── Allocation Breakdown ──
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('PAYMENT ALLOCATION BREAKDOWN', margin, y + 6);
      y += 12;

      doc.setLineWidth(0.5);
      doc.setDrawColor(200, 200, 200);
      doc.line(margin, y, pageWidth - margin, y);
      y += 5;

      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setFillColor(240, 240, 240);
      doc.rect(margin, y - 2, pageWidth - margin * 2, 8, 'F');
      doc.text('#', margin + 2, y + 4);
      doc.text('Description', margin + 10, y + 4);
      doc.text('Destination', margin + 95, y + 4);
      doc.text('Amount (KES)', pageWidth - margin - 5, y + 4, { align: 'right' });
      y += 11;

      doc.setFont('helvetica', 'normal');
      let lineNum = 1;

      const typeLabels: Record<string, string> = {
        penalty_clearance: '💀 Penalty Cleared',
        principal_commission: '🏦 Commission (5%)',
        principal_clearance: '↗ Debt Principal',
        current_cycle_commission: '🏦 Commission',
        current_cycle: '✅ Current Cycle',
        carry_forward_commission: '🏦 Commission',
        carry_forward: '💰 Carry-forward',
        pending_cycle: '✅ Pending Cycle',
      };

      for (const line of receiptData.allocations) {
        if (y > 250) {
          doc.addPage();
          y = margin;
        }

        const isCommission = line.type.includes('commission') || line.type === 'penalty_clearance';
        if (isCommission) doc.setTextColor(180, 80, 0);
        else if (line.type === 'principal_clearance' || line.type === 'current_cycle') doc.setTextColor(22, 100, 40);
        else if (line.type === 'carry_forward') doc.setTextColor(30, 60, 180);
        else doc.setTextColor(0, 0, 0);

        doc.text(String(lineNum++), margin + 2, y);
        const descLabel = typeLabels[line.type] || line.type;
        doc.text(descLabel.substring(0, 40), margin + 10, y);
        doc.text((line.destination || '').substring(0, 30), margin + 95, y);
        doc.text(
          `${isCommission ? '- ' : ''}${line.amount.toFixed(2)}`,
          pageWidth - margin - 5,
          y,
          { align: 'right' }
        );

        doc.setTextColor(120, 120, 120);
        doc.setFontSize(7);
        doc.text(`  ${line.description || ''}`, margin + 10, y + 4);
        doc.setFontSize(9);

        y += 10;

        doc.setDrawColor(230, 230, 230);
        doc.line(margin, y - 2, pageWidth - margin, y - 2);
      }

      doc.setTextColor(0, 0, 0);
      y += 5;

      // ── Summary ──
      doc.setFillColor(240, 240, 240);
      doc.rect(margin, y, pageWidth - margin * 2, receiptData.totalToRecipients > 0 ? 45 : 35, 'F');
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');

      const summaryX = pageWidth - margin - 5;
      doc.setTextColor(180, 80, 0);
      doc.text('Total commissions to platform:', pageWidth / 2 + 5, y + 8);
      doc.setFont('helvetica', 'bold');
      doc.text(`KES ${receiptData.totalToCompany.toFixed(2)}`, summaryX, y + 8, { align: 'right' });

      if (receiptData.totalToRecipients > 0) {
        doc.setTextColor(22, 100, 40);
        doc.setFont('helvetica', 'normal');
        doc.text('Net to deficit recipients:', pageWidth / 2 + 5, y + 16);
        doc.setFont('helvetica', 'bold');
        doc.text(`KES ${receiptData.totalToRecipients.toFixed(2)}`, summaryX, y + 16, { align: 'right' });
      }

      const netCycleY = receiptData.totalToRecipients > 0 ? y + 24 : y + 16;
      doc.setTextColor(22, 100, 40);
      doc.setFont('helvetica', 'normal');
      doc.text('Net to cycle collection pot:', pageWidth / 2 + 5, netCycleY);
      doc.setFont('helvetica', 'bold');
      doc.text(`KES ${receiptData.totalToCyclePot.toFixed(2)}`, summaryX, netCycleY, { align: 'right' });

      const totalY = receiptData.totalToRecipients > 0 ? y + 35 : y + 27;
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('TOTAL:', pageWidth / 2 + 5, totalY);
      doc.text(`KES ${receiptData.grossAmount.toFixed(2)}`, summaryX, totalY, { align: 'right' });

      y = totalY + 15;

      // ── Footer ──
      doc.setFontSize(8);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(120, 120, 120);
      doc.text('This receipt is an official record of your chama contribution and payment allocation.', pageWidth / 2, y, { align: 'center' });
      doc.text('All commissions are deducted at source. Only net funds are allocated to the chama pool.', pageWidth / 2, y + 5, { align: 'center' });
      doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth / 2, y + 10, { align: 'center' });

      // Get blob and save
      const pdfBlob = doc.output('blob');
      const filename = `receipt-${receiptData.memberCode}-${receiptData.transactionId.substring(0, 8)}.pdf`;
      doc.save(filename);

      // Upload to storage in background
      uploadDocumentPDF(documentId, serialNumber, pdfBlob).catch(() => {});
    } catch (err) {
      console.error('Error generating receipt PDF:', err);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Button variant={variant} size={size} onClick={generatePDF} disabled={generating}>
      {generating ? (
        <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Generating...</>
      ) : (
        <><FileDown className="mr-1.5 h-3.5 w-3.5" />{label}</>
      )}
    </Button>
  );
}
