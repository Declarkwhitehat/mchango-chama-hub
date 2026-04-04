import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import jsPDF from "jspdf";
import { format } from "date-fns";
import { trackDocumentWithId, uploadDocumentPDF } from "@/utils/documentTracker";

interface ActivityPDFDownloadProps {
  data: any[];
  type: "chama" | "mchango" | "withdrawals" | "all" | "organizations";
  chamaNames?: Map<string, string>;
  mchangoNames?: Map<string, string>;
  organizationNames?: Map<string, string>;
}

export const ActivityPDFDownload = ({ 
  data, 
  type, 
  chamaNames = new Map(), 
  mchangoNames = new Map(),
  organizationNames = new Map()
}: ActivityPDFDownloadProps) => {
  const { toast } = useToast();

  const generatePDF = async () => {
    if (data.length === 0) {
      toast({
        title: "No data",
        description: "There are no transactions to download",
        variant: "destructive",
      });
      return;
    }

    try {
      const titles: Record<string, string> = {
        chama: "Chama Contributions Report",
        mchango: "Campaign Donations Report",
        organizations: "Organization Donations Report",
        withdrawals: "Withdrawals Report",
        all: "All Transactions Report",
      };

      const serialNumber = await trackGeneratedDocument({
        documentType: "activity_report",
        documentTitle: titles[type],
        metadata: { type, count: data.length },
      });

      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text(titles[type], pageWidth / 2, 20, { align: "center" });
      
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`Generated: ${format(new Date(), "MMM dd, yyyy HH:mm")}`, pageWidth / 2, 28, { align: "center" });

      let serialY = 34;
      doc.setFont("helvetica", "bold");
      doc.text(`Serial No: ${serialNumber}`, pageWidth / 2, serialY, { align: "center" });
      doc.setFont("helvetica", "normal");
      serialY += 6;
      
      // Table headers and data based on type
      let startY = serialY + 6;
      const lineHeight = 8;
      const margin = 14;
      
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      
      if (type === "chama") {
        // Headers
        doc.text("Date", margin, startY);
        doc.text("Chama", margin + 35, startY);
        doc.text("Amount (KSh)", margin + 90, startY);
        doc.text("Status", margin + 130, startY);
        doc.text("Receipt", margin + 160, startY);
        
        startY += lineHeight;
        doc.setFont("helvetica", "normal");
        
        data.forEach((item: any, index: number) => {
          if (startY > 270) {
            doc.addPage();
            startY = 20;
          }
          
          const chamaName = item.chama?.name || chamaNames.get(item.chama_id) || "Unknown";
          
          doc.text(format(new Date(item.created_at), "MMM dd, yyyy"), margin, startY);
          doc.text(chamaName.substring(0, 20), margin + 35, startY);
          doc.text(item.amount?.toLocaleString() || "0", margin + 90, startY);
          doc.text(item.status || "N/A", margin + 130, startY);
          doc.text((item.mpesa_receipt_number || "-").substring(0, 15), margin + 160, startY);
          
          startY += lineHeight;
        });
      } else if (type === "mchango") {
        // Headers
        doc.text("Date", margin, startY);
        doc.text("Campaign", margin + 35, startY);
        doc.text("Amount (KSh)", margin + 100, startY);
        doc.text("Receipt", margin + 145, startY);
        
        startY += lineHeight;
        doc.setFont("helvetica", "normal");
        
        data.forEach((item: any) => {
          if (startY > 270) {
            doc.addPage();
            startY = 20;
          }
          
          const campaignName = item.mchango?.title || mchangoNames.get(item.mchango_id) || "Unknown";
          
          doc.text(format(new Date(item.created_at), "MMM dd, yyyy"), margin, startY);
          doc.text(campaignName.substring(0, 25), margin + 35, startY);
          doc.text(item.amount?.toLocaleString() || "0", margin + 100, startY);
          doc.text((item.payment_reference || "-").substring(0, 20), margin + 145, startY);
          
          startY += lineHeight;
        });
      } else if (type === "organizations") {
        // Headers
        doc.text("Date", margin, startY);
        doc.text("Organization", margin + 35, startY);
        doc.text("Amount (KSh)", margin + 100, startY);
        doc.text("Status", margin + 140, startY);
        doc.text("Receipt", margin + 170, startY);
        
        startY += lineHeight;
        doc.setFont("helvetica", "normal");
        
        data.forEach((item: any) => {
          if (startY > 270) {
            doc.addPage();
            startY = 20;
          }
          
          const orgName = item.organization?.name || organizationNames.get(item.organization_id) || "Unknown";
          
          doc.text(format(new Date(item.created_at), "MMM dd, yyyy"), margin, startY);
          doc.text(orgName.substring(0, 25), margin + 35, startY);
          doc.text(item.amount?.toLocaleString() || "0", margin + 100, startY);
          doc.text((item.payment_status || "N/A").substring(0, 10), margin + 140, startY);
          doc.text((item.mpesa_receipt_number || "-").substring(0, 12), margin + 170, startY);
          
          startY += lineHeight;
        });
      } else if (type === "withdrawals") {
        // Headers
        doc.text("Date", margin, startY);
        doc.text("Amount (KSh)", margin + 40, startY);
        doc.text("Status", margin + 85, startY);
        doc.text("Reference", margin + 120, startY);
        doc.text("Processed", margin + 160, startY);
        
        startY += lineHeight;
        doc.setFont("helvetica", "normal");
        
        data.forEach((item: any) => {
          if (startY > 270) {
            doc.addPage();
            startY = 20;
          }
          
          doc.text(format(new Date(item.created_at), "MMM dd, yyyy"), margin, startY);
          doc.text(item.amount?.toLocaleString() || "0", margin + 40, startY);
          doc.text(item.status || "N/A", margin + 85, startY);
          doc.text((item.payment_reference || "-").substring(0, 15), margin + 120, startY);
          doc.text(item.completed_at ? format(new Date(item.completed_at), "MMM dd") : "-", margin + 160, startY);
          
          startY += lineHeight;
        });
      } else {
        // All transactions
        doc.text("Date", margin, startY);
        doc.text("Type", margin + 35, startY);
        doc.text("Description", margin + 60, startY);
        doc.text("Amount", margin + 130, startY);
        doc.text("Status", margin + 165, startY);
        
        startY += lineHeight;
        doc.setFont("helvetica", "normal");
        
        data.forEach((item: any) => {
          if (startY > 270) {
            doc.addPage();
            startY = 20;
          }
          
          doc.text(format(new Date(item.created_at), "MMM dd, yy"), margin, startY);
          doc.text(item.type || "N/A", margin + 35, startY);
          doc.text((item.description || "N/A").substring(0, 28), margin + 60, startY);
          doc.text(item.amount?.toLocaleString() || "0", margin + 130, startY);
          doc.text((item.status || "N/A").substring(0, 10), margin + 165, startY);
          
          startY += lineHeight;
        });
      }
      
      // Summary
      startY += lineHeight;
      if (startY > 260) {
        doc.addPage();
        startY = 20;
      }
      
      doc.setFont("helvetica", "bold");
      const totalAmount = data.reduce((sum, item) => sum + (item.amount || 0), 0);
      doc.text(`Total: KSh ${totalAmount.toLocaleString()}`, margin, startY);
      doc.text(`Transactions: ${data.length}`, margin + 80, startY);
      
      // Save
      const filename = `${type}-transactions-${format(new Date(), "yyyy-MM-dd")}.pdf`;
      doc.save(filename);
      
      toast({
        title: "Download complete",
        description: `${filename} has been downloaded`,
      });
    } catch (error) {
      console.error("PDF generation error:", error);
      toast({
        title: "Error",
        description: "Failed to generate PDF",
        variant: "destructive",
      });
    }
  };

  return (
    <Button 
      variant="outline" 
      size="sm" 
      onClick={generatePDF}
      disabled={data.length === 0}
      className="gap-2"
    >
      <Download className="h-4 w-4" />
      Download PDF
    </Button>
  );
};
