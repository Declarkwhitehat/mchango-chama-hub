import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Calendar, Share2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { DonationForm } from "@/components/DonationForm";
import { DonorsList } from "@/components/DonorsList";
import { CommissionDisplay } from "@/components/CommissionDisplay";
import { WithdrawalButton } from "@/components/WithdrawalButton";
import { WithdrawalHistory } from "@/components/WithdrawalHistory";

import { useAuth } from "@/contexts/AuthContext";

interface Campaign {
  id: string;
  title: string;
  slug: string;
  description: string;
  target_amount: number;
  current_amount: number;
  status: string;
  category: string;
  end_date: string;
  created_at: string;
  image_url?: string;
  whatsapp_link?: string;
  created_by: string;
  group_code?: string;
}

const MchangoDetail = () => {
  const { id } = useParams(); // This will be the slug
  const navigate = useNavigate();
  const { user } = useAuth();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [isCreator, setIsCreator] = useState(false);

  useEffect(() => {
    fetchCampaign();
  }, [id]);

  const fetchCampaign = async () => {
    try {
      setLoading(true);
      
      // Fetch by slug
      const { data, error } = await supabase
        .from('mchango')
        .select('*')
        .eq('slug', id)
        .eq('is_public', true)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        toast.error("Campaign not found");
        navigate("/mchango");
        return;
      }

      setCampaign(data);
      setIsCreator(user?.id === data.created_by);
    } catch (error: any) {
      console.error('Error fetching campaign:', error);
      toast.error("Failed to load campaign");
      navigate("/mchango");
    } finally {
      setLoading(false);
    }
  };

  const handleDonationSuccess = () => {
    // Refresh campaign data after successful donation
    fetchCampaign();
  };

  const getDaysLeft = (endDate: string) => {
    if (!endDate) return null;
    const now = new Date();
    const end = new Date(endDate);
    const diffTime = end.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
  };

  const handleShare = () => {
    const baseUrl = import.meta.env.VITE_APP_URL || window.location.origin;
    const shareUrl = `${baseUrl}/mchango/${campaign?.slug}`;
    navigator.clipboard.writeText(shareUrl);
    toast.success("Link copied to clipboard!");
  };

  if (loading) {
    return (
      <Layout showBackButton>
        <div className="container px-4 py-6 max-w-2xl mx-auto flex justify-center items-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!campaign) {
    return null;
  }

  const progress = (Number(campaign.current_amount) / Number(campaign.target_amount)) * 100;
  const daysLeft = getDaysLeft(campaign.end_date);

  return (
    <Layout showBackButton>
      <div className="container px-4 py-6 max-w-6xl mx-auto space-y-6">
        {/* Campaign Header */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-start mb-2">
              {campaign.category && <Badge variant="secondary">{campaign.category}</Badge>}
              <div className="flex gap-2">
                {daysLeft !== null && (
                  <Badge variant={daysLeft < 7 ? "destructive" : "default"}>
                    <Calendar className="h-3 w-3 mr-1" />
                    {daysLeft} days left
                  </Badge>
                )}
                <Button variant="outline" size="sm" onClick={handleShare}>
                  <Share2 className="h-3 w-3 mr-1" />
                  Share
                </Button>
              </div>
            </div>
            <CardTitle className="text-2xl">{campaign.title}</CardTitle>
            <CardDescription>
              Created on {new Date(campaign.created_at).toLocaleDateString()}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {campaign.image_url && (
              <img 
                src={campaign.image_url} 
                alt={campaign.title}
                className="w-full rounded-lg object-cover max-h-[400px]"
              />
            )}
            
            <p className="text-foreground leading-relaxed whitespace-pre-wrap">
              {campaign.description}
            </p>

            <div className="space-y-2 pt-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  KES {Number(campaign.current_amount).toLocaleString()} raised
                </span>
                <span className="font-semibold text-foreground">
                  of KES {Number(campaign.target_amount).toLocaleString()}
                </span>
              </div>
              <Progress value={progress} className="h-3" />
              <div className="text-sm text-muted-foreground">
                {progress.toFixed(1)}% funded
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Commission Display */}
        <CommissionDisplay 
          totalCollected={campaign.current_amount}
          commissionRate={0.15}
          type="mchango"
          showBreakdown={true}
        />

        {/* Withdrawal Button - Only for creators */}
        {isCreator && (
          <WithdrawalButton
            mchangoId={campaign.id}
            totalAvailable={campaign.current_amount}
            commissionRate={0.15}
            onSuccess={fetchCampaign}
          />
        )}

        {/* Withdrawal History - Visible to all */}
        <WithdrawalHistory mchangoId={campaign.id} />


        {/* Two Column Layout: Donate Form & Contributors */}
        <div className="grid md:grid-cols-2 gap-6">
          <DonationForm 
            mchangoId={campaign.id} 
            mchangoTitle={campaign.title}
            onSuccess={handleDonationSuccess}
          />
          
          <DonorsList 
            mchangoId={campaign.id} 
            totalAmount={campaign.current_amount}
          />
        </div>

        {/* WhatsApp Link */}
        {campaign.whatsapp_link && (
          <Card>
            <CardContent className="pt-6">
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => window.open(campaign.whatsapp_link, '_blank')}
              >
                Join WhatsApp Group
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
};

export default MchangoDetail;
