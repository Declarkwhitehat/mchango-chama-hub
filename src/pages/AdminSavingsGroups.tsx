import { AdminLayout } from "@/components/admin/AdminLayout";
import { SavingsGroupManagement } from "@/components/admin/SavingsGroupManagement";

export default function AdminSavingsGroups() {
  return (
    <AdminLayout>
      <div className="container px-4 py-6 max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Savings Groups</h1>
          <p className="text-muted-foreground">Manage savings groups and track member savings</p>
        </div>
        <SavingsGroupManagement />
      </div>
    </AdminLayout>
  );
}
