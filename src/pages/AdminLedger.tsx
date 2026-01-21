import { AdminLayout } from "@/components/admin/AdminLayout";
import { FinancialLedgerTable } from "@/components/admin/FinancialLedgerTable";
import { Landmark } from "lucide-react";

const AdminLedger = () => {
  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Landmark className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Financial Ledger</h1>
            <p className="text-muted-foreground">
              Complete transaction history separating commission from client funds
            </p>
          </div>
        </div>

        <FinancialLedgerTable />
      </div>
    </AdminLayout>
  );
};

export default AdminLedger;
