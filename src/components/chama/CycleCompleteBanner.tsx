import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, PartyPopper } from "lucide-react";

interface CycleCompleteBannerProps {
  chamaId: string;
  chamaName: string;
  userId: string;
}

export function CycleCompleteBanner({ chamaId, chamaName, userId }: CycleCompleteBannerProps) {
  const [rejoinRequest, setRejoinRequest] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadRejoinStatus();
  }, [chamaId, userId]);

  const loadRejoinStatus = async () => {
    try {
      const { data, error } = await supabase
        .from('chama_rejoin_requests')
        .select('*')
        .eq('chama_id', chamaId)
        .eq('user_id', userId)
        .in('status', ['pending', 'approved'])
        .maybeSingle();

      if (error) throw error;
      setRejoinRequest(data);
    } catch (error) {
      console.error('Error loading rejoin status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRejoinRequest = async () => {
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please log in to continue");
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chama-rejoin`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ chamaId }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to submit rejoin request');
      }

      toast.success('Rejoin request submitted! Your manager will review it.');
      loadRejoinStatus();
    } catch (error: any) {
      toast.error(error.message || 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return null;
  }

  return (
    <Card className="border-primary bg-primary/5">
      <CardContent className="pt-6">
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-2">
            <PartyPopper className="h-6 w-6 text-primary" />
            <h3 className="text-xl font-bold">🎉 Cycle Complete!</h3>
          </div>
          <p className="text-muted-foreground">
            All members have received their payouts. Would you like to rejoin for another cycle with a new randomized payout order?
          </p>

          {!rejoinRequest && (
            <Button onClick={handleRejoinRequest} size="lg" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  Submitting...
                </>
              ) : (
                'Request to Rejoin'
              )}
            </Button>
          )}

          {rejoinRequest?.status === 'pending' && (
            <Badge variant="secondary" className="text-base px-4 py-2">
              ⏳ Rejoin Request Pending Manager Approval
            </Badge>
          )}

          {rejoinRequest?.status === 'approved' && (
            <Badge variant="default" className="text-base px-4 py-2">
              ✅ Approved - Waiting for New Cycle to Start
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
