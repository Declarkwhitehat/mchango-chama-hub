import { AdminLayout } from "@/components/admin/AdminLayout";
import { FraudConfigPanel } from "@/components/admin/FraudConfigPanel";
import { Settings } from "lucide-react";

export default function AdminFraudConfig() {
  return (
    <AdminLayout>
      <div className="container px-4 py-6 max-w-7xl mx-auto">
        <div className="mb-6">
          <div className="flex items-center gap-2">
            <Settings className="h-6 w-6" />
            <h1 className="text-3xl font-bold">Fraud Rule Configuration</h1>
          </div>
          <p className="text-muted-foreground">Configure fraud detection thresholds and rules. All changes are logged.</p>
        </div>
        <FraudConfigPanel />
      </div>
    </AdminLayout>
  );
}
