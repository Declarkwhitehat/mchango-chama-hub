import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, Lock, Save, Percent, Shield, BadgeCheck, Coins } from "lucide-react";

const SUPER_ADMIN_CODE = "D3E9C0L1A3R9K";

interface RateSetting {
  key: string;
  label: string;
  description: string;
  rate: number;
}

const AdminCommissionConfig = () => {
  const queryClient = useQueryClient();
  const [rates, setRates] = useState<RateSetting[]>([
    { key: "commission_rate_chama", label: "Chama", description: "On-time contribution commission", rate: 5 },
    { key: "commission_rate_mchango", label: "Mchango (Campaigns)", description: "Campaign donation commission", rate: 7 },
    { key: "commission_rate_organization", label: "Organizations", description: "Organization donation commission", rate: 5 },
    { key: "commission_rate_welfare", label: "Welfare", description: "Welfare contribution commission", rate: 5 },
  ]);
  const [verificationFee, setVerificationFee] = useState(200);
  const [accountVerificationFee, setAccountVerificationFee] = useState(1500);
  const [minChamaContribution, setMinChamaContribution] = useState(100);
  const [minWithdrawalChama, setMinWithdrawalChama] = useState(100);
  const [minWithdrawalMchango, setMinWithdrawalMchango] = useState(100);
  const [minWithdrawalWelfare, setMinWithdrawalWelfare] = useState(100);
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
      const minimumKeys = [
        "min_chama_contribution",
        "min_withdrawal_chama",
        "min_withdrawal_mchango",
        "min_withdrawal_welfare",
      ];
      const allKeys = [...rates.map(r => r.key), "verification_fee", "user_verification_fee", ...minimumKeys];
      const { data, error } = await supabase
        .from("platform_settings")
        .select("setting_key, setting_value")
        .in("setting_key", allKeys);

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

        const feeSetting = data.find((d: any) => d.setting_key === "verification_fee");
        if (feeSetting && typeof feeSetting.setting_value === 'object' && feeSetting.setting_value !== null) {
          const val = feeSetting.setting_value as { amount?: number };
          setVerificationFee(val.amount || 200);
        }
        const acctFee = data.find((d: any) => d.setting_key === "user_verification_fee");
        if (acctFee && typeof acctFee.setting_value === 'object' && acctFee.setting_value !== null) {
          const val = acctFee.setting_value as { amount?: number };
          setAccountVerificationFee(val.amount || 1500);
        }

        const readAmount = (key: string, fallback: number) => {
          const row = data.find((d: any) => d.setting_key === key);
          if (row && typeof row.setting_value === 'object' && row.setting_value !== null) {
            const v = row.setting_value as { amount?: number };
            return Number.isFinite(v.amount) ? Number(v.amount) : fallback;
          }
          return fallback;
        };
        setMinChamaContribution(readAmount("min_chama_contribution", 100));
        setMinWithdrawalChama(readAmount("min_withdrawal_chama", 100));
        setMinWithdrawalMchango(readAmount("min_withdrawal_mchango", 100));
        setMinWithdrawalWelfare(readAmount("min_withdrawal_welfare", 100));
      }
    } catch (err: any) {
      console.error(err);
      toast({ title: "Error", description: "Failed to load settings", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleRateChange = (key: string, value: string) => {
    const num = parseFloat(value);
    if (isNaN(num) || num < 0 || num > 50) return;
    setRates(prev => prev.map(r => r.key === key ? { ...r, rate: num } : r));
  };

  const handleFeeChange = (value: string) => {
    const num = parseInt(value);
    if (isNaN(num) || num < 0 || num > 10000) return;
    setVerificationFee(num);
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

      // Update verification fee
      const { error: feeError } = await supabase
        .from("platform_settings")
        .update({
          setting_value: { amount: verificationFee },
          updated_by: user?.id || null,
        })
        .eq("setting_key", "verification_fee");

      if (feeError) throw feeError;

      // Update / upsert account verification fee
      const { error: acctFeeError } = await supabase
        .from("platform_settings")
        .upsert({
          setting_key: "user_verification_fee",
          setting_value: { amount: accountVerificationFee },
          updated_by: user?.id || null,
        }, { onConflict: "setting_key" });
      if (acctFeeError) throw acctFeeError;

      // Upsert minimum amount settings
      const minimumUpserts = [
        { setting_key: "min_chama_contribution", setting_value: { amount: minChamaContribution } },
        { setting_key: "min_withdrawal_chama", setting_value: { amount: minWithdrawalChama } },
        { setting_key: "min_withdrawal_mchango", setting_value: { amount: minWithdrawalMchango } },
        { setting_key: "min_withdrawal_welfare", setting_value: { amount: minWithdrawalWelfare } },
      ].map(row => ({ ...row, updated_by: user?.id || null }));

      const { error: minError } = await supabase
        .from("platform_settings")
        .upsert(minimumUpserts, { onConflict: "setting_key" });
      if (minError) throw minError;

      const commissionPayload = {
        ...Object.fromEntries(rates.map(r => [r.key, r.rate / 100])),
        verification_fee: verificationFee,
        user_verification_fee: accountVerificationFee,
        min_chama_contribution: minChamaContribution,
        min_withdrawal_chama: minWithdrawalChama,
        min_withdrawal_mchango: minWithdrawalMchango,
        min_withdrawal_welfare: minWithdrawalWelfare,
      };

      // Log audit
      await supabase.from("audit_logs").insert({
        table_name: "platform_settings",
        action: "platform_settings_updated",
        user_id: user?.id,
        new_values: commissionPayload,
      });

      const { logAdminAction } = await import("@/lib/logAdminAction");
      await logAdminAction("commission.config_update", {
        targetType: "platform_settings",
        metadata: commissionPayload,
      });

      queryClient.invalidateQueries({ queryKey: ["platform-commission-rates"] });
      toast({ title: "Saved", description: "Platform settings updated successfully" });
    } catch (err: any) {
      console.error(err);
      toast({ title: "Error", description: "Failed to update settings", variant: "destructive" });
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
            <Percent className="h-7 w-7" /> Platform Settings
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage commission rates and fees. Changes require Super Admin authorization.
          </p>
        </div>

        <div className="flex items-center gap-2 p-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/10 text-sm text-amber-800 dark:text-amber-300">
          <Lock className="h-4 w-4 flex-shrink-0" />
          <p>Changes affect all future transactions across the platform. Every change is logged.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Percent className="h-4 w-4" /> Commission Rates
            </CardTitle>
            <CardDescription>Percentage deducted from each payment type</CardDescription>
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BadgeCheck className="h-4 w-4" /> Verification Fee
            </CardTitle>
            <CardDescription>Amount charged when a Mchango, Welfare, or Organization requests verification (Chama is free)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <Label className="font-semibold">Verification Fee (KSh)</Label>
                <p className="text-xs text-muted-foreground">Deducted from entity balance on request. Refunded if rejected.</p>
              </div>
              <div className="flex items-center gap-2 w-36">
                <span className="text-sm font-medium text-muted-foreground">KSh</span>
                <Input
                  type="number"
                  min="0"
                  max="10000"
                  step="50"
                  value={verificationFee}
                  onChange={(e) => handleFeeChange(e.target.value)}
                  className="text-right font-mono"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BadgeCheck className="h-4 w-4 text-blue-500" /> Account Verification Fee
            </CardTitle>
            <CardDescription>Charged via M-Pesa STK push when a user requests an account-level verified badge. Goes 100% to platform revenue.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <Label className="font-semibold">Account Verification Fee (KSh)</Label>
                <p className="text-xs text-muted-foreground">Verified accounts auto-verify any group/campaign they create at no extra cost.</p>
              </div>
              <div className="flex items-center gap-2 w-36">
                <span className="text-sm font-medium text-muted-foreground">KSh</span>
                <Input
                  type="number"
                  min="0"
                  max="50000"
                  step="100"
                  value={accountVerificationFee}
                  onChange={(e) => {
                    const n = parseInt(e.target.value);
                    if (!isNaN(n) && n >= 0 && n <= 50000) setAccountVerificationFee(n);
                  }}
                  className="text-right font-mono"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Coins className="h-4 w-4 text-amber-500" /> Minimum Amounts
            </CardTitle>
            <CardDescription>
              Floors used across the platform. Lower the chama contribution minimum during testing; raise it for production.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { label: "Chama contribution minimum", desc: "Lowest contribution amount allowed when creating a chama", value: minChamaContribution, setter: setMinChamaContribution },
              { label: "Chama withdrawal minimum", desc: "Lowest payout amount chamas can request", value: minWithdrawalChama, setter: setMinWithdrawalChama },
              { label: "Campaign (mchango) withdrawal minimum", desc: "Lowest withdrawal for mchango campaigns and organizations", value: minWithdrawalMchango, setter: setMinWithdrawalMchango },
              { label: "Welfare withdrawal minimum", desc: "Lowest withdrawal for welfare groups", value: minWithdrawalWelfare, setter: setMinWithdrawalWelfare },
            ].map((row) => (
              <div key={row.label} className="flex items-center gap-4">
                <div className="flex-1">
                  <Label className="font-semibold">{row.label}</Label>
                  <p className="text-xs text-muted-foreground">{row.desc}</p>
                </div>
                <div className="flex items-center gap-2 w-36">
                  <span className="text-sm font-medium text-muted-foreground">KSh</span>
                  <Input
                    type="number"
                    min="1"
                    max="1000000"
                    step="10"
                    value={row.value}
                    onChange={(e) => {
                      const n = parseInt(e.target.value);
                      if (!isNaN(n) && n >= 1 && n <= 1000000) row.setter(n);
                    }}
                    className="text-right font-mono"
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Button onClick={handleSave} disabled={saving} className="w-full gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save All Changes
        </Button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-destructive" />
              Super Admin Authorization Required
            </DialogTitle>
            <DialogDescription>
              Enter the Super Admin code to confirm changes.
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
