import { useState, useEffect, useRef, useCallback } from "react";
import { useDebounceAction } from "@/hooks/useDebounceAction";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AlertCircle, CheckCircle, X, Youtube, ImagePlus, Building2, Globe, MapPin, Phone, Mail } from "lucide-react";

const OrganizationCreate = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [kycStatus, setKycStatus] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState("");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const checkKycStatus = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("kyc_status")
        .eq("id", user.id)
        .single();

      setKycStatus(profile?.kyc_status || null);
    };

    checkKycStatus();
  }, [navigate]);

  const handleImageChange = (type: 'logo' | 'cover') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error("Please upload an image file");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image size must be less than 5MB");
      return;
    }

    if (type === 'logo') {
      setLogoFile(file);
      setLogoPreview(URL.createObjectURL(file));
    } else {
      setCoverFile(file);
      setCoverPreview(URL.createObjectURL(file));
    }
  };

  const removeImage = (type: 'logo' | 'cover') => {
    if (type === 'logo') {
      setLogoFile(null);
      setLogoPreview("");
    } else {
      setCoverFile(null);
      setCoverPreview("");
    }
  };

  const validateYoutubeUrl = (url: string): boolean => {
    if (!url) return true;
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|embed\/)|youtu\.be\/)[\w-]+/;
    return youtubeRegex.test(url);
  };

  const generateSlug = (name: string): string => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  };

  const handleSubmitInner = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (youtubeUrl && !validateYoutubeUrl(youtubeUrl)) {
        toast.error("Please enter a valid YouTube URL");
        setIsLoading(false);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      const { data: userCheck } = await supabase.auth.getUser();
      if (!session?.access_token || !userCheck?.user) {
        toast.error("Session expired. Please log in again");
        await supabase.auth.signOut();
        navigate("/auth");
        return;
      }

      // Upload images
      let logoUrl = null;
      let coverUrl = null;

      if (logoFile) {
        const fileExt = logoFile.name.split('.').pop();
        const fileName = `${userCheck.user.id}/org-logo-${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('campaign-images')
          .upload(fileName, logoFile);

        if (uploadError) throw new Error("Failed to upload logo");

        const { data: urlData } = supabase.storage
          .from('campaign-images')
          .getPublicUrl(fileName);

        logoUrl = urlData.publicUrl;
      }

      if (coverFile) {
        const fileExt = coverFile.name.split('.').pop();
        const fileName = `${userCheck.user.id}/org-cover-${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('campaign-images')
          .upload(fileName, coverFile);

        if (uploadError) throw new Error("Failed to upload cover image");

        const { data: urlData } = supabase.storage
          .from('campaign-images')
          .getPublicUrl(fileName);

        coverUrl = urlData.publicUrl;
      }

      const form = formRef.current;
      if (!form) throw new Error("Form not found");
      
      const formData = new FormData(form);
      const name = formData.get("name") as string;
      const baseSlug = generateSlug(name);
      const slug = `${baseSlug}-${Date.now().toString(36)}`;
      
      // Generate unique paybill account ID for M-PESA payments
      const generatePaybillAccountId = () => {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 6; i++) {
          code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return `ORG-${code}`;
      };

      // Check for duplicate organization name
      const { data: existingOrg } = await supabase
        .from('organizations')
        .select('id')
        .ilike('name', name.trim())
        .maybeSingle();

      if (existingOrg) {
        toast.error("An organization with this name already exists. Please choose a different name.");
        setIsLoading(false);
        return;
      }

      const organizationData = {
        name,
        slug,
        description: formData.get("description") as string,
        about: formData.get("about") as string,
        category: formData.get("category") as string,
        logo_url: logoUrl,
        cover_image_url: coverUrl,
        website_url: formData.get("website") as string || null,
        phone: formData.get("phone") as string || null,
        email: formData.get("email") as string || null,
        location: formData.get("location") as string || null,
        whatsapp_link: formData.get("whatsapp") as string || null,
        youtube_url: youtubeUrl || null,
        created_by: userCheck.user.id,
        paybill_account_id: generatePaybillAccountId(),
      };

      const { data, error } = await supabase
        .from('organizations')
        .insert(organizationData)
        .select()
        .single();

      if (error) throw error;

      toast.success("Organization registered successfully!");
      navigate(`/organizations/${data.slug}`);
    } catch (error: any) {
      console.error("Error creating organization:", error);
      toast.error(error.message || "Failed to register organization");
    } finally {
      setIsLoading(false);
    }
  }, [youtubeUrl, logoFile, coverFile, navigate]);

  const { execute: handleSubmit, isProcessing } = useDebounceAction(handleSubmitInner);

  if (kycStatus === null) {
    return (
      <Layout showBackButton title="Register Organization">
        <div className="container px-4 py-6 max-w-2xl mx-auto">
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-muted-foreground">Loading...</p>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout showBackButton title="Register Organization">
      <div className="container px-4 py-6 max-w-2xl mx-auto">
        {kycStatus !== "approved" && (
          <Alert className="mb-4 border-warning bg-warning/10">
            <AlertCircle className="h-4 w-4 text-warning" />
            <AlertDescription>
              <strong>You must complete verification before registering an organization.</strong>
              <br />
              Only KYC-approved users can register organizations.{" "}
              <a href="/kyc-upload" className="underline font-medium">
                Complete KYC now
              </a>
            </AlertDescription>
          </Alert>
        )}

        {kycStatus === "approved" && (
          <Alert className="mb-4 border-success bg-success/10">
            <CheckCircle className="h-4 w-4 text-success" />
            <AlertDescription>
              Your KYC is approved. You can now register an organization.
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Building2 className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle>Register Your Organization</CardTitle>
                <CardDescription>
                  Create a profile for your church, school, orphanage, NGO or other organization
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
              {/* Basic Info */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Basic Information</h3>
                
                <div className="space-y-2">
                  <Label htmlFor="name">Organization Name *</Label>
                  <Input
                    id="name"
                    name="name"
                    placeholder="e.g., St. Mary's Catholic Church"
                    required
                    disabled={kycStatus !== "approved"}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="category">Organization Type *</Label>
                  <Input
                    id="category"
                    name="category"
                    placeholder="e.g., Church, School, Orphanage, NGO, Hospital"
                    required
                    disabled={kycStatus !== "approved"}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Short Description *</Label>
                  <Textarea
                    id="description"
                    name="description"
                    placeholder="Brief description of your organization (shown in listings)"
                    rows={2}
                    required
                    disabled={kycStatus !== "approved"}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="about">About (Full Story)</Label>
                  <Textarea
                    id="about"
                    name="about"
                    placeholder="Tell the full story of your organization - its history, mission, impact, and goals..."
                    rows={6}
                    disabled={kycStatus !== "approved"}
                  />
                </div>
              </div>

              {/* Images */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Images</h3>
                
                <div className="grid grid-cols-2 gap-4">
                  {/* Logo */}
                  <div className="space-y-2">
                    <Label>Logo</Label>
                    {logoPreview ? (
                      <div className="relative">
                        <img 
                          src={logoPreview} 
                          alt="Logo preview" 
                          className="w-full h-24 object-contain rounded-lg border"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeImage('logo')}
                          className="absolute top-1 right-1 h-6 w-6 p-0 bg-background/80"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center h-24 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary transition-colors">
                        <ImagePlus className="h-6 w-6 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground mt-1">Logo</span>
                        <Input
                          type="file"
                          accept="image/*"
                          onChange={handleImageChange('logo')}
                          disabled={kycStatus !== "approved"}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>

                  {/* Cover Image */}
                  <div className="space-y-2">
                    <Label>Cover Image</Label>
                    {coverPreview ? (
                      <div className="relative">
                        <img 
                          src={coverPreview} 
                          alt="Cover preview" 
                          className="w-full h-24 object-cover rounded-lg border"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeImage('cover')}
                          className="absolute top-1 right-1 h-6 w-6 p-0 bg-background/80"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center h-24 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary transition-colors">
                        <ImagePlus className="h-6 w-6 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground mt-1">Cover</span>
                        <Input
                          type="file"
                          accept="image/*"
                          onChange={handleImageChange('cover')}
                          disabled={kycStatus !== "approved"}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>
                </div>
              </div>

              {/* Contact Info */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Contact Information</h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="phone"
                        name="phone"
                        type="tel"
                        placeholder="+254..."
                        disabled={kycStatus !== "approved"}
                        className="pl-10"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        placeholder="info@organization.org"
                        disabled={kycStatus !== "approved"}
                        className="pl-10"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="location">Location</Label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="location"
                      name="location"
                      placeholder="e.g., Nairobi, Kenya"
                      disabled={kycStatus !== "approved"}
                      className="pl-10"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="website">Website</Label>
                  <div className="relative">
                    <Globe className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="website"
                      name="website"
                      type="url"
                      placeholder="https://..."
                      disabled={kycStatus !== "approved"}
                      className="pl-10"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="whatsapp">WhatsApp Group Link</Label>
                  <Input
                    id="whatsapp"
                    name="whatsapp"
                    type="url"
                    placeholder="https://chat.whatsapp.com/..."
                    disabled={kycStatus !== "approved"}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="youtube">YouTube Video (optional)</Label>
                  <div className="relative">
                    <Youtube className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="youtube"
                      name="youtube"
                      type="url"
                      value={youtubeUrl}
                      onChange={(e) => setYoutubeUrl(e.target.value)}
                      placeholder="https://youtube.com/watch?v=..."
                      disabled={kycStatus !== "approved"}
                      className="pl-10"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Add a video to introduce your organization
                  </p>
                </div>
              </div>

              <div className="pt-4">
                <Button
                  type="submit"
                  variant="default"
                  className="w-full"
                  disabled={isLoading || isProcessing || kycStatus !== "approved"}
                >
                  {isLoading ? "Registering..." : "Register Organization"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default OrganizationCreate;
