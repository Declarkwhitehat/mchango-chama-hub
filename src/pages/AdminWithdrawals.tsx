import { AdminLayout } from "@/components/admin/AdminLayout";
import { WithdrawalsManagement } from "@/components/admin/WithdrawalsManagement";

export default function AdminWithdrawals() {
  return (
    <AdminLayout>
      <div className="container px-4 py-6 max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Withdrawal Requests</h1>
          <p className="text-muted-foreground">Review and process withdrawal requests</p>
        </div>
        <WithdrawalsManagement />
      </div>
    </AdminLayout>
  );
}
