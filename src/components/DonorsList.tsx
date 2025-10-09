import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatDistanceToNow } from "date-fns";

interface Donation {
  id: string;
  display_name: string | null;
  amount: number;
  is_anonymous: boolean;
  created_at: string;
  payment_status: string;
}

interface DonorsListProps {
  mchangoId: string;
  totalAmount: number;
}

const COMMISSION_RATE = 0.15; // 15%

export const DonorsList = ({ mchangoId, totalAmount }: DonorsListProps) => {
  const [donations, setDonations] = useState<Donation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDonations();

    // Subscribe to new donations
    const channel = supabase
      .channel('mchango-donations')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'mchango_donations',
          filter: `mchango_id=eq.${mchangoId}`,
        },
        () => {
          fetchDonations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [mchangoId]);

  const fetchDonations = async () => {
    try {
      const { data, error } = await supabase
        .from("mchango_donations")
        .select("*")
        .eq("mchango_id", mchangoId)
        .eq("payment_status", "completed")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setDonations(data || []);
    } catch (error) {
      console.error("Error fetching donations:", error);
    } finally {
      setLoading(false);
    }
  };

  const commission = totalAmount * COMMISSION_RATE;
  const netBalance = totalAmount - commission;
  const completedDonations = donations.filter(d => d.payment_status === 'completed');

  return (
    <Card>
      <CardHeader>
        <CardTitle>Financial Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Total Collected:</span>
            <span className="font-semibold">KES {totalAmount.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Commission (15%):</span>
            <span className="font-semibold text-red-600">- KES {commission.toLocaleString()}</span>
          </div>
          <Separator />
          <div className="flex justify-between">
            <span className="font-semibold">Net Balance:</span>
            <span className="font-bold text-lg text-green-600">
              KES {netBalance.toLocaleString()}
            </span>
          </div>
        </div>

        <Separator />

        <div>
          <h3 className="font-semibold mb-3">
            Contributors ({completedDonations.length})
          </h3>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading contributors...</p>
          ) : completedDonations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No contributions yet. Be the first to donate!</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {completedDonations.map((donation, index) => (
                <div
                  key={donation.id}
                  className="flex items-center justify-between p-3 bg-muted rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold">
                      {index + 1}
                    </div>
                    <div>
                      <p className="font-medium">
                        {donation.is_anonymous ? "Anonymous" : (donation.display_name || "Anonymous")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(donation.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">KES {donation.amount.toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
