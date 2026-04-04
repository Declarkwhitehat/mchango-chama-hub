import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, Loader2, FileText } from "lucide-react";
import { jsPDF } from "jspdf";
import { format, subDays, subWeeks, subMonths, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { toast } from "sonner";
import { trackGeneratedDocument } from "@/utils/documentTracker";

interface Contribution {
  id: string;
  display_name: string;
  amount: number;
  created_at: string;
  payment_status?: string;
  phone?: string;
}

interface ContributionsPDFDownloadProps {
  title: string;
  contributions: Contribution[];
  targetAmount?: number;
  currentAmount?: number;
  commissionRate?: number;
}

type PeriodType = "today" | "week" | "month" | "all";

export const ContributionsPDFDownload = ({
  title,
  contributions,
  targetAmount,
  currentAmount,
  commissionRate = 0.07,
}: ContributionsPDFDownloadProps) => {
  const [period, setPeriod] = useState<PeriodType>("all");
  const [isGenerating, setIsGenerating] = useState(false);

  const getFilteredContributions = () => {
    const now = new Date();
    let startDate: Date;
    let endDate: Date = endOfDay(now);

    switch (period) {
      case "today":
        startDate = startOfDay(now);
        break;
      case "week":
        startDate = startOfWeek(now, { weekStartsOn: 1 });
        endDate = endOfWeek(now, { weekStartsOn: 1 });
        break;
      case "month":
        startDate = startOfMonth(now);
        endDate = endOfMonth(now);
        break;
      case "all":
      default:
        return contributions.filter(c => c.payment_status === 'completed' || !c.payment_status);
    }

    return contributions.filter((c) => {
      const date = new Date(c.created_at);
      const isCompleted = c.payment_status === 'completed' || !c.payment_status;
      return isCompleted && date >= startDate && date <= endDate;
    });
  };

  const getPeriodLabel = () => {
    const now = new Date();
    switch (period) {
      case "today":
        return format(now, "MMMM d, yyyy");
      case "week":
        return `Week of ${format(startOfWeek(now, { weekStartsOn: 1 }), "MMM d")} - ${format(endOfWeek(now, { weekStartsOn: 1 }), "MMM d, yyyy")}`;
      case "month":
        return format(now, "MMMM yyyy");
      case "all":
      default:
        return "All Time";
    }
  };

  const generatePDF = async () => {
    setIsGenerating(true);
    try {
      const filtered = getFilteredContributions();
      
      if (filtered.length === 0) {
        toast.error("No contributions found for the selected period");
        setIsGenerating(false);
        return;
      }

      const serialNumber = await trackGeneratedDocument({
        documentType: "contributions_report",
        documentTitle: `${title} - ${getPeriodLabel()}`,
        metadata: { period, count: filtered.length },
      });

      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 20;
      let yPos = 20;

      // Title
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text(title, pageWidth / 2, yPos, { align: "center" });
      yPos += 10;

      // Period
      doc.setFontSize(12);
      doc.setFont("helvetica", "normal");
      doc.text(`Contributions Report - ${getPeriodLabel()}`, pageWidth / 2, yPos, { align: "center" });
      yPos += 8;

      // Generated date + serial
      doc.setFontSize(10);
      doc.text(`Generated: ${format(new Date(), "MMMM d, yyyy 'at' h:mm a")}`, pageWidth / 2, yPos, { align: "center" });
      yPos += 6;
      doc.setFont("helvetica", "bold");
      doc.text(`Serial No: ${serialNumber}`, pageWidth / 2, yPos, { align: "center" });
      doc.setFont("helvetica", "normal");
      yPos += 6;
      yPos += 9;

      // Summary section
      const totalAmount = filtered.reduce((sum, c) => sum + c.amount, 0);
      const commission = totalAmount * commissionRate;
      const netAmount = totalAmount - commission;

      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("Summary", margin, yPos);
      yPos += 8;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(`Total Contributors: ${filtered.length}`, margin, yPos);
      yPos += 6;
      doc.text(`Total Collected: KES ${totalAmount.toLocaleString()}`, margin, yPos);
      yPos += 6;
      doc.text(`Commission (${(commissionRate * 100).toFixed(0)}%): KES ${commission.toLocaleString()}`, margin, yPos);
      yPos += 6;
      doc.text(`Net Amount: KES ${netAmount.toLocaleString()}`, margin, yPos);
      yPos += 6;

      if (targetAmount) {
        const progress = ((currentAmount || totalAmount) / targetAmount * 100).toFixed(1);
        doc.text(`Target: KES ${targetAmount.toLocaleString()} (${progress}% reached)`, margin, yPos);
        yPos += 6;
      }

      yPos += 10;

      // Table header
      doc.setFillColor(41, 128, 185);
      doc.rect(margin, yPos, pageWidth - 2 * margin, 8, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      
      doc.text("#", margin + 3, yPos + 5.5);
      doc.text("Name", margin + 15, yPos + 5.5);
      doc.text("Amount (KES)", margin + 90, yPos + 5.5);
      doc.text("Date", margin + 130, yPos + 5.5);
      
      yPos += 10;
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "normal");

      // Table rows
      filtered.forEach((contribution, index) => {
        // Check if we need a new page
        if (yPos > 270) {
          doc.addPage();
          yPos = 20;
          
          // Re-add header on new page
          doc.setFillColor(41, 128, 185);
          doc.rect(margin, yPos, pageWidth - 2 * margin, 8, "F");
          doc.setTextColor(255, 255, 255);
          doc.setFont("helvetica", "bold");
          doc.text("#", margin + 3, yPos + 5.5);
          doc.text("Name", margin + 15, yPos + 5.5);
          doc.text("Amount (KES)", margin + 90, yPos + 5.5);
          doc.text("Date", margin + 130, yPos + 5.5);
          yPos += 10;
          doc.setTextColor(0, 0, 0);
          doc.setFont("helvetica", "normal");
        }

        // Alternate row colors
        if (index % 2 === 0) {
          doc.setFillColor(245, 245, 245);
          doc.rect(margin, yPos - 4, pageWidth - 2 * margin, 8, "F");
        }

        doc.text(`${index + 1}`, margin + 3, yPos);
        
        // Truncate long names
        const name = contribution.display_name.length > 25 
          ? contribution.display_name.substring(0, 25) + "..." 
          : contribution.display_name;
        doc.text(name, margin + 15, yPos);
        
        doc.text(contribution.amount.toLocaleString(), margin + 90, yPos);
        doc.text(format(new Date(contribution.created_at), "MMM d, yyyy"), margin + 130, yPos);
        
        yPos += 8;
      });

      // Footer
      yPos += 10;
      doc.setFontSize(8);
      doc.setTextColor(128, 128, 128);
      doc.text("This report was generated by Mchango Chama Hub", pageWidth / 2, 285, { align: "center" });

      // Save the PDF
      const fileName = `${title.replace(/[^a-zA-Z0-9]/g, "_")}_${period}_${format(new Date(), "yyyy-MM-dd")}.pdf`;
      doc.save(fileName);
      
      toast.success("PDF downloaded successfully!");
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error("Failed to generate PDF");
    } finally {
      setIsGenerating(false);
    }
  };

  const filteredCount = getFilteredContributions().length;

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-4 bg-muted/50 rounded-lg">
      <div className="flex items-center gap-2">
        <FileText className="h-5 w-5 text-muted-foreground" />
        <span className="text-sm font-medium">Download Report</span>
      </div>
      
      <Select value={period} onValueChange={(v) => setPeriod(v as PeriodType)}>
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Select period" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="today">Today</SelectItem>
          <SelectItem value="week">This Week</SelectItem>
          <SelectItem value="month">This Month</SelectItem>
          <SelectItem value="all">All Time</SelectItem>
        </SelectContent>
      </Select>

      <Button
        onClick={generatePDF}
        disabled={isGenerating || filteredCount === 0}
        size="sm"
        className="gap-2"
      >
        {isGenerating ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        Download PDF ({filteredCount})
      </Button>
    </div>
  );
};
