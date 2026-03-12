import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Check, X, Clock, Users, Download, Loader2, FileText } from "lucide-react";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { jsPDF } from "jspdf";
import { toast } from "sonner";

interface Member {
  id: string;
  user_id: string | null;
  member_code: string;
  is_manager: boolean;
  status: string;
  balance_credit: number | null;
  balance_deficit: number | null;
  last_payment_date: string | null;
  order_index: number | null;
  profiles?: {
    full_name: string;
    phone: string | null;
  };
}

interface Contribution {
  id: string;
  member_id: string;
  amount: number;
  contribution_date: string;
  status: string;
  payment_reference: string;
}

interface PaymentStatusManagerProps {
  chamaId: string;
  chamaName: string;
  contributionAmount: number;
  commissionRate?: number;
}

type PeriodType = "today" | "week" | "month";

export const PaymentStatusManager = ({
  chamaId,
  chamaName,
  contributionAmount,
  commissionRate = 0,
}: PaymentStatusManagerProps) => {
  const [members, setMembers] = useState<Member[]>([]);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodType>("today");
  const [pdfPeriod, setPdfPeriod] = useState<PeriodType>("today");
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel(`chama-payments-${chamaId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "contributions",
          filter: `chama_id=eq.${chamaId}`,
        },
        () => fetchData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chamaId]);

  const fetchData = async () => {
    try {
      // Fetch members with profiles
      const { data: membersData, error: membersError } = await supabase
        .from("chama_members")
        .select(`
          id, user_id, member_code, is_manager, status,
          balance_credit, balance_deficit, last_payment_date, order_index,
          profiles:user_id (
            full_name,
            phone
          )
        `)
        .eq("chama_id", chamaId)
        .eq("status", "active")
        .order("order_index", { ascending: true });

      if (membersError) throw membersError;

      // Fetch contributions for the last month
      const startDate = startOfMonth(new Date());
      const { data: contributionsData, error: contributionsError } = await supabase
        .from("contributions")
        .select("*")
        .eq("chama_id", chamaId)
        .gte("contribution_date", startDate.toISOString())
        .order("contribution_date", { ascending: false });

      if (contributionsError) throw contributionsError;

      setMembers(membersData || []);
      setContributions(contributionsData || []);
    } catch (error) {
      console.error("Error fetching payment data:", error);
    } finally {
      setLoading(false);
    }
  };

  const getDateRange = (p: PeriodType) => {
    const now = new Date();
    switch (p) {
      case "today":
        return { start: startOfDay(now), end: endOfDay(now) };
      case "week":
        return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
      case "month":
        return { start: startOfMonth(now), end: endOfMonth(now) };
    }
  };

  const getContributionsForPeriod = (p: PeriodType) => {
    const { start, end } = getDateRange(p);
    return contributions.filter((c) => {
      const date = new Date(c.contribution_date);
      return date >= start && date <= end && c.status === "completed";
    });
  };

  const getMemberPaymentStatus = (memberId: string, p: PeriodType) => {
    const periodContributions = getContributionsForPeriod(p);
    const memberContributions = periodContributions.filter(
      (c) => c.member_id === memberId
    );
    const totalPaid = memberContributions.reduce((sum, c) => sum + c.amount, 0);
    return {
      paid: totalPaid >= contributionAmount,
      amount: totalPaid,
      contributions: memberContributions,
    };
  };

  const getPeriodLabel = (p: PeriodType) => {
    const now = new Date();
    switch (p) {
      case "today":
        return format(now, "MMMM d, yyyy");
      case "week":
        return `Week of ${format(startOfWeek(now, { weekStartsOn: 1 }), "MMM d")} - ${format(endOfWeek(now, { weekStartsOn: 1 }), "MMM d, yyyy")}`;
      case "month":
        return format(now, "MMMM yyyy");
    }
  };

  const paidMembers = members.filter((m) => getMemberPaymentStatus(m.id, period).paid);
  const unpaidMembers = members.filter((m) => !getMemberPaymentStatus(m.id, period).paid);

  const generatePDF = async () => {
    setIsGenerating(true);
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 20;
      let yPos = 20;

      const periodContributions = getContributionsForPeriod(pdfPeriod);
      const paidMembersForPdf = members.filter((m) => getMemberPaymentStatus(m.id, pdfPeriod).paid);
      const unpaidMembersForPdf = members.filter((m) => !getMemberPaymentStatus(m.id, pdfPeriod).paid);

      // Title
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text(chamaName, pageWidth / 2, yPos, { align: "center" });
      yPos += 10;

      // Period
      doc.setFontSize(12);
      doc.setFont("helvetica", "normal");
      doc.text(`Payment Report - ${getPeriodLabel(pdfPeriod)}`, pageWidth / 2, yPos, { align: "center" });
      yPos += 8;

      // Generated date
      doc.setFontSize(10);
      doc.text(`Generated: ${format(new Date(), "MMMM d, yyyy 'at' h:mm a")}`, pageWidth / 2, yPos, { align: "center" });
      yPos += 15;

      // Summary
      const totalCollected = periodContributions.reduce((sum, c) => sum + c.amount, 0);
      
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("Summary", margin, yPos);
      yPos += 8;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(`Total Members: ${members.length}`, margin, yPos);
      yPos += 6;
      doc.text(`Members Paid: ${paidMembersForPdf.length}`, margin, yPos);
      yPos += 6;
      doc.text(`Members Pending: ${unpaidMembersForPdf.length}`, margin, yPos);
      yPos += 6;
      doc.text(`Expected per Member: KES ${contributionAmount.toLocaleString()}`, margin, yPos);
      yPos += 6;
      doc.text(`Total Collected: KES ${totalCollected.toLocaleString()}`, margin, yPos);
      yPos += 15;

      // Paid Members Section
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(34, 139, 34);
      doc.text(`✓ Paid Members (${paidMembersForPdf.length})`, margin, yPos);
      yPos += 8;
      doc.setTextColor(0, 0, 0);

      if (paidMembersForPdf.length > 0) {
        // Table header
        doc.setFillColor(34, 139, 34);
        doc.rect(margin, yPos, pageWidth - 2 * margin, 8, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.text("#", margin + 3, yPos + 5.5);
        doc.text("Name", margin + 15, yPos + 5.5);
        doc.text("Phone", margin + 80, yPos + 5.5);
        doc.text("Amount", margin + 120, yPos + 5.5);
        doc.text("Date", margin + 145, yPos + 5.5);
        yPos += 10;
        doc.setTextColor(0, 0, 0);
        doc.setFont("helvetica", "normal");

        paidMembersForPdf.forEach((member, index) => {
          if (yPos > 270) {
            doc.addPage();
            yPos = 20;
          }

          const status = getMemberPaymentStatus(member.id, pdfPeriod);
          const lastContribution = status.contributions[0];
          
          if (index % 2 === 0) {
            doc.setFillColor(240, 255, 240);
            doc.rect(margin, yPos - 4, pageWidth - 2 * margin, 8, "F");
          }

          doc.text(`${index + 1}`, margin + 3, yPos);
          const name = member.profiles?.full_name || member.member_code;
          doc.text(name.substring(0, 20), margin + 15, yPos);
          doc.text(member.profiles?.phone || "-", margin + 80, yPos);
          doc.text(`${status.amount.toLocaleString()}`, margin + 120, yPos);
          doc.text(lastContribution ? format(new Date(lastContribution.contribution_date), "MMM d") : "-", margin + 145, yPos);
          yPos += 8;
        });
      } else {
        doc.setFontSize(10);
        doc.setFont("helvetica", "italic");
        doc.text("No payments recorded for this period", margin, yPos);
        yPos += 8;
      }

      yPos += 10;

      // Unpaid Members Section
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(220, 53, 69);
      doc.text(`✗ Pending Payment (${unpaidMembersForPdf.length})`, margin, yPos);
      yPos += 8;
      doc.setTextColor(0, 0, 0);

      if (unpaidMembersForPdf.length > 0) {
        // Table header
        doc.setFillColor(220, 53, 69);
        doc.rect(margin, yPos, pageWidth - 2 * margin, 8, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.text("#", margin + 3, yPos + 5.5);
        doc.text("Name", margin + 15, yPos + 5.5);
        doc.text("Phone", margin + 80, yPos + 5.5);
        doc.text("Amount Due", margin + 130, yPos + 5.5);
        yPos += 10;
        doc.setTextColor(0, 0, 0);
        doc.setFont("helvetica", "normal");

        unpaidMembersForPdf.forEach((member, index) => {
          if (yPos > 270) {
            doc.addPage();
            yPos = 20;
          }

          const status = getMemberPaymentStatus(member.id, pdfPeriod);
          const amountDue = contributionAmount - status.amount;
          
          if (index % 2 === 0) {
            doc.setFillColor(255, 240, 240);
            doc.rect(margin, yPos - 4, pageWidth - 2 * margin, 8, "F");
          }

          doc.text(`${index + 1}`, margin + 3, yPos);
          const name = member.profiles?.full_name || member.member_code;
          doc.text(name.substring(0, 20), margin + 15, yPos);
          doc.text(member.profiles?.phone || "-", margin + 80, yPos);
          doc.text(`${amountDue.toLocaleString()}`, margin + 130, yPos);
          yPos += 8;
        });
      } else {
        doc.setFontSize(10);
        doc.setFont("helvetica", "italic");
        doc.setTextColor(34, 139, 34);
        doc.text("All members have paid! 🎉", margin, yPos);
      }

      // Footer
      doc.setFontSize(8);
      doc.setTextColor(128, 128, 128);
      doc.text("This report was generated by Mchango Chama Hub", pageWidth / 2, 285, { align: "center" });

      const fileName = `${chamaName.replace(/[^a-zA-Z0-9]/g, "_")}_payments_${pdfPeriod}_${format(new Date(), "yyyy-MM-dd")}.pdf`;
      doc.save(fileName);
      
      toast.success("PDF downloaded successfully!");
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error("Failed to generate PDF");
    } finally {
      setIsGenerating(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Payment Status
          </CardTitle>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <Select value={pdfPeriod} onValueChange={(v) => setPdfPeriod(v as PeriodType)}>
                <SelectTrigger className="w-[120px] h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="week">This Week</SelectItem>
                  <SelectItem value="month">This Month</SelectItem>
                </SelectContent>
              </Select>
              <Button
                onClick={generatePDF}
                disabled={isGenerating}
                size="sm"
                variant="outline"
                className="gap-1"
              >
                {isGenerating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                PDF
              </Button>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={period} onValueChange={(v) => setPeriod(v as PeriodType)}>
          <TabsList className="grid w-full grid-cols-3 mb-4">
            <TabsTrigger value="today">Today</TabsTrigger>
            <TabsTrigger value="week">This Week</TabsTrigger>
            <TabsTrigger value="month">This Month</TabsTrigger>
          </TabsList>

          <div className="mb-4 p-3 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground">{getPeriodLabel(period)}</p>
            <div className="flex gap-4 mt-2">
              <Badge variant="default" className="bg-green-600">
                <Check className="h-3 w-3 mr-1" />
                {paidMembers.length} Paid
              </Badge>
              <Badge variant="destructive">
                <X className="h-3 w-3 mr-1" />
                {unpaidMembers.length} Pending
              </Badge>
            </div>
          </div>

          <TabsContent value={period} className="space-y-4">
            {/* Paid Members */}
            {paidMembers.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-green-600 mb-2 flex items-center gap-1">
                  <Check className="h-4 w-4" />
                  Paid ({paidMembers.length})
                </h4>
                <div className="space-y-2">
                  {paidMembers.map((member) => {
                    const status = getMemberPaymentStatus(member.id, period);
                    return (
                      <div
                        key={member.id}
                        className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center">
                            <Check className="h-4 w-4 text-white" />
                          </div>
                          <div>
                            <p className="font-medium">
                              {member.profiles?.full_name || member.member_code}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {member.profiles?.phone || "No phone"}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-green-600">
                            KES {status.amount.toLocaleString()}
                          </p>
                          {status.contributions[0] && (
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(status.contributions[0].contribution_date), "MMM d, h:mm a")}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Unpaid Members */}
            {unpaidMembers.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-red-600 mb-2 flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  Pending Payment ({unpaidMembers.length})
                </h4>
                <div className="space-y-2">
                  {unpaidMembers.map((member) => {
                    const status = getMemberPaymentStatus(member.id, period);
                    const amountDue = contributionAmount - status.amount;
                    return (
                      <div
                        key={member.id}
                        className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200 dark:border-red-800"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900 flex items-center justify-center">
                            <X className="h-4 w-4 text-red-600" />
                          </div>
                          <div>
                            <p className="font-medium">
                              {member.profiles?.full_name || member.member_code}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {member.profiles?.phone || "No phone"}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          {status.amount > 0 ? (
                            <>
                              <p className="text-sm text-muted-foreground">
                                Paid: KES {status.amount.toLocaleString()}
                              </p>
                              <p className="font-semibold text-red-600">
                                Due: KES {amountDue.toLocaleString()}
                              </p>
                            </>
                          ) : (
                            <p className="font-semibold text-red-600">
                              KES {contributionAmount.toLocaleString()} due
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {members.length === 0 && (
              <p className="text-center text-muted-foreground py-8">
                No active members in this chama
              </p>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};
