import { AdminLayout } from "@/components/admin/AdminLayout";
import { ChamaManagement } from "@/components/admin/ChamaManagement";

export default function AdminChamas() {
  return (
    <AdminLayout>
      <div className="container px-4 py-6 max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Chama Groups</h1>
          <p className="text-muted-foreground">Manage chama groups and their members</p>
        </div>
        <ChamaManagement />
      </div>
    </AdminLayout>
  );
}
