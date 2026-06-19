import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, Wrench, ShieldAlert, RefreshCw } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { MaintenanceModuleKey, MaintenanceModulesMap } from "@/hooks/useMaintenanceModules";

const defaultTitle = "Scheduled maintenance";
const defaultMessage = "We are doing upgrades and system maintenance. Please check back shortly.";

const MODULE_META: { key: Exclude<MaintenanceModuleKey, "global">; label: string; description: string }[] = [
  { key: "chama", label: "Chama", description: "Pauses chama contributions and payouts." },
  { key: "welfare", label: "Welfare", description: "Pauses welfare contributions and withdrawals." },
  { key: "donations", label: "Donations (Mchango & Organizations)", description: "Pauses donation flows." },
  { key: "withdrawals", label: "Withdrawals (B2C)", description: "Pauses outbound M-Pesa payouts." },
];

const DEFAULTS: MaintenanceModulesMap = {
  global: { enabled: false, since: null },
  chama: { enabled: false, since: null },
  welfare: { enabled: false, since: null },
  donations: { enabled: false, since: null },
  withdrawals: { enabled: false, since: null },
};

type ReconResult = { scanned: number; recovered: number };

export default function AdminMaintenanceMode() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modules, setModules] = useState<MaintenanceModulesMap>(DEFAULTS);
  const [originalModules, setOriginalModules] = useState<MaintenanceModulesMap>(DEFAULTS);
  const [title, setTitle] = useState(defaultTitle);
  const [message, setMessage] = useState(defaultMessage);
  const [reconciling, setReconciling] = useState<string | null>(null);
  const [reconResults, setReconResults] = useState<Record<string, ReconResult | null>>({});

  useEffect(() => { fetchSettings(); }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("platform_settings")
        .select("setting_key, setting_value")
        .in("setting_key", ["maintenance_modules", "maintenance_mode", "maintenance_title", "maintenance_message"]);
      if (error) throw error;
      const map: Record<string, any> = {};
      (data ?? []).forEach((row: any) => { map[row.setting_key] = row.setting_value ?? {}; });

      const next: MaintenanceModulesMap = { ...DEFAULTS };
      const raw = map.maintenance_modules ?? {};
      (Object.keys(DEFAULTS) as MaintenanceModuleKey[]).forEach((k) => {
        const v = raw[k];
        next[k] = v && typeof v === "object" ? { enabled: Boolean(v.enabled), since: v.since ?? null } : { enabled: false, since: null };
      });
      // Back-compat: mirror legacy maintenance_mode into global
      if (map.maintenance_mode?.enabled && !next.global.enabled) {
        next.global = { enabled: true, since: next.global.since ?? new Date().toISOString() };
      }
      setModules(next);
      setOriginalModules(next);
      setTitle(map.maintenance_title?.text || defaultTitle);
      setMessage(map.maintenance_message?.text || defaultMessage);
    } catch (e) {
      console.error(e);
      toast({ title: "Error", description: "Failed to load maintenance settings", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const toggleModule = (key: MaintenanceModuleKey, value: boolean) => {
    setModules((prev) => ({
      ...prev,
      [key]: {
        enabled: value,
        since: value ? (prev[key].enabled ? prev[key].since : new Date().toISOString()) : null,
      },
    }));
  };

  const runReconcile = async (module: Exclude<MaintenanceModuleKey, "global">, since: string) => {
    setReconciling(module);
    try {
      const { data, error } = await supabase.functions.invoke("maintenance-reconcile", {
        body: { module, since },
      });
      if (error) throw error;
      const res = data as ReconResult;
      setReconResults((p) => ({ ...p, [module]: res }));
      toast({
        title: `Reconciled ${module}`,
        description: `Scanned ${res.scanned}, recovered ${res.recovered}`,
      });
    } catch (e: any) {
      console.error(e);
      toast({ title: "Reconciliation failed", description: e?.message ?? "Try again", variant: "destructive" });
    } finally {
      setReconciling(null);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id ?? null;

      // Detect off-transitions before persisting
      const offTransitions: { module: Exclude<MaintenanceModuleKey, "global">; since: string }[] = [];
      (MODULE_META.map((m) => m.key)).forEach((k) => {
        const was = originalModules[k];
        const now = modules[k];
        if (was.enabled && !now.enabled && was.since) {
          offTransitions.push({ module: k, since: was.since });
        }
      });

      const payload = [
        {
          setting_key: "maintenance_modules",
          setting_value: modules as any,
          description: "Per-module maintenance toggles",
          updated_by: userId,
        },
        {
          setting_key: "maintenance_mode",
          setting_value: { enabled: modules.global.enabled },
          description: "Legacy mirror of global maintenance state",
          updated_by: userId,
        },
        {
          setting_key: "maintenance_title",
          setting_value: { text: title.trim() || defaultTitle },
          description: "Title shown on the global maintenance screen",
          updated_by: userId,
        },
        {
          setting_key: "maintenance_message",
          setting_value: { text: message.trim() || defaultMessage },
          description: "Message shown on the global maintenance screen",
          updated_by: userId,
        },
      ];

      const { error } = await supabase
        .from("platform_settings")
        .upsert(payload, { onConflict: "setting_key" });
      if (error) throw error;

      try {
        const { logAdminAction } = await import("@/lib/logAdminAction");
        await logAdminAction("maintenance.module.toggle", {
          targetType: "platform_settings",
          metadata: { modules, offTransitions: offTransitions.map((t) => t.module) },
        });
      } catch (_) { /* ignore */ }

      setOriginalModules(modules);
      toast({ title: "Saved", description: "Maintenance settings updated" });

      // Fire reconciliation for any module that flipped OFF
      for (const t of offTransitions) {
        await runReconcile(t.module, t.since);
      }
    } catch (e) {
      console.error(e);
      toast({ title: "Error", description: "Failed to save settings", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="container px-4 py-6 max-w-4xl mx-auto">
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="container px-4 py-6 max-w-4xl mx-auto space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Wrench className="h-7 w-7" />
            Maintenance Mode
          </h1>
          <p className="text-muted-foreground">
            Pause individual modules independently to avoid full downtime. Webhooks keep recording payments — when a module is turned back off, the system auto-reconciles anything received during the window.
          </p>
        </div>

        <Alert className="border-border">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Nothing gets lost</AlertTitle>
          <AlertDescription>
            M-Pesa callbacks are never blocked. When you turn a module off, an automatic reconciliation sweep runs and shows what was recovered.
          </AlertDescription>
        </Alert>

        {/* Global */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle>Global maintenance</CardTitle>
                <CardDescription>Shows the full-screen maintenance page to all non-admin users.</CardDescription>
              </div>
              <Badge variant={modules.global.enabled ? "destructive" : "secondary"}>
                {modules.global.enabled ? "Live" : "Off"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
              <div className="space-y-1">
                <Label className="text-base font-semibold">Enable global maintenance</Label>
                <p className="text-sm text-muted-foreground">Blocks the entire app for non-admin users.</p>
              </div>
              <Switch
                checked={modules.global.enabled}
                onCheckedChange={(v) => toggleModule("global", v)}
              />
            </div>
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="maintenance-title">Screen title</Label>
                <Input id="maintenance-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maintenance-message">Screen message</Label>
                <Textarea id="maintenance-message" value={message} onChange={(e) => setMessage(e.target.value)} rows={4} maxLength={280} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Per-module */}
        <Card>
          <CardHeader>
            <CardTitle>Module toggles</CardTitle>
            <CardDescription>Pause specific parts while the rest of the app stays live.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {MODULE_META.map((m) => {
              const state = modules[m.key];
              const original = originalModules[m.key];
              const res = reconResults[m.key];
              return (
                <div key={m.key} className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Label className="text-base font-semibold">{m.label}</Label>
                        <Badge variant={state.enabled ? "destructive" : "secondary"}>
                          {state.enabled ? "Paused" : "Live"}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{m.description}</p>
                      {state.enabled && state.since && (
                        <p className="text-xs text-muted-foreground">Paused since {new Date(state.since).toLocaleString()}</p>
                      )}
                    </div>
                    <Switch checked={state.enabled} onCheckedChange={(v) => toggleModule(m.key, v)} />
                  </div>

                  {/* Manual re-run */}
                  {original.enabled && original.since && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={reconciling === m.key}
                      onClick={() => runReconcile(m.key, original.since!)}
                      className="gap-2"
                    >
                      {reconciling === m.key ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                      Re-run reconciliation
                    </Button>
                  )}

                  {res && (
                    <div className="rounded-md bg-muted/50 p-3 text-sm">
                      Reconciliation: scanned <span className="font-semibold">{res.scanned}</span>, recovered <span className="font-semibold">{res.recovered}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Button onClick={handleSave} disabled={saving} className="w-full gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Maintenance Settings
        </Button>
      </div>
    </AdminLayout>
  );
}
