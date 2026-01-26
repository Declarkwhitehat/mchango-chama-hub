import { AdminLayout } from "@/components/admin/AdminLayout";
import { VerificationRequestsManagement } from "@/components/admin/VerificationRequestsManagement";

export default function AdminVerificationRequests() {
  return (
    <AdminLayout>
      <div className="container px-4 py-6 max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Verification Requests</h1>
          <p className="text-muted-foreground">Review and manage verification badge requests</p>
        </div>
        <VerificationRequestsManagement />
      </div>
    </AdminLayout>
  );
}