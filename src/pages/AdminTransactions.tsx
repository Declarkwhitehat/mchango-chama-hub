import { AdminLayout } from "@/components/admin/AdminLayout";
import { TransactionsTable } from "@/components/admin/TransactionsTable";

export default function AdminTransactions() {
  return (
    <AdminLayout>
      <div className="container px-4 py-6 max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Transactions</h1>
          <p className="text-muted-foreground">View and manage platform transactions</p>
        </div>
        <TransactionsTable />
      </div>
    </AdminLayout>
  );
}
