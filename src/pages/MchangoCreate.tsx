import { useState, useEffect, useRef } from "react";
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
import { AlertCircle, CheckCircle } from "lucide-react";

const MchangoCreate = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [kycStatus, setKycStatus] = useState<string | null>(null);
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

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Ensure session is valid before submitting
      const { data: { session } } = await supabase.auth.getSession();
      const { data: userCheck } = await supabase.auth.getUser();
      if (!session?.access_token || !userCheck?.user) {
        toast.error("Session expired. Please log in again");
        await supabase.auth.signOut();
        navigate("/auth");
        return;
      }
      const form = formRef.current;
      if (!form) {
        throw new Error("Form not found");
      }
      const formData = new FormData(form);
      
      const mchangoData = {
        title: formData.get("title") as string,
        description: formData.get("description") as string,
        target_amount: Number(formData.get("goal")),
        category: formData.get("category") as string,
        image_url: formData.get("image") as string || null,
        end_date: new Date(Date.now() + Number(formData.get("duration")) * 24 * 60 * 60 * 1000).toISOString(),
      };

      const res = await supabase.functions.invoke("mchango-crud", {
        body: mchangoData,
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (res.error) {
        console.error("Mchango create invoke error:", res.error, res.data);
        const apiError = (res.data as any)?.error || (res.data as any)?.message;
        throw new Error(apiError || res.error.message || "Failed to create campaign");
      }

      const created = (res.data as any)?.data;
      if (!created?.slug) {
        console.error("Unexpected response from mchango-crud:", res.data);
        throw new Error("Unexpected response from server");
      }

      // Notify dashboard to refresh lists
      window.dispatchEvent(new CustomEvent('mchango:created', { detail: created }));
      toast.success("Campaign created successfully!");
      navigate(`/mchango/${created.slug}`);
    } catch (error: any) {
      console.error("Error creating campaign:", error);
      toast.error(error.message || "Failed to create campaign");
    } finally {
      setIsLoading(false);
    }
  };

  if (kycStatus === null) {
    return (
      <Layout showBackButton title="Create Mchango">
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
    <Layout showBackButton title="Create Mchango">
      <div className="container px-4 py-6 max-w-2xl mx-auto">
        {kycStatus !== "approved" && (
          <Alert className="mb-4 border-warning bg-warning/10">
            <AlertCircle className="h-4 w-4 text-warning" />
            <AlertDescription>
              <strong>You must complete verification before creating a Mchango.</strong>
              <br />
              Only KYC-approved users can create fundraising campaigns.{" "}
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
              Your KYC is approved. You can now create a campaign.
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Start a Fundraiser</CardTitle>
            <CardDescription>
              Create a campaign to raise funds for your cause
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="title">Campaign Title</Label>
                <Input
                  id="title"
                  name="title"
                  placeholder="e.g., Medical Emergency Fund"
                  required
                  disabled={kycStatus !== "approved"}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  name="description"
                  placeholder="Tell your story and explain why you need support..."
                  rows={5}
                  required
                  disabled={kycStatus !== "approved"}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="goal">Goal Amount (KES)</Label>
                  <Input
                    id="goal"
                    name="goal"
                    type="number"
                    placeholder="50000"
                    min="1000"
                    required
                    disabled={kycStatus !== "approved"}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="duration">Duration (days)</Label>
                  <Input
                    id="duration"
                    name="duration"
                    type="number"
                    placeholder="30"
                    min="1"
                    max="90"
                    required
                    disabled={kycStatus !== "approved"}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <select
                  id="category"
                  name="category"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  required
                  disabled={kycStatus !== "approved"}
                >
                  <option value="">Select a category</option>
                  <option value="medical">Medical</option>
                  <option value="education">Education</option>
                  <option value="business">Business</option>
                  <option value="emergency">Emergency</option>
                  <option value="community">Community</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="image">Campaign Image URL (optional)</Label>
                <Input
                  id="image"
                  name="image"
                  type="url"
                  placeholder="https://example.com/image.jpg"
                  disabled={kycStatus !== "approved"}
                />
              </div>

              <div className="pt-4">
                <Button
                  type="submit"
                  variant="default"
                  className="w-full"
                  disabled={isLoading || kycStatus !== "approved"}
                >
                  {isLoading ? "Creating..." : "Create Campaign"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default MchangoCreate;
