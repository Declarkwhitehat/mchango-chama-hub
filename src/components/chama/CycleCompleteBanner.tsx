import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, PartyPopper } from "lucide-react";

interface CycleCompleteBannerProps {
  chamaId: string;
  chamaName: string;
  userId: string;
  contributionAmount?: number;
  contributionFrequency?: string;
  minMembers?: number;
}

export function CycleCompleteBanner({ 
  chamaId, 
  chamaName, 
  userId, 
  contributionAmount, 
  contributionFrequency,
  minMembers 
}: CycleCompleteBannerProps) {
  const [rejoinRequest, setRejoinRequest] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [approvedCount, setApprovedCount] = useState(0);

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

      // Get approved count
      const { count } = await supabase
        .from('chama_rejoin_requests')
        .select('id', { count: 'exact', head: true })
        .eq('chama_id', chamaId)
        .eq('status', 'approved');

      setApprovedCount(count || 0);
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

      toast.success('Rejoin request submitted!');
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

  const formatFrequency = (freq?: string) => {
    if (!freq) return '';
    return freq.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  return (
    <Card className="border-primary bg-primary/5">
      <CardContent className="pt-6">
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-2">
            <PartyPopper className="h-6 w-6 text-primary" />
            <h3 className="text-xl font-bold">🎉 Cycle Complete!</h3>
          </div>
          <p className="text-muted-foreground">
            All members have received their payouts. Would you like to rejoin for another cycle?
          </p>

          {/* Show current terms */}
          {contributionAmount && (
            <div className="bg-background border rounded-lg p-4 space-y-2 text-sm">
              <h4 className="font-semibold text-base">Current Terms</h4>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Contribution Amount:</span>
                <span className="font-medium">KES {contributionAmount?.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Frequency:</span>
                <span className="font-medium">{formatFrequency(contributionFrequency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Members Confirmed:</span>
                <span className="font-medium">{approvedCount}{minMembers ? ` / ${minMembers} min` : ''}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                ⏰ Chama auto-restarts 48h after cycle completion if enough members rejoin. 
                Deleted if less than 40% rejoin within 24h.
              </p>
            </div>
          )}

          {!rejoinRequest && (
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-2">
                <Checkbox 
                  id="terms" 
                  checked={termsAccepted} 
                  onCheckedChange={(checked) => setTermsAccepted(checked === true)}
                />
                <label htmlFor="terms" className="text-sm cursor-pointer">
                  I confirm I agree to the above terms
                </label>
              </div>
              <Button 
                onClick={handleRejoinRequest} 
                size="lg" 
                disabled={submitting || !termsAccepted}
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    Submitting...
                  </>
                ) : (
                  'Rejoin Chama'
                )}
              </Button>
            </div>
          )}

          {rejoinRequest?.status === 'pending' && (
            <Badge variant="secondary" className="text-base px-4 py-2">
              ⏳ Rejoin Request Pending Manager Approval
            </Badge>
          )}

          {rejoinRequest?.status === 'approved' && (
            <Badge variant="default" className="text-base px-4 py-2">
              ✅ Confirmed - Waiting for Cycle to Start
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
