import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { 
  DollarSign, TrendingUp, TrendingDown, Hash, BarChart3, 
  Download, FileText, CalendarIcon, Loader2, Search, 
  ArrowUpRight, ArrowDownRight, X
} from "lucide-react";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, subDays, subWeeks, subMonths, subYears, eachDayOfInterval, eachMonthOfInterval, eachHourOfInterval, isWithinInterval } from "date-fns";
import { Area, AreaChart, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import jsPDF from "jspdf";

type PeriodPreset = "today" | "week" | "month" | "year" | "custom";
type SourceFilter = "all" | "chama" | "mchango" | "organization" | "welfare";

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

const SOURCE_COLORS: Record<string, string> = {
  chama: "hsl(210, 70%, 55%)",
  mchango: "hsl(340, 70%, 55%)",
  organization: "hsl(270, 60%, 55%)",
  welfare: "hsl(150, 60%, 45%)",
};

const SOURCE_LABELS: Record<string, string> = {
  chama: "Chama",
  mchango: "Mchango",
  organization: "Organization",
  welfare: "Welfare",
};

export function RevenueDashboard() {
  const [period, setPeriod] = useState<PeriodPreset>("month");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [customFrom, setCustomFrom] = useState<Date>();
  const [customTo, setCustomTo] = useState<Date>();
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [prevEntries, setPrevEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(0);
  const pageSize = 25;

  // Compute date range from period
  const { from, to, prevFrom, prevTo } = useMemo(() => {
    const now = new Date();
    let f: Date, t: Date, pf: Date, pt: Date;
    switch (period) {
      case "today":
        f = startOfDay(now); t = endOfDay(now);
        pf = startOfDay(subDays(now, 1)); pt = endOfDay(subDays(now, 1));
        break;
      case "week":
        f = startOfWeek(now, { weekStartsOn: 1 }); t = endOfWeek(now, { weekStartsOn: 1 });
        pf = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }); pt = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
        break;
      case "year":
        f = startOfYear(now); t = endOfYear(now);
        pf = startOfYear(subYears(now, 1)); pt = endOfYear(subYears(now, 1));
        break;
      case "custom":
        f = customFrom ? startOfDay(customFrom) : startOfMonth(now);
        t = customTo ? endOfDay(customTo) : endOfDay(now);
        const diff = t.getTime() - f.getTime();
        pt = new Date(f.getTime() - 1);
        pf = new Date(pt.getTime() - diff);
        break;
      case "month":
      default:
        f = startOfMonth(now); t = endOfMonth(now);
        pf = startOfMonth(subMonths(now, 1)); pt = endOfMonth(subMonths(now, 1));
        break;
    }
    return { from: f, to: t, prevFrom: pf, prevTo: pt };
  }, [period, customFrom, customTo]);

  // Fetch all entries for a date range (handles >1000 rows)
  const fetchAllEntries = useCallback(async (start: Date, end: Date, source: SourceFilter): Promise<LedgerEntry[]> => {
    let all: LedgerEntry[] = [];
    let page = 0;
    const batchSize = 1000;
    let hasMore = true;
    while (hasMore) {
      let query = supabase
        .from("financial_ledger")
        .select("*")
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString())
        .order("created_at", { ascending: false })
        .range(page * batchSize, (page + 1) * batchSize - 1);
      if (source !== "all") {
        query = query.eq("source_type", source);
      }
      const { data, error } = await query;
      if (error || !data) break;
      all = all.concat(data as LedgerEntry[]);
      hasMore = data.length === batchSize;
      page++;
    }
    return all;
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [current, previous] = await Promise.all([
        fetchAllEntries(from, to, sourceFilter),
        fetchAllEntries(prevFrom, prevTo, sourceFilter),
      ]);
      setEntries(current);
      setPrevEntries(previous);
      setCurrentPage(0);
      setLoading(false);
    };
    load();
  }, [from, to, prevFrom, prevTo, sourceFilter, fetchAllEntries]);

  // KPI calculations
  const kpis = useMemo(() => {
    const totalRevenue = entries.reduce((s, e) => s + Number(e.commission_amount), 0);
    const totalGross = entries.reduce((s, e) => s + Number(e.gross_amount), 0);
    const count = entries.length;
    const avgCommission = count > 0 ? totalRevenue / count : 0;

    const prevRevenue = prevEntries.reduce((s, e) => s + Number(e.commission_amount), 0);
    const prevGross = prevEntries.reduce((s, e) => s + Number(e.gross_amount), 0);
    const prevCount = prevEntries.length;
    const prevAvg = prevCount > 0 ? prevRevenue / prevCount : 0;

    const pctChange = (curr: number, prev: number) => prev === 0 ? (curr > 0 ? 100 : 0) : ((curr - prev) / prev) * 100;

    return {
      totalRevenue, totalGross, count, avgCommission,
      revenuePct: pctChange(totalRevenue, prevRevenue),
      grossPct: pctChange(totalGross, prevGross),
      countPct: pctChange(count, prevCount),
      avgPct: pctChange(avgCommission, prevAvg),
    };
  }, [entries, prevEntries]);

  // Chart data - time series
  const trendData = useMemo(() => {
    if (!entries.length) return [];
    let intervals: Date[];
    let labelFmt: string;
    if (period === "today") {
      intervals = eachHourOfInterval({ start: from, end: to });
      labelFmt = "HH:mm";
    } else if (period === "year") {
      intervals = eachMonthOfInterval({ start: from, end: to });
      labelFmt = "MMM";
    } else {
      intervals = eachDayOfInterval({ start: from, end: to });
      labelFmt = "dd MMM";
    }

    return intervals.map((intervalStart, i) => {
      const intervalEnd = i < intervals.length - 1 ? intervals[i + 1] : to;
      const bucket = entries.filter(e => {
        const d = new Date(e.created_at);
        return d >= intervalStart && d < intervalEnd;
      });
      const row: Record<string, unknown> = { label: format(intervalStart, labelFmt) };
      for (const src of ["chama", "mchango", "organization", "welfare"]) {
        row[src] = bucket.filter(e => e.source_type === src).reduce((s, e) => s + Number(e.commission_amount), 0);
      }
      return row;
    });
  }, [entries, period, from, to]);

  // Pie data - source breakdown
  const sourceBreakdown = useMemo(() => {
    const map: Record<string, { gross: number; commission: number; count: number }> = {};
    entries.forEach(e => {
      if (!map[e.source_type]) map[e.source_type] = { gross: 0, commission: 0, count: 0 };
      map[e.source_type].gross += Number(e.gross_amount);
      map[e.source_type].commission += Number(e.commission_amount);
      map[e.source_type].count += 1;
    });
    const total = kpis.totalRevenue || 1;
    return Object.entries(map).map(([source, v]) => ({
      source,
      label: SOURCE_LABELS[source] || source,
      ...v,
      pct: (v.commission / total) * 100,
      avgRate: v.gross > 0 ? (v.commission / v.gross) * 100 : 0,
      color: SOURCE_COLORS[source] || "hsl(0,0%,60%)",
    }));
  }, [entries, kpis.totalRevenue]);

  // Filtered ledger for table
  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return entries;
    const q = searchQuery.toLowerCase();
    return entries.filter(e =>
      (e.payer_name || "").toLowerCase().includes(q) ||
      (e.payer_phone || "").toLowerCase().includes(q) ||
      (e.description || "").toLowerCase().includes(q) ||
      e.source_type.toLowerCase().includes(q) ||
      e.transaction_type.toLowerCase().includes(q)
    );
  }, [entries, searchQuery]);

  const paginatedEntries = filteredEntries.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const totalPages = Math.ceil(filteredEntries.length / pageSize);

  // CSV Export
  const exportCSV = () => {
    const headers = ["Date", "Source", "Type", "Payer", "Phone", "Gross (KES)", "Rate (%)", "Commission (KES)", "Net (KES)", "Description"];
    const rows = filteredEntries.map(e => [
      format(new Date(e.created_at), "yyyy-MM-dd HH:mm:ss"),
      e.source_type, e.transaction_type,
      e.payer_name || "", e.payer_phone || "",
      Number(e.gross_amount).toFixed(2),
      (Number(e.commission_rate) * 100).toFixed(1),
      Number(e.commission_amount).toFixed(2),
      Number(e.net_amount).toFixed(2),
      e.description || "",
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.map(c => `"${c}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `revenue-report-${format(from, "yyyy-MM-dd")}-to-${format(to, "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // PDF Export
  const exportPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    let y = 20;

    // Header
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("Mchango Platform — Revenue Statement", pageWidth / 2, y, { align: "center" });
    y += 10;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Period: ${format(from, "dd MMM yyyy")} — ${format(to, "dd MMM yyyy")}`, pageWidth / 2, y, { align: "center" });
    y += 5;
    doc.text(`Generated: ${format(new Date(), "dd MMM yyyy, HH:mm")}`, pageWidth / 2, y, { align: "center" });
    y += 10;
    doc.setDrawColor(200); doc.line(14, y, pageWidth - 14, y); y += 8;

    // Summary
    doc.setFontSize(12); doc.setFont("helvetica", "bold"); doc.text("Summary", 14, y); y += 7;
    doc.setFontSize(10); doc.setFont("helvetica", "normal");
    const summaryLines = [
      [`Total Revenue (Commission):`, `KES ${kpis.totalRevenue.toLocaleString("en-KE", { minimumFractionDigits: 2 })}`],
      [`Total Gross Volume:`, `KES ${kpis.totalGross.toLocaleString("en-KE", { minimumFractionDigits: 2 })}`],
      [`Total Transactions:`, `${kpis.count}`],
      [`Avg Commission / Transaction:`, `KES ${kpis.avgCommission.toFixed(2)}`],
    ];
    summaryLines.forEach(([label, val]) => {
      doc.text(label, 14, y);
      doc.text(val, pageWidth - 14, y, { align: "right" });
      y += 6;
    });
    y += 4; doc.line(14, y, pageWidth - 14, y); y += 8;

    // Source Breakdown
    doc.setFontSize(12); doc.setFont("helvetica", "bold"); doc.text("Breakdown by Source", 14, y); y += 7;
    doc.setFontSize(9); doc.setFont("helvetica", "bold");
    doc.text("Source", 14, y); doc.text("Gross", 70, y); doc.text("Commission", 110, y); doc.text("% of Total", 155, y);
    y += 6; doc.setFont("helvetica", "normal");
    sourceBreakdown.forEach(sb => {
      doc.text(sb.label, 14, y);
      doc.text(`KES ${sb.gross.toLocaleString("en-KE", { minimumFractionDigits: 2 })}`, 70, y);
      doc.text(`KES ${sb.commission.toLocaleString("en-KE", { minimumFractionDigits: 2 })}`, 110, y);
      doc.text(`${sb.pct.toFixed(1)}%`, 155, y);
      y += 6;
      if (y > 270) { doc.addPage(); y = 20; }
    });

    y += 4; doc.line(14, y, pageWidth - 14, y); y += 8;

    // Line items (first 100)
    doc.setFontSize(12); doc.setFont("helvetica", "bold"); doc.text("Transaction Details", 14, y); y += 7;
    doc.setFontSize(7); doc.setFont("helvetica", "bold");
    const cols = [14, 40, 65, 90, 120, 150, 175];
    ["Date", "Source", "Payer", "Gross", "Commission", "Net", "Rate"].forEach((h, i) => doc.text(h, cols[i], y));
    y += 5; doc.setFont("helvetica", "normal");
    filteredEntries.slice(0, 100).forEach(e => {
      if (y > 280) { doc.addPage(); y = 20; }
      doc.text(format(new Date(e.created_at), "dd/MM/yy HH:mm"), cols[0], y);
      doc.text(e.source_type, cols[1], y);
      doc.text((e.payer_name || "-").substring(0, 15), cols[2], y);
      doc.text(Number(e.gross_amount).toFixed(0), cols[3], y);
      doc.text(Number(e.commission_amount).toFixed(0), cols[4], y);
      doc.text(Number(e.net_amount).toFixed(0), cols[5], y);
      doc.text(`${(Number(e.commission_rate) * 100).toFixed(0)}%`, cols[6], y);
      y += 5;
    });

    doc.save(`revenue-statement-${format(from, "yyyy-MM-dd")}.pdf`);
  };

  const fmtKES = (n: number) => `KES ${n.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const chartConfig = {
    chama: { label: "Chama", color: SOURCE_COLORS.chama },
    mchango: { label: "Mchango", color: SOURCE_COLORS.mchango },
    organization: { label: "Organization", color: SOURCE_COLORS.organization },
    welfare: { label: "Welfare", color: SOURCE_COLORS.welfare },
  };

  const PctBadge = ({ value }: { value: number }) => (
    <div className={cn("flex items-center gap-1 text-xs font-medium", value >= 0 ? "text-emerald-600" : "text-red-500")}>
      {value >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {Math.abs(value).toFixed(1)}%
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Revenue</h1>
          <p className="text-muted-foreground">Accurate commission earnings from the financial ledger</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={loading}>
            <Download className="h-4 w-4 mr-2" />CSV
          </Button>
          <Button variant="default" size="sm" onClick={exportPDF} disabled={loading}>
            <FileText className="h-4 w-4 mr-2" />PDF Report
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <Tabs value={period} onValueChange={(v) => setPeriod(v as PeriodPreset)} className="w-auto">
              <TabsList>
                <TabsTrigger value="today">Today</TabsTrigger>
                <TabsTrigger value="week">Week</TabsTrigger>
                <TabsTrigger value="month">Month</TabsTrigger>
                <TabsTrigger value="year">Year</TabsTrigger>
                <TabsTrigger value="custom">Custom</TabsTrigger>
              </TabsList>
            </Tabs>

            {period === "custom" && (
              <div className="flex gap-2 items-center">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn("w-[130px] justify-start text-left font-normal", !customFrom && "text-muted-foreground")}>
                      <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
                      {customFrom ? format(customFrom, "dd MMM yy") : "From"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={customFrom} onSelect={setCustomFrom} className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
                <span className="text-muted-foreground text-sm">—</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn("w-[130px] justify-start text-left font-normal", !customTo && "text-muted-foreground")}>
                      <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
                      {customTo ? format(customTo, "dd MMM yy") : "To"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={customTo} onSelect={setCustomTo} className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
            )}

            <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v as SourceFilter)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All Sources" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                <SelectItem value="chama">Chama</SelectItem>
                <SelectItem value="mchango">Mchango</SelectItem>
                <SelectItem value="organization">Organization</SelectItem>
                <SelectItem value="welfare">Welfare</SelectItem>
              </SelectContent>
            </Select>

            {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {format(from, "dd MMM yyyy")} — {format(to, "dd MMM yyyy")} · {entries.length} transactions
          </p>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { title: "Total Revenue", value: fmtKES(kpis.totalRevenue), pct: kpis.revenuePct, icon: DollarSign, accent: "text-emerald-600" },
          { title: "Gross Volume", value: fmtKES(kpis.totalGross), pct: kpis.grossPct, icon: BarChart3, accent: "text-blue-600" },
          { title: "Transactions", value: kpis.count.toLocaleString(), pct: kpis.countPct, icon: Hash, accent: "text-purple-600" },
          { title: "Avg Commission", value: fmtKES(kpis.avgCommission), pct: kpis.avgPct, icon: TrendingUp, accent: "text-amber-600" },
        ].map(card => (
          <Card key={card.title}>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-muted-foreground">{card.title}</span>
                <card.icon className={cn("h-4 w-4", card.accent)} />
              </div>
              <div className="text-2xl font-bold tracking-tight">{loading ? "—" : card.value}</div>
              {!loading && <PctBadge value={card.pct} />}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Revenue Trend Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Revenue Trend</CardTitle>
          <CardDescription>Commission earned over time, stacked by source</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-[300px] flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : trendData.length === 0 ? (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground">No data for this period</div>
          ) : (
            <ChartContainer config={chartConfig} className="h-[300px] w-full">
              <AreaChart data={trendData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
                <ChartTooltip content={<ChartTooltipContent />} />
                {Object.keys(SOURCE_COLORS).map(src => (
                  <Area
                    key={src}
                    type="monotone"
                    dataKey={src}
                    stackId="1"
                    stroke={SOURCE_COLORS[src]}
                    fill={SOURCE_COLORS[src]}
                    fillOpacity={0.4}
                  />
                ))}
              </AreaChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      {/* Source Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Pie chart */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">By Source</CardTitle>
          </CardHeader>
          <CardContent>
            {loading || sourceBreakdown.length === 0 ? (
              <div className="h-[220px] flex items-center justify-center text-muted-foreground">
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "No data"}
              </div>
            ) : (
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={sourceBreakdown} dataKey="commission" nameKey="label" cx="50%" cy="50%" outerRadius={80} innerRadius={40} paddingAngle={2}>
                      {sourceBreakdown.map((s) => (
                        <Cell key={s.source} fill={s.color} />
                      ))}
                    </Pie>
                    <ChartTooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="flex flex-wrap gap-3 mt-3 justify-center">
              {sourceBreakdown.map(s => (
                <div key={s.source} className="flex items-center gap-1.5 text-xs">
                  <div className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
                  <span>{s.label}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Breakdown table */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Source Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Commission</TableHead>
                  <TableHead className="text-right">Avg Rate</TableHead>
                  <TableHead className="text-right">% of Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sourceBreakdown.map(s => (
                  <TableRow key={s.source}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
                        {s.label}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{fmtKES(s.gross)}</TableCell>
                    <TableCell className="text-right font-medium">{fmtKES(s.commission)}</TableCell>
                    <TableCell className="text-right">{s.avgRate.toFixed(1)}%</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="secondary">{s.pct.toFixed(1)}%</Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {sourceBreakdown.length > 0 && (
                  <TableRow className="font-bold border-t-2">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right">{fmtKES(kpis.totalGross)}</TableCell>
                    <TableCell className="text-right">{fmtKES(kpis.totalRevenue)}</TableCell>
                    <TableCell className="text-right">{kpis.totalGross > 0 ? ((kpis.totalRevenue / kpis.totalGross) * 100).toFixed(1) : "0"}%</TableCell>
                    <TableCell className="text-right"><Badge>100%</Badge></TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Transaction Ledger Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-base">Transaction Ledger</CardTitle>
              <CardDescription>{filteredEntries.length} entries</CardDescription>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search payer, source..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(0); }}
                className="pl-9 pr-8"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2">
                  <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                </button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date & Time</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Payer</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Commission</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></TableCell></TableRow>
                ) : paginatedEntries.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No transactions found</TableCell></TableRow>
                ) : paginatedEntries.map(e => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap text-xs">{format(new Date(e.created_at), "dd MMM yyyy, HH:mm")}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs" style={{ borderColor: SOURCE_COLORS[e.source_type] || undefined }}>
                        {SOURCE_LABELS[e.source_type] || e.source_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs capitalize">{e.transaction_type.replace(/_/g, " ")}</TableCell>
                    <TableCell className="text-xs">{e.payer_name || e.payer_phone || "—"}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{fmtKES(Number(e.gross_amount))}</TableCell>
                    <TableCell className="text-right text-xs">{(Number(e.commission_rate) * 100).toFixed(0)}%</TableCell>
                    <TableCell className="text-right font-mono text-xs font-medium">{fmtKES(Number(e.commission_amount))}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{fmtKES(Number(e.net_amount))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">Page {currentPage + 1} of {totalPages}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={currentPage === 0} onClick={() => setCurrentPage(p => p - 1)}>Previous</Button>
                <Button variant="outline" size="sm" disabled={currentPage >= totalPages - 1} onClick={() => setCurrentPage(p => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
