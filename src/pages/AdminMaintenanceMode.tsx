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
import { Loader2, Save, Wrench, ShieldAlert } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type SettingsMap = Record<string, { enabled?: boolean; text?: string }>;

const defaultTitle = "Scheduled maintenance";
const defaultMessage = "We are doing upgrades and system maintenance. Please check back shortly.";

export default function AdminMaintenanceMode() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [title, setTitle] = useState(defaultTitle);
  const [message, setMessage] = useState(defaultMessage);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("platform_settings")
        .select("setting_key, setting_value, updated_at")
        .in("setting_key", ["maintenance_mode", "maintenance_title", "maintenance_message"]);

      if (error) throw error;

      const settings = (data ?? []).reduce<SettingsMap>((acc, row: any) => {
        acc[row.setting_key] = row.setting_value ?? {};
        return acc;
      }, {});

      setEnabled(Boolean(settings.maintenance_mode?.enabled));
      setTitle(settings.maintenance_title?.text || defaultTitle);
      setMessage(settings.maintenance_message?.text || defaultMessage);
      setLastUpdated(data?.reduce((latest: string | null, row: any) => {
        if (!row.updated_at) return latest;
        return !latest || new Date(row.updated_at) > new Date(latest) ? row.updated_at : latest;
      }, null) ?? null);
    } catch (error) {
      console.error("Failed to load maintenance settings", error);
      toast({ title: "Error", description: "Failed to load maintenance mode settings", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id ?? null;

      const payload = [
        {
          setting_key: "maintenance_mode",
          setting_value: { enabled },
          description: "Controls whether the platform is in maintenance mode",
          updated_by: userId,
        },
        {
          setting_key: "maintenance_title",
          setting_value: { text: title.trim() || defaultTitle },
          description: "Title shown to users during maintenance mode",
          updated_by: userId,
        },
        {
          setting_key: "maintenance_message",
          setting_value: { text: message.trim() || defaultMessage },
          description: "Message shown to users during maintenance mode",
          updated_by: userId,
        },
      ];

      const { error } = await supabase
        .from("platform_settings")
        .upsert(payload, { onConflict: "setting_key" });

      if (error) throw error;

      await supabase.from("audit_logs").insert({
        table_name: "platform_settings",
        action: enabled ? "maintenance_mode_enabled" : "maintenance_mode_disabled",
        user_id: userId,
        new_values: {
          enabled,
          title: title.trim() || defaultTitle,
          message: message.trim() || defaultMessage,
        },
      });

      const { logAdminAction } = await import("@/lib/logAdminAction");
      await logAdminAction(enabled ? "maintenance.enable" : "maintenance.disable", {
        targetType: "platform_settings",
        metadata: { title: title.trim() || defaultTitle, message: message.trim() || defaultMessage },
      });

      setLastUpdated(new Date().toISOString());
      toast({ title: "Saved", description: "Maintenance mode settings updated" });
    } catch (error) {
      console.error("Failed to save maintenance settings", error);
      toast({ title: "Error", description: "Failed to save maintenance mode settings", variant: "destructive" });
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
            Turn this on during upgrades or system maintenance. Admin access stays available.
          </p>
        </div>

        <Alert className="border-border">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Global access control</AlertTitle>
          <AlertDescription>
            When enabled, normal users and public visitors will see the maintenance screen until you switch it off.
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle>Maintenance status</CardTitle>
                <CardDescription>Control whether the app is temporarily unavailable.</CardDescription>
              </div>
              <Badge variant={enabled ? "destructive" : "secondary"}>
                {enabled ? "Live" : "Off"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
              <div className="space-y-1">
                <Label htmlFor="maintenance-enabled" className="text-base font-semibold">Enable maintenance mode</Label>
                <p className="text-sm text-muted-foreground">
                  Blocks the app for non-admin users while you work on upgrades.
                </p>
              </div>
              <Switch id="maintenance-enabled" checked={enabled} onCheckedChange={setEnabled} />
            </div>

            <div className="grid gap-5">
              <div className="space-y-2">
                <Label htmlFor="maintenance-title">Screen title</Label>
                <Input
                  id="maintenance-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={defaultTitle}
                  maxLength={80}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="maintenance-message">Screen message</Label>
                <Textarea
                  id="maintenance-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={defaultMessage}
                  rows={5}
                  maxLength={280}
                />
              </div>
            </div>

            <Button onClick={handleSave} disabled={saving} className="w-full gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Maintenance Settings
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
            <CardDescription>What users will see while maintenance mode is active.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border bg-muted/30 p-6 space-y-3">
              <Badge variant={enabled ? "destructive" : "secondary"}>
                {enabled ? "Maintenance On" : "Maintenance Off"}
              </Badge>
              <h2 className="text-2xl font-semibold">{title.trim() || defaultTitle}</h2>
              <p className="text-muted-foreground max-w-2xl">{message.trim() || defaultMessage}</p>
              {lastUpdated && (
                <p className="text-xs text-muted-foreground">
                  Last updated {new Date(lastUpdated).toLocaleString()}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
