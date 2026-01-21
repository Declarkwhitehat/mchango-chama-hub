import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, Users, XCircle, CheckCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";

interface PendingRequest {
  id: string;
  approval_status: string;
  joined_at: string | null;
  chama: {
    id: string;
    name: string;
    slug: string;
    contribution_amount: number;
    contribution_frequency: string;
  } | null;
}

interface PendingJoinRequestsProps {
  userId: string;
  onRefresh?: () => void;
}

export function PendingJoinRequests({ userId, onRefresh }: PendingJoinRequestsProps) {
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPendingRequests = async () => {
      try {
        setLoading(true);
        
        const { data, error } = await supabase
          .from('chama_members')
          .select(`
            id,
            approval_status,
            joined_at,
            chama:chama_id (
              id,
              name,
              slug,
              contribution_amount,
              contribution_frequency
            )
          `)
          .eq('user_id', userId)
          .in('approval_status', ['pending', 'rejected'])
          .order('joined_at', { ascending: false });

        if (error) {
          console.error('Error fetching pending requests:', error);
          return;
        }

        setPendingRequests((data as PendingRequest[]) || []);
      } catch (error) {
        console.error('Error:', error);
      } finally {
        setLoading(false);
      }
    };

    if (userId) {
      fetchPendingRequests();
    }
  }, [userId]);

  const getFrequencyLabel = (frequency: string) => {
    const labels: Record<string, string> = {
      daily: 'Daily',
      weekly: 'Weekly',
      biweekly: 'Bi-weekly',
      monthly: 'Monthly',
    };
    return labels[frequency] || frequency;
  };

  const getStatusBadge = (status: string) => {
    if (status === 'pending') {
      return (
        <Badge variant="secondary" className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          Pending
        </Badge>
      );
    }
    if (status === 'rejected') {
      return (
        <Badge variant="destructive" className="flex items-center gap-1">
          <XCircle className="h-3 w-3" />
          Rejected
        </Badge>
      );
    }
    return null;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Don't show if no pending/rejected requests
  if (!loading && pendingRequests.length === 0) {
    return null;
  }

  return (
    <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-base sm:text-lg flex items-center gap-2">
          <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          My Pending Requests
        </CardTitle>
        <CardDescription>
          Chama groups you've requested to join
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Loading requests...</span>
          </div>
        ) : (
          pendingRequests.map((request) => (
            <div
              key={request.id}
              className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 bg-background rounded-lg border"
            >
              <div className="flex items-start gap-3">
                <div className="p-2 bg-primary/10 rounded-lg flex-shrink-0">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm sm:text-base text-foreground truncate">
                    {request.chama?.name || 'Unknown Chama'}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground">
                      KES {request.chama?.contribution_amount?.toLocaleString() || 0} • {getFrequencyLabel(request.chama?.contribution_frequency || '')}
                    </span>
                    {request.joined_at && (
                      <span className="text-xs text-muted-foreground">
                        • Requested {formatDate(request.joined_at)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 justify-end">
                {getStatusBadge(request.approval_status)}
                {request.approval_status === 'rejected' && request.chama?.slug && (
                  <Link to={`/chama/join?code=`}>
                    <Button variant="outline" size="sm" className="text-xs">
                      Try Again
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          ))
        )}
        
        {pendingRequests.some(r => r.approval_status === 'pending') && (
          <p className="text-xs text-muted-foreground text-center pt-2">
            A manager will review your request soon. You'll be notified when approved.
          </p>
        )}
      </CardContent>
    </Card>
  );
}