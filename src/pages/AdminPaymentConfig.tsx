import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info, Save, ExternalLink, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

export default function AdminPaymentConfig() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tillNumber, setTillNumber] = useState("");
  const [shortcode, setShortcode] = useState("");

  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const validationUrl = `https://${projectId}.supabase.co/functions/v1/c2b-validate-payment`;
  const confirmationUrl = `https://${projectId}.supabase.co/functions/v1/c2b-confirm-payment`;

  useEffect(() => {
    const checkAdminRole = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .single();

      setIsAdmin(!!data);
      setLoading(false);
    };

    checkAdminRole();
    // Load current configuration (placeholder for now)
    setTillNumber("000000");
    setShortcode("000000");
  }, [user]);

  const handleSave = async () => {
    setLoading(true);
    try {
      // This is a placeholder - actual implementation would update Supabase secrets
      // For now, just show success message
      toast.success("Configuration saved! Note: This is a placeholder. You'll need to update secrets manually.");
    } catch (error) {
      console.error("Error saving configuration:", error);
      toast.error("Failed to save configuration");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard!`);
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="container mx-auto py-8">
          <p>Loading...</p>
        </div>
      </AdminLayout>
    );
  }

  if (!user || !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <AdminLayout>
      <div className="container max-w-4xl mx-auto py-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Payment Configuration</h1>
          <p className="text-muted-foreground mt-2">
            Configure M-Pesa till/paybill settings for offline payment reconciliation
          </p>
        </div>

        {/* Configuration Form */}
        <Card>
          <CardHeader>
            <CardTitle>M-Pesa Till/Paybill Settings</CardTitle>
            <CardDescription>
              Enter your M-Pesa business till number or paybill number
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tillNumber">Till Number / Paybill Number</Label>
              <Input
                id="tillNumber"
                value={tillNumber}
                onChange={(e) => setTillNumber(e.target.value)}
                placeholder="e.g., 123456"
              />
              <p className="text-xs text-muted-foreground">
                This is the number customers will use to make M-Pesa payments
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="shortcode">Shortcode (C2B)</Label>
              <Input
                id="shortcode"
                value={shortcode}
                onChange={(e) => setShortcode(e.target.value)}
                placeholder="e.g., 123456"
              />
              <p className="text-xs text-muted-foreground">
                Usually the same as your till number
              </p>
            </div>

            <Button onClick={handleSave} disabled={loading} className="w-full">
              <Save className="h-4 w-4 mr-2" />
              {loading ? "Saving..." : "Save Configuration"}
            </Button>
          </CardContent>
        </Card>

        {/* C2B Registration URLs */}
        <Card>
          <CardHeader>
            <CardTitle>C2B Registration URLs</CardTitle>
            <CardDescription>
              Register these URLs with Safaricom to enable automatic payment reconciliation
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                You need to register these URLs with Safaricom's Daraja API to enable C2B (Customer to Business) payments
              </AlertDescription>
            </Alert>

            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Validation URL</Label>
                <div className="flex gap-2">
                  <Input value={validationUrl} readOnly className="font-mono text-xs" />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(validationUrl, "Validation URL")}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Confirmation URL</Label>
                <div className="flex gap-2">
                  <Input value={confirmationUrl} readOnly className="font-mono text-xs" />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(confirmationUrl, "Confirmation URL")}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-border">
              <h4 className="font-medium mb-2">Registration Steps:</h4>
              <ol className="list-decimal pl-5 space-y-2 text-sm text-muted-foreground">
                <li>Log in to Safaricom Daraja Portal</li>
                <li>Navigate to your app/shortcode settings</li>
                <li>Register the Validation URL and Confirmation URL</li>
                <li>Test with a small payment to verify configuration</li>
              </ol>
              <Button variant="outline" className="mt-4" asChild>
                <a href="https://developer.safaricom.co.ke/" target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open Daraja Portal
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Status & Testing */}
        <Card>
          <CardHeader>
            <CardTitle>System Status</CardTitle>
            <CardDescription>
              Current offline payment reconciliation status
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-accent/50">
              <AlertCircle className="h-5 w-5 text-yellow-500 mt-0.5" />
              <div className="space-y-1">
                <p className="font-medium">Configuration Pending</p>
                <p className="text-sm text-muted-foreground">
                  Till number is set to placeholder (000000). Update with your actual till number and register C2B URLs with Safaricom to enable offline payments.
                </p>
              </div>
            </div>

            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                <strong>Note:</strong> Once configured, members can make offline M-Pesa payments using their Member ID as the account number. Payments will be automatically credited to their accounts within 1 minute.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
