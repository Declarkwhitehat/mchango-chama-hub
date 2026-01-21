import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2, RefreshCw, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

interface CleanupStatus {
  job_name: string;
  schedule: string;
  last_run: string | null;
  status: string;
  message?: string;
  contributions_deleted?: number;
  donations_deleted?: number;
  withdrawals_deleted?: number;
  transactions_deleted?: number;
}

export const CleanupJobStatus = () => {
  const [status, setStatus] = useState<CleanupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke('cleanup-job-status');
      
      if (error) throw error;
      setStatus(data);
    } catch (error: any) {
      console.error('Error fetching cleanup status:', error);
      setStatus({
        job_name: "cleanup-failed-transactions-10hrs",
        schedule: "Every 10 hours",
        last_run: null,
        status: "unknown"
      });
    } finally {
      setLoading(false);
    }
  };

  const triggerManualCleanup = async () => {
    try {
      setTriggering(true);
      const { data, error } = await supabase.functions.invoke('cleanup-failed-transactions');
      
      if (error) throw error;
      
      toast({
        title: "Cleanup Completed",
        description: `Deleted: ${data.contributions_deleted} contributions, ${data.donations_deleted} donations, ${data.withdrawals_deleted} withdrawals, ${data.transactions_deleted} transactions`,
      });
      
      // Refresh status after manual trigger
      await fetchStatus();
    } catch (error: any) {
      console.error('Error triggering cleanup:', error);
      toast({
        title: "Error",
        description: "Failed to trigger cleanup",
        variant: "destructive",
      });
    } finally {
      setTriggering(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Trash2 className="h-5 w-5" />
              Failed Transactions Cleanup
            </CardTitle>
            <CardDescription className="mt-1">
              Auto-deletes failed transactions older than 12 hours
            </CardDescription>
          </div>
          <Badge variant={status?.status === "scheduled" ? "secondary" : "outline"}>
            {status?.schedule || "Every 10 hours"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            {loading ? (
              <span>Loading...</span>
            ) : status?.last_run ? (
              <span>
                Last run: {formatDistanceToNow(new Date(status.last_run), { addSuffix: true })}
              </span>
            ) : (
              <span>No recent runs recorded</span>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchStatus}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={triggerManualCleanup}
              disabled={triggering}
            >
              {triggering ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-1" />
                  Run Now
                </>
              )}
            </Button>
          </div>
        </div>
        
        {status?.message && (
          <p className="text-xs text-muted-foreground">{status.message}</p>
        )}
      </CardContent>
    </Card>
  );
};
