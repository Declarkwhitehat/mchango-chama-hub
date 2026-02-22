import { useParams } from "react-router-dom";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { FraudUserDetail } from "@/components/admin/FraudUserDetail";

export default function AdminFraudUserDetailPage() {
  const { userId } = useParams<{ userId: string }>();

  return (
    <AdminLayout>
      <div className="container px-4 py-6 max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">User Fraud Details</h1>
          <p className="text-muted-foreground">Detailed risk timeline and admin actions</p>
        </div>
        {userId && <FraudUserDetail userId={userId} />}
      </div>
    </AdminLayout>
  );
}
