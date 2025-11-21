import { AdminLayout } from "@/components/admin/AdminLayout";
import { DataExport } from "@/components/admin/DataExport";

export default function AdminExport() {
  return (
    <AdminLayout>
      <div className="container px-4 py-6 max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Data Export</h1>
          <p className="text-muted-foreground">Export platform data to CSV format</p>
        </div>
        <DataExport />
      </div>
    </AdminLayout>
  );
}
