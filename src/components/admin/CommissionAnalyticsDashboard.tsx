import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  DollarSign, TrendingUp, Loader2, Heart, Users, Percent,
  ArrowUpRight, ArrowDownRight, Calendar, BarChart3, Building2,
  Download, FileText, Filter, PieChart as PieChartIcon
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, AreaChart, Area, PieChart, Pie, Cell
} from "recharts";
import {
  format, subDays, startOfDay, endOfDay, startOfMonth, endOfMonth,
  subMonths, parseISO, eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval,
  startOfWeek, endOfWeek, isWithinInterval
} from "date-fns";
import {
  MCHANGO_COMMISSION_RATE,
  CHAMA_DEFAULT_COMMISSION_RATE,
  CHAMA_LATE_COMMISSION_RATE,
  ORGANIZATION_COMMISSION_RATE,
  formatCommissionPercentage
} from "@/utils/commissionCalculator";
import jsPDF from "jspdf";

interface LedgerEntry {
  id: string;
  source_type: string;
  transaction_type: string;
  gross_amount: number;
  commission_amount: number;
  commission_rate: number;
  net_amount: number;
  payer_name: string | null;
  payer_phone: string | null;
  description: string | null;
  source_id: string;
  reference_id: string | null;
  created_at: string;
}

interface SummaryData {
  totalGross: number;
  totalCommission: number;
  totalNet: number;
  mchangoCommission: number;
  chamaCommission: number;
  orgCommission: number;
  mchangoGross: number;
  chamaGross: number;
  orgGross: number;
  transactionCount: number;
}

interface TrendPoint {
  label: string;
  mchango: number;
  chama: number;
  organizations: number;
  total: number;
}

const COLORS = ["#ec4899", "#3b82f6", "#a855f7", "#10b981"];

