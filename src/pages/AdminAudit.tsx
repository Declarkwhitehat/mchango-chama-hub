import { AdminLayout } from "@/components/admin/AdminLayout";
import { AuditLogsTable } from "@/components/admin/AuditLogsTable";

export default function AdminAudit() {
  return (
    <AdminLayout>
      <div className="container px-4 py-6 max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Audit Logs</h1>
          <p className="text-muted-foreground">View system audit logs and activity history</p>
        </div>
        <AuditLogsTable />
      </div>
    </AdminLayout>
  );
}
