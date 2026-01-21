import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, ArrowRight, Calendar } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface SkippedMemberAlertProps {
  chamaId: string;
  memberId: string;
  contributionAmount: number;
}

interface SkipInfo {
  skipReason: string;
  skippedAt: string;
  amountOwed: number;
  amountPaid: number;
  originalPosition: number;
  newPosition: number | null;
}

export const SkippedMemberAlert = ({ chamaId, memberId, contributionAmount }: SkippedMemberAlertProps) => {
  const navigate = useNavigate();
  const [skipInfo, setSkipInfo] = useState<SkipInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkSkipStatus();
  }, [memberId]);

  const checkSkipStatus = async () => {
    try {
      // Check if member was skipped
      const { data: member, error: memberError } = await supabase
        .from('chama_members')
        .select('was_skipped, skipped_at, skip_reason')
        .eq('id', memberId)
        .single();

      if (memberError || !member?.was_skipped) {
        setLoading(false);
        return;
      }

      // Get skip details from payout_skips table
      const { data: skipData, error: skipError } = await supabase
        .from('payout_skips')
        .select('*')
        .eq('member_id', memberId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (skipData) {
        setSkipInfo({
          skipReason: skipData.skip_reason,
          skippedAt: skipData.created_at,
          amountOwed: skipData.amount_owed,
          amountPaid: skipData.amount_paid,
          originalPosition: skipData.original_position,
          newPosition: skipData.new_position
        });
      } else if (member.skip_reason) {
        // Fallback to member record if skip table doesn't have data
        setSkipInfo({
          skipReason: member.skip_reason,
          skippedAt: member.skipped_at,
          amountOwed: 0,
          amountPaid: 0,
          originalPosition: 0,
          newPosition: null
        });
      }
    } catch (error) {
      console.error('Error checking skip status:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !skipInfo) {
    return null;
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <Card className="border-destructive bg-destructive/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-5 w-5" />
          Your Payout Was Skipped
        </CardTitle>
        <CardDescription>
          {skipInfo.skippedAt && `Skipped on ${formatDate(skipInfo.skippedAt)}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Reason</AlertTitle>
          <AlertDescription>{skipInfo.skipReason}</AlertDescription>
        </Alert>

        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 bg-background rounded-lg border">
            <p className="text-sm text-muted-foreground">Amount Due</p>
            <p className="text-lg font-bold text-destructive">
              KES {skipInfo.amountOwed.toLocaleString()}
            </p>
          </div>
          <div className="p-3 bg-background rounded-lg border">
            <p className="text-sm text-muted-foreground">Amount Paid</p>
            <p className="text-lg font-bold">
              KES {skipInfo.amountPaid.toLocaleString()}
            </p>
          </div>
        </div>

        {skipInfo.newPosition && (
          <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">
              New position in queue: <strong>#{skipInfo.newPosition}</strong>
            </span>
          </div>
        )}

        <div className="pt-2">
          <p className="text-sm text-muted-foreground mb-3">
            <strong>How to get your payout:</strong> Complete your outstanding contributions 
            to be rescheduled in the payout queue. Once you've paid the required amount, 
            you'll be eligible for the next available payout slot.
          </p>
          
          <Button className="w-full gap-2" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            Make a Contribution
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
