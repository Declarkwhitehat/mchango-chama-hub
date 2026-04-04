import { useState, useEffect } from "react";
import { formatDate } from "@/lib/utils";
import { useParams, useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, MapPin, Globe, Phone, Mail, Loader2, Calendar, MessageCircle } from "lucide-react";
import { ShareMenu } from "@/components/ShareMenu";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { VerificationRequestButton } from "@/components/VerificationRequestButton";
import { CopyableUniqueId } from "@/components/CopyableUniqueId";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { OrganizationDonationForm } from "@/components/OrganizationDonationForm";
import { OrganizationDonorsList } from "@/components/OrganizationDonorsList";
import { CommissionDisplay } from "@/components/CommissionDisplay";
import { WithdrawalButton } from "@/components/WithdrawalButton";
import { WithdrawalHistory } from "@/components/WithdrawalHistory";
import { useAuth } from "@/contexts/AuthContext";
import { GroupDocuments } from "@/components/GroupDocuments";

interface Organization {
  id: string;
  name: string;
  slug: string;
  description: string;
  about: string;
  category: string;
  logo_url?: string;
  cover_image_url?: string;
  website_url?: string;
  phone?: string;
  email?: string;
  location?: string;
  whatsapp_link?: string;
  youtube_url?: string;
  current_amount: number;
  available_balance: number;
  total_gross_collected: number;
  total_commission_paid: number;
  is_verified: boolean;
  is_public: boolean;
  status: string;
  created_at: string;
  created_by: string;
  group_code?: string;
  paybill_account_id?: string;
}

const getYoutubeEmbedUrl = (url: string): string => {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  const videoId = match && match[2].length === 11 ? match[2] : null;
  return videoId ? `https://www.youtube.com/embed/${videoId}` : '';
};

const OrganizationDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [isCreator, setIsCreator] = useState(false);

  useEffect(() => {
    fetchOrganization();
  }, [id]);

  const fetchOrganization = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('organizations')
        .select('id, name, slug, description, about, category, current_amount, location, logo_url, cover_image_url, is_verified, is_public, created_by, email, phone, website_url, youtube_url, whatsapp_link, paybill_account_id, group_code, available_balance, total_gross_collected, total_commission_paid, status, created_at')
        .eq('slug', id)
        .eq('is_public', true)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        toast.error("Organization not found");
        navigate("/organizations");
        return;
      }

      setOrganization(data);
      setIsCreator(user?.id === data.created_by);
    } catch (error: any) {
      console.error('Error fetching organization:', error);
      toast.error("Failed to load organization");
      navigate("/organizations");
    } finally {
      setLoading(false);
    }
  };

  const handleDonationSuccess = () => {
    fetchOrganization();
  };

  const shareUrl = `${import.meta.env.VITE_APP_URL || window.location.origin}/organizations/${organization?.slug}`;

  if (loading) {
    return (
      <Layout showBackButton>
        <div className="container px-4 py-6 max-w-4xl mx-auto flex justify-center items-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!organization) {
    return null;
  }

  return (
    <Layout showBackButton>
      <div className="container px-4 py-6 max-w-6xl mx-auto space-y-6">
        {/* Hero Section */}
        <Card className="overflow-hidden">
          {organization.cover_image_url && (
            <div className="h-48 md:h-64 overflow-hidden">
              <img 
                src={organization.cover_image_url} 
                alt={organization.name}
                className="w-full h-full object-cover"
              />
            </div>
          )}
          
          <CardHeader className="relative">
            <div className="flex flex-col md:flex-row md:items-start gap-4">
              {/* Logo */}
              <div className={`${organization.cover_image_url ? '-mt-16 md:-mt-20' : ''} relative z-10`}>
                {organization.logo_url ? (
                  <img 
                    src={organization.logo_url} 
                    alt={organization.name}
                    className="w-24 h-24 md:w-32 md:h-32 rounded-2xl object-cover border-4 border-background shadow-lg bg-background"
                  />
                ) : (
                  <div className="w-24 h-24 md:w-32 md:h-32 rounded-2xl bg-primary/10 border-4 border-background shadow-lg flex items-center justify-center">
                    <Building2 className="h-12 w-12 text-primary" />
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <CardTitle className="text-2xl md:text-3xl">{organization.name}</CardTitle>
                  {organization.is_verified && (
                    <VerifiedBadge size="lg" />
                  )}
                  <VerificationRequestButton
                    entityType="organization"
                    entityId={organization.id}
                    entityName={organization.name}
                    isVerified={organization.is_verified}
                    isOwner={isCreator}
                  />
                </div>
                
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary" className="text-sm">
                    {organization.category}
                  </Badge>
                  {organization.location && (
                    <Badge variant="outline" className="gap-1">
                      <MapPin className="h-3 w-3" />
                      {organization.location}
                    </Badge>
                  )}
                </div>

                <CardDescription className="text-base">
                  {organization.description}
                </CardDescription>

                <div className="flex items-center gap-2 pt-2">
                  <ShareMenu url={shareUrl} title={organization?.name || "Organization"} text={`Support ${organization?.name} on Pamoja Nova`} />
                  {organization.website_url && (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => window.open(organization.website_url, '_blank')}
                    >
                      <Globe className="h-4 w-4 mr-1" />
                      Website
                    </Button>
                  )}
                  {organization.whatsapp_link && (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => window.open(organization.whatsapp_link, '_blank')}
                    >
                      <MessageCircle className="h-4 w-4 mr-1" />
                      WhatsApp
                    </Button>
                  )}
                </div>
              </div>

              {/* Stats */}
              <div className="text-center p-6 bg-primary/5 rounded-xl border">
                <p className="text-sm text-muted-foreground mb-1">All-Time Collected</p>
                <p className="text-3xl font-bold text-primary">
                  KES {Number(organization.total_gross_collected || 0).toLocaleString()}
                </p>
                {isCreator && Number(organization.available_balance || 0) !== Number(organization.total_gross_collected || 0) && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Available: KES {Number(organization.available_balance || 0).toLocaleString()}
                  </p>
                )}
                {organization.paybill_account_id && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <CopyableUniqueId uniqueId={organization.paybill_account_id} className="p-0 bg-transparent border-0" />
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-2">
                  Since {formatDate(organization.created_at)}
                </p>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Contact Info */}
        {(organization.phone || organization.email) && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-wrap gap-4">
                {organization.phone && (
                  <a 
                    href={`tel:${organization.phone}`}
                    className="flex items-center gap-2 text-sm hover:text-primary transition-colors"
                  >
                    <Phone className="h-4 w-4" />
                    {organization.phone}
                  </a>
                )}
                {organization.email && (
                  <a 
                    href={`mailto:${organization.email}`}
                    className="flex items-center gap-2 text-sm hover:text-primary transition-colors"
                  >
                    <Mail className="h-4 w-4" />
                    {organization.email}
                  </a>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tabs for About/Donate/Donors */}
        <Tabs defaultValue="about" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="about">About</TabsTrigger>
            <TabsTrigger value="donate">Donate</TabsTrigger>
            <TabsTrigger value="donors">Donors</TabsTrigger>
            <TabsTrigger value="documents">Docs</TabsTrigger>
          </TabsList>

          <TabsContent value="about" className="space-y-4">
            {/* About Section */}
            {organization.about && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-xl">About {organization.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-foreground leading-relaxed whitespace-pre-wrap">
                    {organization.about}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* YouTube Video */}
            {organization.youtube_url && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Video</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="aspect-video rounded-lg overflow-hidden">
                    <iframe
                      src={getYoutubeEmbedUrl(organization.youtube_url)}
                      title="Organization Video"
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Commission Display */}
            <CommissionDisplay 
              totalCollected={Number(organization.total_gross_collected || 0)}
              commissionRate={0.05}
              type="organization"
              showBreakdown={true}
              availableBalance={Number(organization.available_balance || organization.current_amount || 0)}
              actualCommission={Number(organization.total_commission_paid || 0)}
            />

            {/* Withdrawal Button - Only for creators */}
            {isCreator && (
              <WithdrawalButton
                organizationId={organization.id}
                totalAvailable={organization.available_balance || 0}
                commissionRate={0.05}
                onSuccess={fetchOrganization}
              />
            )}

            {/* Withdrawal History */}
            <WithdrawalHistory organizationId={organization.id} />
          </TabsContent>

          <TabsContent value="donate">
            <OrganizationDonationForm 
              organizationId={organization.id} 
              organizationName={organization.name}
              onSuccess={handleDonationSuccess}
            />
          </TabsContent>

          <TabsContent value="donors">
            <OrganizationDonorsList 
              organizationId={organization.id} 
              totalAmount={Number(organization.total_gross_collected || 0)}
              organizationName={organization.name}
            />
          </TabsContent>

          <TabsContent value="documents">
            <GroupDocuments
              entityType="organization"
              entityId={organization.id}
              canUpload={isCreator}
            />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default OrganizationDetail;
