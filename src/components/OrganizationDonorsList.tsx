import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { Users, Heart } from "lucide-react";
import { ContributionsPDFDownload } from "./ContributionsPDFDownload";

interface Donation {
  id: string;
  amount: number;
  display_name: string | null;
  is_anonymous: boolean;
  payment_status: string;
  created_at: string;
  completed_at: string | null;
}

interface OrganizationDonorsListProps {
  organizationId: string;
  totalAmount: number;
  organizationName?: string;
}

const COMMISSION_RATE = 0.15;

export const OrganizationDonorsList = ({ 
  organizationId, 
  totalAmount,
  organizationName = "Organization"
}: OrganizationDonorsListProps) => {
  const [donations, setDonations] = useState<Donation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDonations();
  }, [organizationId]);

  const fetchDonations = async () => {
    try {
      const { data, error } = await supabase
        .from('organization_donations')
        .select('id, amount, display_name, is_anonymous, payment_status, created_at, completed_at')
        .eq('organization_id', organizationId)
        .eq('payment_status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setDonations(data || []);
    } catch (error) {
      console.error('Error fetching donations:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  };

  // Transform donations for PDF component
  const contributionsForPdf = donations.map(d => ({
    id: d.id,
    display_name: d.is_anonymous || !d.display_name ? 'Anonymous' : d.display_name,
    amount: d.amount,
    created_at: d.completed_at || d.created_at,
    payment_status: d.payment_status,
  }));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <CardTitle>Supporters</CardTitle>
          </div>
          <Badge variant="secondary" className="gap-1">
            <Heart className="h-3 w-3" />
            {donations.length} donors
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* PDF Download Section */}
        <ContributionsPDFDownload
          title={organizationName}
          contributions={contributionsForPdf}
          currentAmount={totalAmount}
          commissionRate={COMMISSION_RATE}
        />

        {loading ? (
          <p className="text-center text-muted-foreground py-4">Loading supporters...</p>
        ) : donations.length === 0 ? (
          <div className="text-center py-8">
            <Heart className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No donations yet</p>
            <p className="text-sm text-muted-foreground mt-1">Be the first to support this organization!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {donations.map((donation) => (
              <div 
                key={donation.id} 
                className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {donation.is_anonymous || !donation.display_name 
                        ? '?' 
                        : donation.display_name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">
                      {donation.is_anonymous || !donation.display_name 
                        ? 'Anonymous' 
                        : donation.display_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(donation.completed_at || donation.created_at)}
                    </p>
                  </div>
                </div>
                <span className="font-semibold text-primary">
                  KES {Number(donation.amount).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
