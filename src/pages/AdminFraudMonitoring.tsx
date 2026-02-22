import { AdminLayout } from "@/components/admin/AdminLayout";
import { FraudMonitoringDashboard } from "@/components/admin/FraudMonitoringDashboard";

export default function AdminFraudMonitoring() {
  return (
    <AdminLayout>
      <div className="container px-4 py-6 max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Fraud & Risk Monitoring</h1>
          <p className="text-muted-foreground">Monitor suspicious activities and manage user risk levels</p>
        </div>
        <FraudMonitoringDashboard />
      </div>
    </AdminLayout>
  );
}
