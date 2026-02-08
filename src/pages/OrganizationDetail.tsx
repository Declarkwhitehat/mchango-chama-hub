import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, MapPin, Globe, Phone, Mail, Share2, Loader2, Calendar, MessageCircle } from "lucide-react";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { VerificationRequestButton } from "@/components/VerificationRequestButton";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { OrganizationDonationForm } from "@/components/OrganizationDonationForm";
import { OrganizationDonorsList } from "@/components/OrganizationDonorsList";
import { CommissionDisplay } from "@/components/CommissionDisplay";
import { WithdrawalButton } from "@/components/WithdrawalButton";
import { useAuth } from "@/contexts/AuthContext";

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
        .select('*')
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

  const handleShare = () => {
    const baseUrl = import.meta.env.VITE_APP_URL || window.location.origin;
    const shareUrl = `${baseUrl}/organizations/${organization?.slug}`;
    navigator.clipboard.writeText(shareUrl);
    toast.success("Link copied to clipboard!");
  };

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
                  <Button variant="outline" size="sm" onClick={handleShare}>
                    <Share2 className="h-4 w-4 mr-1" />
                    Share
                  </Button>
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
                <p className="text-sm text-muted-foreground mb-1">Available Balance</p>
                <p className="text-3xl font-bold text-primary">
                  KES {Number(organization.available_balance || 0).toLocaleString()}
                </p>
                {organization.paybill_account_id && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <p className="text-xs text-muted-foreground">Unique ID (for offline payments)</p>
                    <p className="text-lg font-mono font-semibold text-foreground">
                      {organization.paybill_account_id}
                    </p>
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-2">
                  Since {new Date(organization.created_at).toLocaleDateString('en-US', { 
                    month: 'long', 
                    year: 'numeric' 
                  })}
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
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="about">About</TabsTrigger>
            <TabsTrigger value="donate">Donate</TabsTrigger>
            <TabsTrigger value="donors">Donors</TabsTrigger>
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
              totalCollected={organization.current_amount}
              commissionRate={0.05}
              type="organization"
              showBreakdown={true}
            />

            {/* Withdrawal Button - Only for creators */}
            {isCreator && (
              <WithdrawalButton
                mchangoId={organization.id}
                totalAvailable={organization.available_balance || 0}
                commissionRate={0.05}
                onSuccess={fetchOrganization}
              />
            )}
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
              totalAmount={organization.available_balance || 0}
              organizationName={organization.name}
            />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default OrganizationDetail;
