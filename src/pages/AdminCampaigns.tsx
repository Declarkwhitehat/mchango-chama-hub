import { AdminLayout } from "@/components/admin/AdminLayout";
import { CampaignsManagement } from "@/components/admin/CampaignsManagement";

export default function AdminCampaigns() {
  return (
    <AdminLayout>
      <div className="container px-4 py-6 max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Mchango Campaigns</h1>
          <p className="text-muted-foreground">Manage fundraising campaigns</p>
        </div>
        <CampaignsManagement />
      </div>
    </AdminLayout>
  );
}
