import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Calendar, Share2, Loader2, AlertCircle, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { DonationForm } from "@/components/DonationForm";
import { DonorsList } from "@/components/DonorsList";
import { CommissionDisplay } from "@/components/CommissionDisplay";
import { WithdrawalButton } from "@/components/WithdrawalButton";
import { WithdrawalHistory } from "@/components/WithdrawalHistory";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { VerificationRequestButton } from "@/components/VerificationRequestButton";
import { ExtendCampaignDays } from "@/components/mchango/ExtendCampaignDays";
import { CopyableUniqueId } from "@/components/CopyableUniqueId";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";

interface Campaign {
  id: string;
  title: string;
  slug: string;
  description: string;
  target_amount: number;
  current_amount: number;
  total_gross_collected: number;
  total_commission_paid: number;
  available_balance: number;
  status: string;
  category: string;
  end_date: string;
  created_at: string;
  image_url?: string;
  image_url_2?: string;
  image_url_3?: string;
  youtube_url?: string;
  whatsapp_link?: string;
  created_by: string;
  group_code?: string;
  is_verified: boolean;
  paybill_account_id?: string;
}

// Helper to convert YouTube URL to embed URL
const getYoutubeEmbedUrl = (url: string): string => {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  const videoId = match && match[2].length === 11 ? match[2] : null;
  return videoId ? `https://www.youtube.com/embed/${videoId}` : '';
};

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
      
      // First, try to fetch the campaign
      const { data, error } = await supabase
        .from('mchango')
        .select('*')
        .eq('slug', id)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        toast.error("Campaign not found");
        navigate("/mchango");
        return;
      }

      // Check if user is the creator
      const isOwner = user?.id === data.created_by;

      // Calculate days left
      const daysRemaining = data.end_date ? getDaysLeft(data.end_date) : null;
      const isExpired = daysRemaining === 0;

      // If campaign is expired and user is not the owner, redirect
      if (isExpired && !isOwner) {
        toast.error("This campaign has ended");
        navigate("/mchango");
        return;
      }

      // If campaign is not public and user is not owner, redirect
      if (!data.is_public && !isOwner) {
        toast.error("Campaign not found");
        navigate("/mchango");
        return;
      }

      setCampaign(data);
      setIsCreator(isOwner);
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

  const allTimeCollected = Number(campaign.total_gross_collected || 0);
  const progress = (allTimeCollected / Number(campaign.target_amount)) * 100;
  const daysLeft = getDaysLeft(campaign.end_date);
  const isExpired = daysLeft === 0;

  return (
    <Layout showBackButton>
        <div className="container px-4 py-6 max-w-6xl mx-auto space-y-6">
          {/* Expired Campaign Alert for Owner */}
          {isExpired && isCreator && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Campaign Expired</AlertTitle>
              <AlertDescription>
                Your campaign has ended and is no longer visible to the public. Use the "Extend Campaign" option below to reactivate it.
              </AlertDescription>
            </Alert>
          )}

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
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle className="text-2xl flex items-center gap-2">
                  {campaign.title}
                  {campaign.is_verified && <VerifiedBadge size="md" />}
                </CardTitle>
                <VerificationRequestButton
                  entityType="mchango"
                  entityId={campaign.id}
                  entityName={campaign.title}
                  isVerified={campaign.is_verified}
                  isOwner={isCreator}
                />
              </div>
              <CardDescription>
                Created on {new Date(campaign.created_at).toLocaleDateString()}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Image Gallery */}
              {(campaign.image_url || campaign.image_url_2 || campaign.image_url_3) && (
                <div className="space-y-2">
                  {campaign.image_url && (
                    <img 
                      src={campaign.image_url} 
                      alt={campaign.title}
                      className="w-full rounded-lg object-cover max-h-[400px]"
                    />
                  )}
                  {(campaign.image_url_2 || campaign.image_url_3) && (
                    <div className="grid grid-cols-2 gap-2">
                      {campaign.image_url_2 && (
                        <img 
                          src={campaign.image_url_2} 
                          alt={`${campaign.title} - Photo 2`}
                          className="w-full rounded-lg object-cover h-48"
                        />
                      )}
                      {campaign.image_url_3 && (
                        <img 
                          src={campaign.image_url_3} 
                          alt={`${campaign.title} - Photo 3`}
                          className="w-full rounded-lg object-cover h-48"
                        />
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* YouTube Video */}
              {campaign.youtube_url && (
                <div className="aspect-video rounded-lg overflow-hidden">
                  <iframe
                    src={getYoutubeEmbedUrl(campaign.youtube_url)}
                    title="Campaign Video"
                    className="w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              )}
              
              <p className="text-foreground leading-relaxed whitespace-pre-wrap">
                {campaign.description}
              </p>

              <div className="space-y-2 pt-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    KES {allTimeCollected.toLocaleString()} raised
                  </span>
                  <span className="font-semibold text-foreground">
                    of KES {Number(campaign.target_amount).toLocaleString()}
                  </span>
                </div>
                <Progress value={Math.min(progress, 100)} className="h-3" />
                <div className="text-sm text-muted-foreground">
                  {progress.toFixed(1)}% funded
                </div>
                {isCreator && Number(campaign.current_amount) !== allTimeCollected && (
                  <div className="text-xs text-muted-foreground">
                    Available balance: KES {Number(campaign.current_amount).toLocaleString()}
                  </div>
                )}
                
                {/* Unique ID for offline payments */}
                {campaign.paybill_account_id && (
                  <CopyableUniqueId uniqueId={campaign.paybill_account_id} className="mt-4" />
                )}
              </div>
            </CardContent>
          </Card>

          {/* Tabs for Campaign Details vs Withdrawals */}
          <Tabs defaultValue="details">
            <TabsList>
              <TabsTrigger value="details">Campaign</TabsTrigger>
              <TabsTrigger value="withdrawals">Withdrawals</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="space-y-6">
              {/* Commission Display */}
              <CommissionDisplay 
                totalCollected={allTimeCollected}
                commissionRate={0.07}
                type="mchango"
                showBreakdown={true}
                availableBalance={Number(campaign.available_balance || campaign.current_amount || 0)}
                actualCommission={Number(campaign.total_commission_paid || 0)}
              />

              {/* Extend Campaign Days - Only for creators */}
              {isCreator && (
                <ExtendCampaignDays
                  campaignId={campaign.id}
                  currentEndDate={campaign.end_date}
                  onSuccess={fetchCampaign}
                />
              )}

              {/* Withdrawal Button - Only for creators */}
              {isCreator && (
                <WithdrawalButton
                  mchangoId={campaign.id}
                  totalAvailable={Number(campaign.available_balance || campaign.current_amount || 0)}
                  commissionRate={0.07}
                  onSuccess={fetchCampaign}
                />
              )}

              {/* Two Column Layout: Donate Form & Contributors - Hide if expired */}
              {!isExpired && (
                <div className="grid md:grid-cols-2 gap-6">
                  <DonationForm 
                    mchangoId={campaign.id} 
                    mchangoTitle={campaign.title}
                    onSuccess={handleDonationSuccess}
                  />
                
                  <DonorsList 
                    mchangoId={campaign.id} 
                    totalAmount={campaign.current_amount}
                    targetAmount={campaign.target_amount}
                    mchangoTitle={campaign.title}
                  />
                </div>
              )}

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
            </TabsContent>

            <TabsContent value="withdrawals" className="space-y-6">
              {/* Withdrawal Button - Also available here for creators */}
              {isCreator && (
                <WithdrawalButton
                  mchangoId={campaign.id}
                  totalAvailable={Number(campaign.available_balance || campaign.current_amount || 0)}
                  commissionRate={0.07}
                  onSuccess={fetchCampaign}
                />
              )}
              <WithdrawalHistory mchangoId={campaign.id} />
            </TabsContent>
          </Tabs>
        </div>
    </Layout>
  );
};

export default MchangoDetail;
