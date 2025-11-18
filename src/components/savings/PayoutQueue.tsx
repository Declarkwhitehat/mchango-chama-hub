import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface PayoutQueueProps {
  memberId: string;
  chamaId: string;
}

export const PayoutQueue = ({ memberId, chamaId }: PayoutQueueProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [payoutInfo, setPayoutInfo] = useState<any>(null);

  useEffect(() => {
    fetchPayoutPosition();
  }, [memberId]);

  const fetchPayoutPosition = async () => {
    try {
      const { data, error } = await supabase
        .rpc('get_member_payout_position', { p_member_id: memberId });

      if (error) throw error;
      
      if (data && data.length > 0) {
        setPayoutInfo(data[0]);
      }
    } catch (error: any) {
      console.error('Error fetching payout position:', error);
      toast({
        title: "Error",
        description: "Failed to load payout information",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!payoutInfo) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          Your Payout Position
        </CardTitle>
        <CardDescription>
          Track when you'll receive your payout
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Position in Queue</p>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-lg px-3 py-1">
                #{payoutInfo.position_in_queue}
              </Badge>
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Estimated Payout Date</p>
            <p className="text-lg font-semibold">
              {format(new Date(payoutInfo.estimated_payout_date), 'MMM dd, yyyy')}
            </p>
          </div>

          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Estimated Amount</p>
            <p className="text-lg font-semibold text-primary">
              KES {payoutInfo.estimated_amount.toLocaleString()}
            </p>
          </div>
        </div>

        <div className="pt-4 border-t">
          <p className="text-sm text-muted-foreground">
            Payout order is determined by join date. The estimated date assumes all members continue making regular contributions.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
