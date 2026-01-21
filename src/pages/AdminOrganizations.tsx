import { AdminLayout } from "@/components/admin/AdminLayout";
import { OrganizationsManagement } from "@/components/admin/OrganizationsManagement";

export default function AdminOrganizations() {
  return (
    <AdminLayout>
      <div className="container px-4 py-6 max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Organizations</h1>
          <p className="text-muted-foreground">Manage NGOs, Churches, Schools, and other organizations</p>
        </div>
        <OrganizationsManagement />
      </div>
    </AdminLayout>
  );
}
