import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, Lock, Save, Percent, Shield } from "lucide-react";

const SUPER_ADMIN_CODE = "D3E9C0L1A3R9K";

interface RateSetting {
  key: string;
  label: string;
  description: string;
  rate: number;
}

const AdminCommissionConfig = () => {
  const [rates, setRates] = useState<RateSetting[]>([
    { key: "commission_rate_chama", label: "Chama", description: "On-time contribution commission", rate: 5 },
    { key: "commission_rate_mchango", label: "Mchango (Campaigns)", description: "Campaign donation commission", rate: 7 },
    { key: "commission_rate_organization", label: "Organizations", description: "Organization donation commission", rate: 5 },
    { key: "commission_rate_welfare", label: "Welfare", description: "Welfare contribution commission", rate: 5 },
  ]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [superAdminCode, setSuperAdminCode] = useState("");
  const [codeError, setCodeError] = useState("");

  useEffect(() => {
    fetchRates();
  }, []);

  const fetchRates = async () => {
    try {
      const { data, error } = await supabase
        .from("platform_settings")
        .select("setting_key, setting_value")
        .in("setting_key", rates.map(r => r.key));

      if (error) throw error;

      if (data) {
        setRates(prev => prev.map(r => {
          const found = data.find((d: any) => d.setting_key === r.key);
          if (found && typeof found.setting_value === 'object' && found.setting_value !== null) {
            const val = found.setting_value as { rate?: number };
            return { ...r, rate: (val.rate || 0) * 100 };
          }
          return r;
        }));
      }
    } catch (err: any) {
      console.error(err);
      toast({ title: "Error", description: "Failed to load commission rates", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleRateChange = (key: string, value: string) => {
    const num = parseFloat(value);
    if (isNaN(num) || num < 0 || num > 50) return;
    setRates(prev => prev.map(r => r.key === key ? { ...r, rate: num } : r));
  };

  const handleSave = () => {
    setConfirmOpen(true);
    setSuperAdminCode("");
    setCodeError("");
  };

  const confirmSave = async () => {
    if (superAdminCode !== SUPER_ADMIN_CODE) {
      setCodeError("Invalid Super Admin code");
      return;
    }

    setSaving(true);
    setConfirmOpen(false);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      for (const rate of rates) {
        const { error } = await supabase
          .from("platform_settings")
          .update({
            setting_value: { rate: rate.rate / 100 },
            updated_by: user?.id || null,
          })
          .eq("setting_key", rate.key);

        if (error) throw error;
      }

      // Log audit
      await supabase.from("audit_logs").insert({
        table_name: "platform_settings",
        action: "commission_rates_updated",
        user_id: user?.id,
        new_values: Object.fromEntries(rates.map(r => [r.key, r.rate / 100])),
      });

      toast({ title: "Saved", description: "Commission rates updated successfully" });
    } catch (err: any) {
      console.error(err);
      toast({ title: "Error", description: "Failed to update rates", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="container px-4 py-6 max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Percent className="h-7 w-7" /> Commission Configuration
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage platform-wide commission rates. Changes require Super Admin authorization.
          </p>
        </div>

        <div className="flex items-center gap-2 p-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/10 text-sm text-amber-800 dark:text-amber-300">
          <Lock className="h-4 w-4 flex-shrink-0" />
          <p>Changing commission rates affects all future transactions across the platform. This action is logged.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Commission Rates</CardTitle>
            <CardDescription>Set the percentage deducted from each payment type</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {rates.map((rate) => (
              <div key={rate.key} className="flex items-center gap-4">
                <div className="flex-1">
                  <Label className="font-semibold">{rate.label}</Label>
                  <p className="text-xs text-muted-foreground">{rate.description}</p>
                </div>
                <div className="flex items-center gap-2 w-32">
                  <Input
                    type="number"
                    min="0"
                    max="50"
                    step="0.5"
                    value={rate.rate}
                    onChange={(e) => handleRateChange(rate.key, e.target.value)}
                    className="text-right font-mono"
                  />
                  <span className="text-sm font-medium text-muted-foreground">%</span>
                </div>
              </div>
            ))}

            <Button onClick={handleSave} disabled={saving} className="w-full gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Changes
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Super Admin Confirmation Dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-destructive" />
              Super Admin Authorization Required
            </DialogTitle>
            <DialogDescription>
              Enter the Super Admin code to confirm commission rate changes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <Label htmlFor="super-code">Super Admin Code</Label>
            <Input
              id="super-code"
              type="password"
              value={superAdminCode}
              onChange={(e) => { setSuperAdminCode(e.target.value); setCodeError(""); }}
              placeholder="Enter code..."
              className="font-mono"
            />
            {codeError && <p className="text-sm text-destructive">{codeError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button onClick={confirmSave} disabled={!superAdminCode}>Confirm & Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminCommissionConfig;