export const CommissionAnalyticsDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [ledgerData, setLedgerData] = useState<LedgerEntry[]>([]);
  const [summary, setSummary] = useState<SummaryData>({
    totalGross: 0, totalCommission: 0, totalNet: 0,
    mchangoCommission: 0, chamaCommission: 0, orgCommission: 0,
    mchangoGross: 0, chamaGross: 0, orgGross: 0, transactionCount: 0
  });
  const [trendData, setTrendData] = useState<TrendPoint[]>([]);
  const [dateFrom, setDateFrom] = useState(format(new Date(), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [liveVerification, setLiveVerification] = useState<{
    mchangoDonations: number;
    orgDonations: number;
    chamaContributions: number;
    totalLive: number;
  } | null>(null);
  const [sourceFilter, setSourceFilter] = useState("all");
  const [trendPeriod, setTrendPeriod] = useState<"daily" | "weekly" | "monthly">("weekly");
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchData();
    fetchLiveVerification();
  }, [dateFrom, dateTo, sourceFilter]);

  useEffect(() => {
    buildTrendData();
  }, [ledgerData, trendPeriod]);

  const fetchLiveVerification = async () => {
    try {
      const fromISO = startOfDay(parseISO(dateFrom)).toISOString();
      const toISO = endOfDay(parseISO(dateTo)).toISOString();

      const [mchangoRes, orgRes] = await Promise.all([
        supabase.from("mchango_donations")
          .select("commission_amount")
          .eq("payment_status", "completed")
          .gte("completed_at", fromISO)
          .lte("completed_at", toISO),
        supabase.from("organization_donations")
          .select("commission_amount")
          .eq("payment_status", "completed")
          .gte("completed_at", fromISO)
          .lte("completed_at", toISO),
      ]);

      const mchangoTotal = (mchangoRes.data || []).reduce((s, d) => s + Number(d.commission_amount || 0), 0);
      const orgTotal = (orgRes.data || []).reduce((s, d) => s + Number(d.commission_amount || 0), 0);

      setLiveVerification({
        mchangoDonations: mchangoTotal,
        orgDonations: orgTotal,
        chamaContributions: 0, // chama commissions are in financial_ledger only
        totalLive: mchangoTotal + orgTotal,
      });
    } catch (err) {
      console.error("Live verification error:", err);
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from("financial_ledger")
        .select("*")
        .gte("created_at", startOfDay(parseISO(dateFrom)).toISOString())
        .lte("created_at", endOfDay(parseISO(dateTo)).toISOString())
        .order("created_at", { ascending: false });

      if (sourceFilter !== "all") {
        query = query.eq("source_type", sourceFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      const entries = (data || []) as LedgerEntry[];
      setLedgerData(entries);

      const s: SummaryData = {
        totalGross: 0, totalCommission: 0, totalNet: 0,
        mchangoCommission: 0, chamaCommission: 0, orgCommission: 0,
        mchangoGross: 0, chamaGross: 0, orgGross: 0,
        transactionCount: entries.length
      };

      for (const e of entries) {
        s.totalGross += Number(e.gross_amount);
        s.totalCommission += Number(e.commission_amount);
        s.totalNet += Number(e.net_amount);
        if (e.source_type === "mchango") {
          s.mchangoCommission += Number(e.commission_amount);
          s.mchangoGross += Number(e.gross_amount);
        } else if (e.source_type === "chama") {
          s.chamaCommission += Number(e.commission_amount);
          s.chamaGross += Number(e.gross_amount);
        } else if (e.source_type === "organization") {
          s.orgCommission += Number(e.commission_amount);
          s.orgGross += Number(e.gross_amount);
        }
      }
      setSummary(s);
    } catch (err: any) {
      console.error(err);
      toast({ title: "Error", description: "Failed to load commission data", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const buildTrendData = () => {
    if (!ledgerData.length) { setTrendData([]); return; }
    const from = parseISO(dateFrom);
    const to = parseISO(dateTo);

    let intervals: { start: Date; end: Date; label: string }[] = [];

    if (trendPeriod === "daily") {
      intervals = eachDayOfInterval({ start: from, end: to }).map(d => ({
        start: startOfDay(d), end: endOfDay(d), label: format(d, "MMM dd")
      }));
    } else if (trendPeriod === "weekly") {
      intervals = eachWeekOfInterval({ start: from, end: to }).map(d => ({
        start: startOfWeek(d), end: endOfWeek(d), label: format(d, "MMM dd")
      }));
    } else {
      intervals = eachMonthOfInterval({ start: from, end: to }).map(d => ({
        start: startOfMonth(d), end: endOfMonth(d), label: format(d, "MMM yyyy")
      }));
    }

    const points: TrendPoint[] = intervals.map(iv => {
      const bucket = ledgerData.filter(e => {
        const d = parseISO(e.created_at);
        return isWithinInterval(d, { start: iv.start, end: iv.end });
      });
      const mchango = bucket.filter(e => e.source_type === "mchango").reduce((s, e) => s + Number(e.commission_amount), 0);
      const chama = bucket.filter(e => e.source_type === "chama").reduce((s, e) => s + Number(e.commission_amount), 0);
      const organizations = bucket.filter(e => e.source_type === "organization").reduce((s, e) => s + Number(e.commission_amount), 0);
      return { label: iv.label, mchango, chama, organizations, total: mchango + chama + organizations };
    });

    setTrendData(points);
  };

  const pieData = [
    { name: "Mchango", value: summary.mchangoCommission, color: COLORS[0] },
    { name: "Chama", value: summary.chamaCommission, color: COLORS[1] },
    { name: "Organizations", value: summary.orgCommission, color: COLORS[2] },
  ].filter(d => d.value > 0);

  const downloadStatement = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Header
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text("COMMISSION STATEMENT", pageWidth / 2, 20, { align: "center" });
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Period: ${format(parseISO(dateFrom), "dd MMM yyyy")} - ${format(parseISO(dateTo), "dd MMM yyyy")}`, pageWidth / 2, 28, { align: "center" });
    doc.text(`Generated: ${format(new Date(), "dd MMM yyyy HH:mm")}`, pageWidth / 2, 34, { align: "center" });
    doc.text(`Source: ${sourceFilter === "all" ? "All Sources" : sourceFilter}`, pageWidth / 2, 40, { align: "center" });

    // Summary box
    doc.setDrawColor(0);
    doc.setFillColor(245, 245, 245);
    doc.roundedRect(14, 46, pageWidth - 28, 36, 2, 2, "FD");
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("SUMMARY", 20, 56);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Total Gross Collected: KES ${summary.totalGross.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 20, 64);
    doc.text(`Total Commission Earned: KES ${summary.totalCommission.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 20, 72);
    doc.text(`Total Net (Client Funds): KES ${summary.totalNet.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 20, 80);
    doc.text(`Transactions: ${summary.transactionCount}`, pageWidth - 60, 64);

    // Breakdown
    let y = 92;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("COMMISSION BY SOURCE", 20, y); y += 8;

    const sources = [
      { name: "Mchango (Campaigns)", rate: "7%", gross: summary.mchangoGross, commission: summary.mchangoCommission },
      { name: "Chama (Groups)", rate: "5-10%", gross: summary.chamaGross, commission: summary.chamaCommission },
      { name: "Organizations (NGOs)", rate: "5%", gross: summary.orgGross, commission: summary.orgCommission },
    ];

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("Source", 20, y);
    doc.text("Rate", 80, y);
    doc.text("Gross (KES)", 105, y);
    doc.text("Commission (KES)", 145, y);
    y += 2;
    doc.line(20, y, pageWidth - 20, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    for (const src of sources) {
      doc.text(src.name, 20, y);
      doc.text(src.rate, 80, y);
      doc.text(src.gross.toLocaleString(undefined, { minimumFractionDigits: 2 }), 105, y);
      doc.text(src.commission.toLocaleString(undefined, { minimumFractionDigits: 2 }), 145, y);
      y += 7;
    }

    y += 4;
    doc.line(20, y, pageWidth - 20, y);
    y += 6;
    doc.setFont("helvetica", "bold");
    doc.text("TOTAL", 20, y);
    doc.text(summary.totalGross.toLocaleString(undefined, { minimumFractionDigits: 2 }), 105, y);
    doc.text(summary.totalCommission.toLocaleString(undefined, { minimumFractionDigits: 2 }), 145, y);
    y += 12;

    // Transaction details
    doc.setFontSize(11);
    doc.text("TRANSACTION DETAILS", 20, y); y += 8;

    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.text("Date", 14, y);
    doc.text("Source", 40, y);
    doc.text("Payer", 68, y);
    doc.text("Gross", 108, y);
    doc.text("Rate", 130, y);
    doc.text("Commission", 145, y);
    doc.text("Net", 175, y);
    y += 2;
    doc.line(14, y, pageWidth - 14, y);
    y += 5;

    doc.setFont("helvetica", "normal");
    for (const entry of ledgerData.slice(0, 60)) {
      if (y > 280) {
        doc.addPage();
        y = 20;
      }
      doc.text(format(parseISO(entry.created_at), "dd/MM/yy"), 14, y);
      doc.text(entry.source_type, 40, y);
      doc.text((entry.payer_name || entry.payer_phone || "-").substring(0, 18), 68, y);
      doc.text(Number(entry.gross_amount).toFixed(2), 108, y);
      doc.text(`${(Number(entry.commission_rate) * 100).toFixed(0)}%`, 130, y);
      doc.text(Number(entry.commission_amount).toFixed(2), 145, y);
      doc.text(Number(entry.net_amount).toFixed(2), 175, y);
      y += 5;
    }

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(128);
    doc.text("This is a system-generated commission statement. Confidential.", pageWidth / 2, 290, { align: "center" });

    doc.save(`commission-statement-${dateFrom}-to-${dateTo}.pdf`);
    toast({ title: "Downloaded", description: "Commission statement PDF saved" });
  };

  const downloadCSV = () => {
    const headers = ["Date", "Source", "Type", "Payer", "Phone", "Gross", "Rate", "Commission", "Net", "Description"];
    const rows = ledgerData.map(e => [
      format(parseISO(e.created_at), "yyyy-MM-dd HH:mm"),
      e.source_type, e.transaction_type,
      e.payer_name || "", e.payer_phone || "",
      Number(e.gross_amount).toFixed(2),
      `${(Number(e.commission_rate) * 100).toFixed(0)}%`,
      Number(e.commission_amount).toFixed(2),
      Number(e.net_amount).toFixed(2),
      e.description || ""
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `commission-data-${dateFrom}-to-${dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Downloaded", description: "CSV export saved" });
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const tooltipStyle = {
    backgroundColor: "hsl(var(--background))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "8px",
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <DollarSign className="h-8 w-8 text-primary" />
            Commission Analytics
          </h1>
          <p className="text-muted-foreground mt-1">
            {dateFrom === dateTo && dateFrom === format(new Date(), "yyyy-MM-dd") 
              ? "Showing today's commission data" 
              : `Showing data from ${format(parseISO(dateFrom), "dd MMM yyyy")} to ${format(parseISO(dateTo), "dd MMM yyyy")}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={downloadCSV}>
            <Download className="h-4 w-4 mr-2" /> CSV
          </Button>
          <Button onClick={downloadStatement}>
            <FileText className="h-4 w-4 mr-2" /> PDF Statement
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-col md:flex-row gap-4 items-end">
            <div className="flex-1 space-y-1">
              <label className="text-sm font-medium text-muted-foreground">From</label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-sm font-medium text-muted-foreground">To</label>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-sm font-medium text-muted-foreground">Source</label>
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sources</SelectItem>
                  <SelectItem value="mchango">Mchango</SelectItem>
                  <SelectItem value="chama">Chama</SelectItem>
                  <SelectItem value="organization">Organizations</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button variant={dateFrom === format(new Date(), "yyyy-MM-dd") && dateTo === format(new Date(), "yyyy-MM-dd") ? "default" : "outline"} size="sm" onClick={() => { const today = format(new Date(), "yyyy-MM-dd"); setDateFrom(today); setDateTo(today); }}>Today</Button>
              <Button variant="outline" size="sm" onClick={() => { setDateFrom(format(subDays(new Date(), 7), "yyyy-MM-dd")); setDateTo(format(new Date(), "yyyy-MM-dd")); }}>7D</Button>
              <Button variant="outline" size="sm" onClick={() => { setDateFrom(format(subDays(new Date(), 30), "yyyy-MM-dd")); setDateTo(format(new Date(), "yyyy-MM-dd")); }}>30D</Button>
              <Button variant="outline" size="sm" onClick={() => { setDateFrom(format(subMonths(new Date(), 3), "yyyy-MM-dd")); setDateTo(format(new Date(), "yyyy-MM-dd")); }}>3M</Button>
              <Button variant="outline" size="sm" onClick={() => { setDateFrom(format(subMonths(new Date(), 12), "yyyy-MM-dd")); setDateTo(format(new Date(), "yyyy-MM-dd")); }}>1Y</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-primary">
          <CardHeader className="pb-2">
            <CardDescription>Total Commission</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">
              KES {summary.totalCommission.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-sm text-muted-foreground mt-1">{summary.transactionCount} transactions</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-pink-500">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1"><Heart className="h-3 w-3" /> Mchango ({formatCommissionPercentage(MCHANGO_COMMISSION_RATE)})</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-pink-600">
              KES {summary.mchangoCommission.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <p className="text-sm text-muted-foreground mt-1">on KES {summary.mchangoGross.toLocaleString()} gross</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1"><Users className="h-3 w-3" /> Chama (5-10%)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              KES {summary.chamaCommission.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <p className="text-sm text-muted-foreground mt-1">on KES {summary.chamaGross.toLocaleString()} gross</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-purple-500">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1"><Building2 className="h-3 w-3" /> Organizations ({formatCommissionPercentage(ORGANIZATION_COMMISSION_RATE)})</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              KES {summary.orgCommission.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <p className="text-sm text-muted-foreground mt-1">on KES {summary.orgGross.toLocaleString()} gross</p>
          </CardContent>
        </Card>
      </div>

      {/* Live Data Verification */}
      {liveVerification && (
        <Card className="border border-dashed border-primary/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Live Data Cross-Verification
            </CardTitle>
            <CardDescription className="text-xs">
              Comparing ledger totals with live donation tables for {dateFrom === dateTo ? "today" : "selected period"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Mchango (Donations)</p>
                <p className="font-semibold">KES {liveVerification.mchangoDonations.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Organizations (Donations)</p>
                <p className="font-semibold">KES {liveVerification.orgDonations.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Ledger Total</p>
                <p className="font-semibold">KES {summary.totalCommission.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Status</p>
                {Math.abs(summary.totalCommission - (liveVerification.mchangoDonations + liveVerification.orgDonations + summary.chamaCommission)) < 1 ? (
                  <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">✓ Verified</Badge>
                ) : (
                  <Badge variant="secondary" className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300">⚠ Check Chama entries</Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Trend Chart */}
        <Card className="lg:col-span-2" ref={chartRef}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                Commission Trends
              </CardTitle>
              <div className="flex gap-1">
                {(["daily", "weekly", "monthly"] as const).map(p => (
                  <Button key={p} variant={trendPeriod === p ? "default" : "outline"} size="sm" onClick={() => setTrendPeriod(p)}>
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </Button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="stacked-bar">
              <TabsList className="grid w-full grid-cols-4 mb-4">
                <TabsTrigger value="stacked-bar">Stacked Bar</TabsTrigger>
                <TabsTrigger value="area">Area</TabsTrigger>
                <TabsTrigger value="line">Line</TabsTrigger>
                <TabsTrigger value="histogram">Histogram</TabsTrigger>
              </TabsList>

              <TabsContent value="stacked-bar">
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="label" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `KES ${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
                    <Legend />
                    <Bar dataKey="mchango" fill="#ec4899" name="Mchango" stackId="a" />
                    <Bar dataKey="chama" fill="#3b82f6" name="Chama" stackId="a" />
                    <Bar dataKey="organizations" fill="#a855f7" name="Organizations" stackId="a" />
                  </BarChart>
                </ResponsiveContainer>
              </TabsContent>

              <TabsContent value="area">
                <ResponsiveContainer width="100%" height={350}>
                  <AreaChart data={trendData}>
                    <defs>
                      <linearGradient id="cMchango" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ec4899" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="#ec4899" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="cChama" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="cOrg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#a855f7" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="label" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `KES ${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
                    <Legend />
                    <Area type="monotone" dataKey="mchango" stroke="#ec4899" fill="url(#cMchango)" name="Mchango" stackId="1" />
                    <Area type="monotone" dataKey="chama" stroke="#3b82f6" fill="url(#cChama)" name="Chama" stackId="1" />
                    <Area type="monotone" dataKey="organizations" stroke="#a855f7" fill="url(#cOrg)" name="Organizations" stackId="1" />
                  </AreaChart>
                </ResponsiveContainer>
              </TabsContent>

              <TabsContent value="line">
                <ResponsiveContainer width="100%" height={350}>
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="label" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `KES ${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
                    <Legend />
                    <Line type="monotone" dataKey="total" stroke="hsl(var(--primary))" strokeWidth={3} name="Total" dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="mchango" stroke="#ec4899" strokeWidth={2} name="Mchango" dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="chama" stroke="#3b82f6" strokeWidth={2} name="Chama" dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="organizations" stroke="#a855f7" strokeWidth={2} name="Organizations" dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </TabsContent>

              <TabsContent value="histogram">
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="label" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `KES ${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
                    <Legend />
                    <Bar dataKey="total" fill="hsl(var(--primary))" name="Total Commission" />
                  </BarChart>
                </ResponsiveContainer>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChartIcon className="h-5 w-5 text-primary" />
              Distribution
            </CardTitle>
            <CardDescription>Commission share by source</CardDescription>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={4}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => `KES ${v.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground">
                No data for selected period
              </div>
            )}
            <div className="space-y-2 mt-4">
              {pieData.map(d => (
                <div key={d.name} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: d.color }} />
                    <span>{d.name}</span>
                  </div>
                  <span className="font-medium">KES {d.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Transaction Details Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Commission Ledger Details
              </CardTitle>
              <CardDescription>{ledgerData.length} records for selected period</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-2 font-semibold">Date</th>
                  <th className="text-left py-3 px-2 font-semibold">Source</th>
                  <th className="text-left py-3 px-2 font-semibold">Payer</th>
                  <th className="text-right py-3 px-2 font-semibold">Gross (KES)</th>
                  <th className="text-center py-3 px-2 font-semibold">Rate</th>
                  <th className="text-right py-3 px-2 font-semibold">Commission (KES)</th>
                  <th className="text-right py-3 px-2 font-semibold">Net (KES)</th>
                </tr>
              </thead>
              <tbody>
                {ledgerData.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-muted-foreground">No commission records for selected period</td>
                  </tr>
                ) : (
                  ledgerData.map(entry => (
                    <tr key={entry.id} className="border-b hover:bg-muted/50">
                      <td className="py-3 px-2">{format(parseISO(entry.created_at), "dd MMM yyyy HH:mm")}</td>
                      <td className="py-3 px-2">
                        <Badge variant="secondary" className={
                          entry.source_type === "mchango" ? "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300" :
                          entry.source_type === "chama" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" :
                          "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                        }>
                          {entry.source_type}
                        </Badge>
                      </td>
                      <td className="py-3 px-2">{entry.payer_name || entry.payer_phone || "-"}</td>
                      <td className="py-3 px-2 text-right font-medium">{Number(entry.gross_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td className="py-3 px-2 text-center">
                        <Badge variant="outline">{(Number(entry.commission_rate) * 100).toFixed(0)}%</Badge>
                      </td>
                      <td className="py-3 px-2 text-right font-bold text-primary">{Number(entry.commission_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td className="py-3 px-2 text-right">{Number(entry.net_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    </tr>
                  ))
                )}
              </tbody>
              {ledgerData.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 font-bold">
                    <td colSpan={3} className="py-3 px-2">TOTALS</td>
                    <td className="py-3 px-2 text-right">{summary.totalGross.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td />
                    <td className="py-3 px-2 text-right text-primary">{summary.totalCommission.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td className="py-3 px-2 text-right">{summary.totalNet.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
