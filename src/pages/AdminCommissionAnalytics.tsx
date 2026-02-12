import { useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { CommissionAnalyticsDashboard } from "@/components/admin/CommissionAnalyticsDashboard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Shield, Lock, AlertTriangle } from "lucide-react";

const ADMIN_PRIVILEGE_CODE = "D3E9C0L1A3R9K";

const AdminCommissionAnalytics = () => {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState(false);
  const [attempts, setAttempts] = useState(0);

  const handleUnlock = () => {
    if (code === ADMIN_PRIVILEGE_CODE) {
      setIsUnlocked(true);
      setError(false);
    } else {
      setError(true);
      setAttempts(prev => prev + 1);
      setCode("");
    }
  };

  if (!isUnlocked) {
    return (
      <AdminLayout>
        <div className="container px-4 py-8 max-w-lg mx-auto">
          <Card className="border-2 border-destructive/30">
            <CardHeader className="text-center space-y-3">
              <div className="mx-auto h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
                <Shield className="h-8 w-8 text-destructive" />
              </div>
              <CardTitle className="text-2xl">Commission Analytics</CardTitle>
              <CardDescription className="text-base">
                This section contains sensitive financial data. Enter the admin privilege code to continue.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="password"
                  placeholder="Enter privilege code"
                  value={code}
                  onChange={(e) => { setCode(e.target.value); setError(false); }}
                  onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
                  className={`pl-10 ${error ? "border-destructive" : ""}`}
                  disabled={attempts >= 5}
                />
              </div>
              {error && (
                <div className="flex items-center gap-2 text-destructive text-sm">
                  <AlertTriangle className="h-4 w-4" />
                  <span>Invalid privilege code. {5 - attempts} attempts remaining.</span>
                </div>
              )}
              {attempts >= 5 && (
                <div className="text-destructive text-sm text-center font-medium">
                  Too many failed attempts. Please contact the system administrator.
                </div>
              )}
              <Button
                onClick={handleUnlock}
                className="w-full"
                disabled={!code || attempts >= 5}
              >
                <Shield className="h-4 w-4 mr-2" />
                Unlock Analytics
              </Button>
            </CardContent>
          </Card>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="container px-4 py-6 max-w-7xl mx-auto">
        <CommissionAnalyticsDashboard />
      </div>
    </AdminLayout>
  );
};

export default AdminCommissionAnalytics;
