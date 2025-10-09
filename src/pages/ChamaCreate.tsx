import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { AlertCircle, CheckCircle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ChamaCreate = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [kycStatus, setKycStatus] = useState<string | null>(null);
  const [frequency, setFrequency] = useState<string>("monthly");
  const [showEveryNDays, setShowEveryNDays] = useState(false);

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

  const handleFrequencyChange = (value: string) => {
    setFrequency(value);
    setShowEveryNDays(value === "every_n_days");
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const formData = new FormData(e.currentTarget);
      
      const chamaData = {
        name: formData.get("name") as string,
        description: formData.get("description") as string,
        contribution_amount: Number(formData.get("contribution_amount")),
        contribution_frequency: frequency,
        every_n_days_count: frequency === "every_n_days" ? Number(formData.get("every_n_days_count")) : null,
        min_members: Number(formData.get("min_members")) || 5,
        max_members: Number(formData.get("max_members")),
        is_public: formData.get("is_public") === "true",
        payout_order: formData.get("payout_order") as string || "join_date",
        whatsapp_link: formData.get("whatsapp_link") as string || null,
      };

      const res = await supabase.functions.invoke("chama-crud", {
        body: chamaData,
      });

      if (res.error) {
        console.error("Chama create invoke error:", res.error, res.data);
        const apiError = (res.data as any)?.error || (res.data as any)?.message;
        throw new Error(apiError || res.error.message || "Failed to create chama");
      }

      const created = (res.data as any)?.data;
      if (!created?.slug) {
        console.error("Unexpected response from chama-crud:", res.data);
        throw new Error("Unexpected response from server");
      }

      toast({
        title: "Success!",
        description: "Chama created successfully",
      });
      
      navigate(`/chama/${created.slug}`);
    } catch (error: any) {
      console.error("Error creating chama:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create chama",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (kycStatus === null) {
    return (
      <Layout showBackButton title="Create Chama">
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
    <Layout showBackButton title="Create Chama">
      <div className="container px-4 py-6 max-w-2xl mx-auto">
        {kycStatus !== "approved" && (
          <Alert className="mb-4 border-warning bg-warning/10">
            <AlertCircle className="h-4 w-4 text-warning" />
            <AlertDescription>
              You must complete KYC verification before creating a chama.{" "}
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
              Your KYC is approved. You can now create a chama.
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Start a Savings Group</CardTitle>
            <CardDescription>
              Create a chama to save and grow wealth together. Commission: 5% on total pool before payout.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name">Group Name *</Label>
                <Input
                  id="name"
                  name="name"
                  placeholder="e.g., Women Empowerment Group"
                  required
                  disabled={kycStatus !== "approved"}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description *</Label>
                <Textarea
                  id="description"
                  name="description"
                  placeholder="Describe the purpose and goals of your group..."
                  rows={4}
                  required
                  disabled={kycStatus !== "approved"}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="contribution_amount">Contribution Amount (KES) *</Label>
                  <Input
                    id="contribution_amount"
                    name="contribution_amount"
                    type="number"
                    placeholder="5000"
                    min="100"
                    required
                    disabled={kycStatus !== "approved"}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="contribution_frequency">Frequency *</Label>
                  <Select
                    value={frequency}
                    onValueChange={handleFrequencyChange}
                    disabled={kycStatus !== "approved"}
                  >
                    <SelectTrigger id="contribution_frequency">
                      <SelectValue placeholder="Select frequency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="every_n_days">Every N Days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {showEveryNDays && (
                <div className="space-y-2">
                  <Label htmlFor="every_n_days_count">Every N Days (Number) *</Label>
                  <Input
                    id="every_n_days_count"
                    name="every_n_days_count"
                    type="number"
                    placeholder="e.g., 7 for weekly, 14 for bi-weekly"
                    min="1"
                    required={showEveryNDays}
                    disabled={kycStatus !== "approved"}
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="min_members">Min Members</Label>
                  <Input
                    id="min_members"
                    name="min_members"
                    type="number"
                    placeholder="5"
                    defaultValue="5"
                    min="5"
                    disabled={kycStatus !== "approved"}
                  />
                  <p className="text-xs text-muted-foreground">Minimum 5 members</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="max_members">Max Members *</Label>
                  <Input
                    id="max_members"
                    name="max_members"
                    type="number"
                    placeholder="20"
                    min="5"
                    max="100"
                    required
                    disabled={kycStatus !== "approved"}
                  />
                  <p className="text-xs text-muted-foreground">Maximum 100 members</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="is_public">Visibility *</Label>
                <Select
                  name="is_public"
                  defaultValue="true"
                  disabled={kycStatus !== "approved"}
                >
                  <SelectTrigger id="is_public">
                    <SelectValue placeholder="Select visibility" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Public (Listable)</SelectItem>
                    <SelectItem value="false">Private (Invite Only)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Public chamas are listable, but internal details remain private to members
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="payout_order">Payout Order *</Label>
                <Select
                  name="payout_order"
                  defaultValue="join_date"
                  disabled={kycStatus !== "approved"}
                >
                  <SelectTrigger id="payout_order">
                    <SelectValue placeholder="Select payout order" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="join_date">Auto by Join Date</SelectItem>
                    <SelectItem value="manager_override">Manager Override</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="whatsapp_link">WhatsApp Group Link (Optional)</Label>
                <Input
                  id="whatsapp_link"
                  name="whatsapp_link"
                  type="url"
                  placeholder="https://chat.whatsapp.com/..."
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
                  {isLoading ? "Creating..." : "Create Chama Group"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default ChamaCreate;
