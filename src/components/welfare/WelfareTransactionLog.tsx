import { useState, useEffect, useMemo } from "react";
import { notifyDownloadComplete } from "@/lib/nativeDownloadNotification";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, History, Search, Download, FileText, Eye, Users, Filter, X } from "lucide-react";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { jsPDF } from "jspdf";
import { toast } from "sonner";

interface Props {
  welfareId: string;
}

type PeriodType = "today" | "week" | "month" | "all";

export const WelfareTransactionLog = ({ welfareId }: Props) => {
  const [contributions, setContributions] = useState<any[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDetail, setSelectedDetail] = useState<any>(null);

  // Filters
  const [searchPhone, setSearchPhone] = useState("");
  const [searchName, setSearchName] = useState("");
  const [period, setPeriod] = useState<PeriodType>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<"contributions" | "withdrawals">("contributions");
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  useEffect(() => {
    fetchData();
  }, [welfareId]);

  const fetchData = async () => {
    try {
      const [contribRes, wdRes] = await Promise.all([
        supabase.functions.invoke(`welfare-contributions?welfare_id=${welfareId}`, { method: 'GET' }),
        supabase
          .from('withdrawals')
          .select('*, profiles:requested_by(full_name, phone)')
          .eq('welfare_id', welfareId)
          .order('created_at', { ascending: false }),
      ]);
      setContributions(contribRes.data?.data || []);
      setWithdrawals(wdRes.data || []);
    } catch (e) {
      console.error('Error fetching transactions:', e);
    } finally {
      setLoading(false);
    }
  };

  const filterByDate = (items: any[]) => {
    if (period === "all") return items;
    const now = new Date();
    let start: Date, end: Date = endOfDay(now);
    switch (period) {
      case "today": start = startOfDay(now); break;
      case "week": start = startOfWeek(now, { weekStartsOn: 1 }); end = endOfWeek(now, { weekStartsOn: 1 }); break;
      case "month": start = startOfMonth(now); end = endOfMonth(now); break;
      default: return items;
    }
    return items.filter(i => {
      const d = new Date(i.created_at);
      return d >= start && d <= end;
    });
  };

  const filteredContributions = useMemo(() => {
    let items = filterByDate(contributions);
    if (statusFilter !== "all") items = items.filter(c => c.payment_status === statusFilter);
    if (searchPhone) items = items.filter(c => (c.welfare_members?.profiles?.phone || "").includes(searchPhone));
    if (searchName) items = items.filter(c => (c.welfare_members?.profiles?.full_name || "").toLowerCase().includes(searchName.toLowerCase()));
    return items;
  }, [contributions, period, statusFilter, searchPhone, searchName]);

  const filteredWithdrawals = useMemo(() => {
    let items = filterByDate(withdrawals);
    if (statusFilter !== "all") items = items.filter(w => w.status === statusFilter);
    if (searchName) items = items.filter(w => ((w as any).profiles?.full_name || "").toLowerCase().includes(searchName.toLowerCase()));
    return items;
  }, [withdrawals, period, statusFilter, searchName]);

  const activeItems = activeTab === "contributions" ? filteredContributions : filteredWithdrawals;

  const statusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'default';
      case 'pending': case 'pending_approval': return 'secondary';
      case 'rejected': case 'failed': return 'destructive';
      default: return 'outline';
    }
  };

  const clearFilters = () => {
    setSearchPhone("");
    setSearchName("");
    setPeriod("all");
    setStatusFilter("all");
  };

  const hasFilters = searchPhone || searchName || period !== "all" || statusFilter !== "all";

  // Contributors summary
  const contributorsSummary = useMemo(() => {
    const map = new Map<string, { name: string; phone: string; total: number; count: number }>();
    const completed = contributions.filter(c => c.payment_status === 'completed');
    completed.forEach(c => {
      const name = c.welfare_members?.profiles?.full_name || 'Unknown';
      const phone = c.welfare_members?.profiles?.phone || '';
      const key = name + phone;
      const existing = map.get(key);
      if (existing) {
        existing.total += Number(c.gross_amount);
        existing.count += 1;
      } else {
        map.set(key, { name, phone, total: Number(c.gross_amount), count: 1 });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [contributions]);

  const generatePDF = async () => {
    setIsGeneratingPdf(true);
    try {
      const items = activeTab === "contributions" ? filteredContributions : filteredWithdrawals;
      if (items.length === 0) {
        toast.error("No records to export");
        return;
      }

      const doc = new jsPDF();
      const pw = doc.internal.pageSize.getWidth();
      const m = 15;
      let y = 20;

      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text(`Welfare ${activeTab === "contributions" ? "Contributions" : "Withdrawals"} Report`, pw / 2, y, { align: "center" });
      y += 8;

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`Generated: ${format(new Date(), "MMM d, yyyy 'at' h:mm a")}`, pw / 2, y, { align: "center" });
      y += 6;
      doc.text(`Period: ${period === "all" ? "All Time" : period}${hasFilters ? " (filtered)" : ""}`, pw / 2, y, { align: "center" });
      y += 10;

      // Summary
      const totalAmount = items.reduce((s, i) => s + Number(activeTab === "contributions" ? i.gross_amount : i.amount), 0);
      doc.setFont("helvetica", "bold");
      doc.text(`Total Records: ${items.length}   |   Total Amount: KES ${totalAmount.toLocaleString()}`, m, y);
      y += 10;

      // Table header
      doc.setFillColor(41, 128, 185);
      doc.rect(m, y, pw - 2 * m, 8, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(9);
      doc.text("#", m + 2, y + 5.5);
      doc.text("Name", m + 12, y + 5.5);
      doc.text("Phone", m + 65, y + 5.5);
      doc.text("Amount (KES)", m + 105, y + 5.5);
      doc.text("Date", m + 145, y + 5.5);
      y += 10;
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "normal");

      items.forEach((item, idx) => {
        if (y > 275) {
          doc.addPage();
          y = 20;
        }
        if (idx % 2 === 0) {
          doc.setFillColor(245, 245, 245);
          doc.rect(m, y - 4, pw - 2 * m, 7, "F");
        }
        const name = activeTab === "contributions"
          ? (item.welfare_members?.profiles?.full_name || "Member").substring(0, 20)
          : ((item as any).profiles?.full_name || "Unknown").substring(0, 20);
        const phone = activeTab === "contributions"
          ? (item.welfare_members?.profiles?.phone || "")
          : ((item as any).profiles?.phone || "");
        const amount = activeTab === "contributions" ? item.gross_amount : item.amount;

        doc.setFontSize(8);
        doc.text(`${idx + 1}`, m + 2, y);
        doc.text(name, m + 12, y);
        doc.text(phone, m + 65, y);
        doc.text(Number(amount).toLocaleString(), m + 105, y);
        doc.text(format(new Date(item.created_at), "MMM d, yyyy"), m + 145, y);
        y += 7;
      });

      y += 8;
      doc.setFontSize(7);
      doc.setTextColor(128, 128, 128);
      doc.text("Generated by Mchango Chama Hub", pw / 2, 290, { align: "center" });

      const pdfFilename = `welfare_${activeTab}_${format(new Date(), "yyyy-MM-dd")}.pdf`;
      doc.save(pdfFilename);
      notifyDownloadComplete(pdfFilename);
      toast.success("PDF downloaded!");
    } catch (e) {
      console.error(e);
      toast.error("Failed to generate PDF");
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  if (loading) return <Card><CardContent className="py-6 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></CardContent></Card>;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" /> Filter Transactions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Input
              placeholder="Search name..."
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              className="text-sm"
            />
            <Input
              placeholder="Phone number..."
              value={searchPhone}
              onChange={(e) => setSearchPhone(e.target.value)}
              className="text-sm"
            />
            <Select value={period} onValueChange={(v) => setPeriod(v as PeriodType)}>
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="Period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">This Week</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs gap-1">
              <X className="h-3 w-3" /> Clear filters
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Tab toggle + actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          <Button
            variant={activeTab === "contributions" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("contributions")}
            className="text-xs"
          >
            Contributions ({filteredContributions.length})
          </Button>
          <Button
            variant={activeTab === "withdrawals" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("withdrawals")}
            className="text-xs"
          >
            Withdrawals ({filteredWithdrawals.length})
          </Button>
        </div>
        <Button
          size="sm"
          onClick={generatePDF}
          disabled={isGeneratingPdf || activeItems.length === 0}
          className="gap-1.5 text-xs"
        >
          {isGeneratingPdf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          Download PDF ({activeItems.length})
        </Button>
      </div>

      {/* Transactions Table */}
      <Card>
        <CardContent className="p-0">
          {activeItems.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
              No {activeTab} found
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">#</TableHead>
                  <TableHead className="text-xs">Name</TableHead>
                  <TableHead className="text-xs hidden sm:table-cell">Phone</TableHead>
                  <TableHead className="text-xs">Amount</TableHead>
                  <TableHead className="text-xs hidden sm:table-cell">Date</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeItems.slice(0, 50).map((item, idx) => {
                  const isContrib = activeTab === "contributions";
                  const name = isContrib
                    ? (item.welfare_members?.profiles?.full_name || "Member")
                    : ((item as any).profiles?.full_name || "Unknown");
                  const phone = isContrib
                    ? (item.welfare_members?.profiles?.phone || "-")
                    : ((item as any).profiles?.phone || "-");
                  const amount = isContrib ? item.gross_amount : item.amount;
                  const status = isContrib ? item.payment_status : item.status;

                  return (
                    <TableRow key={item.id}>
                      <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell className="text-xs font-medium">{name}</TableCell>
                      <TableCell className="text-xs hidden sm:table-cell text-muted-foreground">{phone}</TableCell>
                      <TableCell className="text-xs font-medium">KES {Number(amount).toLocaleString()}</TableCell>
                      <TableCell className="text-xs hidden sm:table-cell text-muted-foreground">
                        {format(new Date(item.created_at), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusColor(status) as any} className="text-[10px]">{status}</Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedDetail(item)}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Contributors Summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" /> All Contributors ({contributorsSummary.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {contributorsSummary.length === 0 ? (
            <p className="text-sm text-muted-foreground">No contributors yet</p>
          ) : (
            <div className="space-y-1.5">
              {contributorsSummary.map((c, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded bg-muted/50 text-sm">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">{i + 1}</span>
                    <div>
                      <p className="font-medium text-xs">{c.name}</p>
                      <p className="text-[10px] text-muted-foreground">{c.phone || "No phone"} · {c.count} payment{c.count > 1 ? "s" : ""}</p>
                    </div>
                  </div>
                  <p className="font-semibold text-xs">KES {c.total.toLocaleString()}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment Detail Dialog */}
      <Dialog open={!!selectedDetail} onOpenChange={() => setSelectedDetail(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-sm mx-auto">
          <DialogHeader>
            <DialogTitle className="text-base text-center">Payment Details</DialogTitle>
          </DialogHeader>
          {selectedDetail && (
            <div className="space-y-3 text-sm">
              {[
                ["Name", activeTab === "contributions"
                  ? selectedDetail.welfare_members?.profiles?.full_name
                  : (selectedDetail as any).profiles?.full_name || "Unknown"],
                ["Phone", activeTab === "contributions"
                  ? selectedDetail.welfare_members?.profiles?.phone
                  : (selectedDetail as any).profiles?.phone || "-"],
                ["Gross Amount", `KES ${Number(activeTab === "contributions" ? selectedDetail.gross_amount : selectedDetail.amount).toLocaleString()}`],
                ...(activeTab === "contributions" ? [
                  ["Commission", `KES ${Number(selectedDetail.commission_amount || 0).toLocaleString()}`],
                  ["Net Amount", `KES ${Number(selectedDetail.net_amount || 0).toLocaleString()}`],
                ] : []),
                ["Status", activeTab === "contributions" ? selectedDetail.payment_status : selectedDetail.status],
                ["Reference", selectedDetail.payment_reference || "-"],
                ["Method", selectedDetail.payment_method || "-"],
                ["M-Pesa Receipt", selectedDetail.mpesa_receipt_number || "-"],
                ["Date", format(new Date(selectedDetail.created_at), "MMM d, yyyy 'at' h:mm a")],
                ...(activeTab === "withdrawals" && selectedDetail.notes ? [["Notes", selectedDetail.notes]] : []),
              ].map(([label, value]) => (
                <div key={label as string} className="flex flex-col gap-0.5">
                  <span className="text-muted-foreground text-xs">{label}</span>
                  <span className="font-medium break-all">{value as string}</span>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
