import { AdminLayout } from "@/components/admin/AdminLayout";
import { CustomerCallbacks } from "@/components/admin/CustomerCallbacks";

export default function AdminCallbacks() {
  return (
    <AdminLayout>
      <div className="container px-4 py-6 max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Customer Callbacks</h1>
          <p className="text-muted-foreground">Manage customer support callback requests</p>
        </div>
        <CustomerCallbacks />
      </div>
    </AdminLayout>
  );
}
