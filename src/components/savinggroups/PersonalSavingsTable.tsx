import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { Download } from "lucide-react";
import { toast } from "sonner";

interface PersonalSavingsTableProps {
  memberId: string;
  groupId: string;
}

interface Deposit {
  id: string;
  deposit_date: string;
  gross_amount: number;
  commission_amount: number;
  net_amount: number;
  balance_after: number;
  notes: string | null;
  user_id: string;
  paid_by_user_id: string;
  payer_name?: string;
}

export default function PersonalSavingsTable({
  memberId,
  groupId,
}: PersonalSavingsTableProps) {
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDeposits();
  }, [memberId, groupId]);

  const loadDeposits = async () => {
    try {
      const { data, error } = await supabase
        .from("saving_deposits")
        .select(`
          *,
          payer:profiles!saving_deposits_paid_by_user_id_fkey(full_name)
        `)
        .eq("member_id", memberId)
        .eq("group_id", groupId)
        .order("deposit_date", { ascending: false });

      if (error) throw error;

      const depositsWithPayer = data?.map((d: any) => ({
        ...d,
        payer_name: d.payer?.full_name,
      }));

      setDeposits(depositsWithPayer || []);
    } catch (error: any) {
      console.error("Error loading deposits:", error);
      toast.error("Failed to load deposits");
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = () => {
    const headers = [
      "Date",
      "Type",
      "Gross Deposit (KSh)",
      "Commission (1%)",
      "Net Credited (KSh)",
      "Balance After",
      "Notes",
    ];

    const rows = deposits.map((d) => [
      new Date(d.deposit_date).toLocaleDateString(),
      d.user_id === d.paid_by_user_id ? "Self" : `Paid by ${d.payer_name}`,
      d.gross_amount.toFixed(2),
      d.commission_amount.toFixed(2),
      d.net_amount.toFixed(2),
      d.balance_after.toFixed(2),
      d.notes || "",
    ]);

    const csv = [headers, ...rows].map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `savings_breakdown_${new Date().toISOString()}.csv`;
    a.click();
    toast.success("CSV exported successfully");
  };

  const formatCurrency = (amount: number) => {
    return amount.toLocaleString("en-KE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Personal Savings Breakdown</CardTitle>
        <Button onClick={exportToCSV} variant="outline" size="sm">
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Gross Deposit (KSh)</TableHead>
                <TableHead className="text-right">Commission (1%)</TableHead>
                <TableHead className="text-right">Net Credited (KSh)</TableHead>
                <TableHead className="text-right">Balance After</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deposits.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    No deposits yet
                  </TableCell>
                </TableRow>
              ) : (
                deposits.map((deposit) => (
                  <TableRow key={deposit.id}>
                    <TableCell>
                      {new Date(deposit.deposit_date).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {deposit.user_id === deposit.paid_by_user_id
                        ? "Self"
                        : `Paid by ${deposit.payer_name}`}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(deposit.gross_amount)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(deposit.commission_amount)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(deposit.net_amount)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(deposit.balance_after)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {deposit.notes || "-"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
