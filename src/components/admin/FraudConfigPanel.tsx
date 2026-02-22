import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Save, Settings } from "lucide-react";

export function FraudConfigPanel() {
  const [configs, setConfigs] = useState<any[]>([]);
  const [editedValues, setEditedValues] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchConfig = async () => {
    setLoading(true);
    const { data } = await supabase.functions.invoke("fraud-monitor", {
      body: { action: "get-config" },
    });
    if (data?.data) {
      setConfigs(data.data);
      const initial: Record<string, any> = {};
      data.data.forEach((c: any) => { initial[c.rule_key] = c.rule_value?.value; });
      setEditedValues(initial);
    }
    setLoading(false);
  };

  useEffect(() => { fetchConfig(); }, []);

  const handleSave = async (ruleKey: string) => {
    setSaving(ruleKey);
    try {
      await supabase.functions.invoke("fraud-monitor", {
        body: { action: "update-config", rule_key: ruleKey, rule_value: editedValues[ruleKey] },
      });
      toast({ title: "Saved", description: `${ruleKey} updated successfully` });
      fetchConfig();
    } catch {
      toast({ title: "Error", description: "Failed to save", variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  if (loading) return <div className="text-center py-12 text-muted-foreground">Loading configuration...</div>;

  const isBooleanConfig = (key: string) => key === "device_detection_enabled";

  return (
    <div className="space-y-4">
      {configs.map((config) => {
        const isBoolean = isBooleanConfig(config.rule_key);
        const currentValue = editedValues[config.rule_key];
        const originalValue = config.rule_value?.value;
        const hasChanged = currentValue !== originalValue;

        return (
          <Card key={config.id}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <Label className="font-medium">{config.rule_key.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase())}</Label>
                  <p className="text-sm text-muted-foreground mt-1">{config.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  {isBoolean ? (
                    <Switch
                      checked={!!currentValue}
                      onCheckedChange={(v) => setEditedValues((prev) => ({ ...prev, [config.rule_key]: v }))}
                    />
                  ) : (
                    <Input
                      type="number"
                      value={currentValue ?? ""}
                      onChange={(e) => {
                        const v = e.target.value.includes(".") ? parseFloat(e.target.value) : parseInt(e.target.value);
                        setEditedValues((prev) => ({ ...prev, [config.rule_key]: isNaN(v) ? 0 : v }));
                      }}
                      className="w-32"
                    />
                  )}
                  <Button
                    size="sm"
                    disabled={!hasChanged || saving === config.rule_key}
                    onClick={() => handleSave(config.rule_key)}
                  >
                    <Save className="h-3 w-3 mr-1" />
                    {saving === config.rule_key ? "..." : "Save"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
