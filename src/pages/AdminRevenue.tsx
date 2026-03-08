import { AdminLayout } from "@/components/admin/AdminLayout";
import { RevenueDashboard } from "@/components/admin/RevenueDashboard";

export default function AdminRevenue() {
  return (
    <AdminLayout>
      <div className="container px-4 py-6 max-w-7xl mx-auto">
        <RevenueDashboard />
      </div>
    </AdminLayout>
  );
}
