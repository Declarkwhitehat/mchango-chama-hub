import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RiskScoreBadge } from "./RiskScoreBadge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Lock, Unlock, CheckCircle, AlertTriangle, ShieldAlert, Clock } from "lucide-react";
import { format } from "date-fns";
import { Progress } from "@/components/ui/progress";

interface FraudUserDetailProps {
  userId: string;
}

export function FraudUserDetail({ userId }: FraudUserDetailProps) {
  const [riskProfile, setRiskProfile] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchData = async () => {
    setLoading(true);
    try {
      const [riskRes, eventsRes] = await Promise.all([
        supabase.functions.invoke("fraud-monitor", { body: { action: "get-user-risk", user_id: userId } }),
        supabase.functions.invoke("fraud-monitor", { body: { action: "get-fraud-events", user_id: userId, page_size: 100 } }),
      ]);
      if (riskRes.data?.data) setRiskProfile(riskRes.data.data);
      if (eventsRes.data?.data) setEvents(eventsRes.data.data);
    } catch (e) {
      console.error("Error fetching fraud details", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [userId]);

  const handleAction = async (adminAction: string) => {
    try {
      await supabase.functions.invoke("fraud-monitor", {
        body: { action: "admin-action", user_id: userId, admin_action: adminAction },
      });
      toast({ title: "Action applied", description: `${adminAction} successfully` });
      fetchData();
    } catch {
      toast({ title: "Error", description: "Failed to apply action", variant: "destructive" });
    }
  };

  if (loading) return <div className="text-center py-12 text-muted-foreground">Loading...</div>;
  if (!riskProfile) return <div className="text-center py-12 text-muted-foreground">No risk profile found for this user.</div>;

  const ruleLabels: Record<string, string> = {
    failed_login: "Failed Login",
    failed_2fa: "Failed 2FA",
    new_ip_login: "New IP Login",
    rapid_transactions: "Rapid Transactions",
    abnormal_withdrawal: "Abnormal Withdrawal",
    daily_limit_exceeded: "Daily Limit Exceeded",
  };

  return (
    <div className="space-y-6">
      {/* User Risk Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5" />
              Risk Profile
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <div>
                <p className="text-sm text-muted-foreground">User</p>
                <p className="font-semibold text-lg">{riskProfile.profiles?.full_name || "Unknown"}</p>
                <p className="text-sm text-muted-foreground">{riskProfile.profiles?.phone} · {riskProfile.profiles?.email}</p>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm">Risk Score</span>
                <span className="font-mono font-bold text-lg">{riskProfile.risk_score}/100</span>
              </div>
              <Progress value={riskProfile.risk_score} className="h-3" />
              <div className="flex gap-2">
                <RiskScoreBadge level={riskProfile.risk_level} score={riskProfile.risk_score} />
                {riskProfile.is_flagged && <Badge variant="destructive">Flagged</Badge>}
                {riskProfile.is_frozen && <Badge variant="destructive">Frozen</Badge>}
                {riskProfile.review_status !== "none" && (
                  <Badge variant="secondary">{riskProfile.review_status}</Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Admin Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button variant="outline" className="w-full justify-start gap-2" onClick={() => handleAction("under_review")}>
              <AlertTriangle className="h-4 w-4 text-yellow-500" /> Mark Under Review
            </Button>
            <Button variant="outline" className="w-full justify-start gap-2" onClick={() => handleAction("cleared")}>
              <CheckCircle className="h-4 w-4 text-green-500" /> Clear & Reset
            </Button>
            {!riskProfile.is_frozen ? (
              <Button variant="destructive" className="w-full justify-start gap-2" onClick={() => handleAction("frozen")}>
                <Lock className="h-4 w-4" /> Freeze Account
              </Button>
            ) : (
              <Button variant="outline" className="w-full justify-start gap-2" onClick={() => handleAction("unfrozen")}>
                <Unlock className="h-4 w-4 text-green-500" /> Unfreeze Account
              </Button>
            )}
            <Button variant="outline" className="w-full justify-start gap-2" onClick={() => handleAction("escalated")}>
              <ShieldAlert className="h-4 w-4 text-red-500" /> Escalate to Compliance
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Event Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Fraud Event Timeline ({events.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No fraud events recorded</p>
          ) : (
            <div className="space-y-3">
              {events.map((evt) => (
                <div key={evt.id} className="flex items-start gap-3 p-3 border rounded-lg">
                  <div className="h-2 w-2 rounded-full bg-red-500 mt-2 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{ruleLabels[evt.rule_triggered] || evt.rule_triggered}</span>
                      <Badge variant="outline" className="text-xs">+{evt.risk_points_added} pts</Badge>
                      <span className="text-xs text-muted-foreground">Score: {evt.total_risk_score}</span>
                    </div>
                    <div className="flex gap-3 text-xs text-muted-foreground mt-1">
                      <span>{format(new Date(evt.created_at), "MMM d, yyyy HH:mm:ss")}</span>
                      {evt.ip_address && <span>IP: {evt.ip_address}</span>}
                    </div>
                    {evt.metadata && (
                      <pre className="text-xs mt-1 text-muted-foreground bg-muted p-1 rounded overflow-x-auto">
                        {JSON.stringify(evt.metadata, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
