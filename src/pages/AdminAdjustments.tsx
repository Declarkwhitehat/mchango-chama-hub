import { AdminLayout } from "@/components/admin/AdminLayout";
import { AccountAdjustment } from "@/components/admin/AccountAdjustment";

export default function AdminAdjustments() {
  return (
    <AdminLayout>
      <div className="container px-4 py-6 max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Account Adjustments</h1>
          <p className="text-muted-foreground">Manually adjust user account balances</p>
        </div>
        <AccountAdjustment />
      </div>
    </AdminLayout>
  );
}
