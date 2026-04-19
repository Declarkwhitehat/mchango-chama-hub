import qrcode from "qrcode-generator";
import { jsPDF } from "jspdf";

const VERIFY_BASE_URL = "https://mchango-chama-hub.lovable.app/admin/documents";
const SUPPORT_EMAIL = "info@pamojanova.com";
const CUSTOMER_CARE = "+254 707 874 790";

/**
 * Adds a branded footer with QR code, serial number, contacts to a jsPDF document.
 * Call this at the end of every system-generated PDF.
 */
export function addPDFBrandingFooter(
  doc: jsPDF,
  serialNumber: string,
  options?: { y?: number }
) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageCount = doc.getNumberOfPages();

  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page);

    const footerY = pageHeight - 32;

    // Divider line
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.line(14, footerY, pageWidth - 14, footerY);

    // Generate QR code as data URL
    const qr = qrcode(0, "M");
    qr.addData(`${VERIFY_BASE_URL}?serial=${serialNumber}`);
    qr.make();
    const qrDataUrl = qr.createDataURL(3, 0);

    // Place QR code on the left
    const qrSize = 20;
    doc.addImage(qrDataUrl, "PNG", 14, footerY + 2, qrSize, qrSize);

    // Text next to QR
    const textX = 14 + qrSize + 4;
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.setFont("helvetica", "bold");
    doc.text(`Serial No: ${serialNumber}`, textX, footerY + 5);

    doc.setFont("helvetica", "normal");
    doc.text("Scan QR to verify this document", textX, footerY + 9);
    doc.text(`Customer Care: ${CUSTOMER_CARE}`, textX, footerY + 13);
    doc.text(`Email: ${SUPPORT_EMAIL}`, textX, footerY + 17);

    // Right side - branding
    doc.setFontSize(7);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(150, 150, 150);
    doc.text("Pamojanova — Mchango Chama Hub", pageWidth - 14, footerY + 5, { align: "right" });
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - 14, footerY + 9, { align: "right" });
    doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - 14, footerY + 13, { align: "right" });
  }
}
