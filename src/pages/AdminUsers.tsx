import { AdminLayout } from "@/components/admin/AdminLayout";
import { UsersManagement } from "@/components/admin/UsersManagement";

export default function AdminUsers() {
  return (
    <AdminLayout>
      <div className="container px-4 py-6 max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Users Management</h1>
          <p className="text-muted-foreground">Manage platform users and their roles</p>
        </div>
        <UsersManagement />
      </div>
    </AdminLayout>
  );
}
