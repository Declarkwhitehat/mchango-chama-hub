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
import { toast } from "@/hooks/use-toast";
import { AlertCircle, CheckCircle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { sendTransactionalSMS, SMS_TEMPLATES } from "@/utils/smsService";

const DAY_OPTIONS = Array.from({ length: 28 }, (_, i) => i + 1);

const getOrdinalSuffix = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

const ChamaCreate = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [kycStatus, setKycStatus] = useState<string | null>(null);
  const [frequency, setFrequency] = useState<string>("monthly");
  const [showEveryNDays, setShowEveryNDays] = useState(false);
  const [monthlyDay, setMonthlyDay] = useState<string>("");
  const [monthlyDay2, setMonthlyDay2] = useState<string>("");
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

  const handleFrequencyChange = (value: string) => {
    setFrequency(value);
    setShowEveryNDays(value === "every_n_days");
    if (value !== "monthly" && value !== "twice_monthly") {
      setMonthlyDay("");
      setMonthlyDay2("");
    }
  };

  const handleSubmitInner = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Ensure session is valid before submitting
      const { data: { session } } = await supabase.auth.getSession();
      const { data: userCheck } = await supabase.auth.getUser();
      if (!session?.access_token || !userCheck?.user) {
        toast({
          title: "Session expired",
          description: "Please log in again",
          variant: "destructive",
        });
        await supabase.auth.signOut();
        navigate("/auth");
        return;
      }
      const form = formRef.current;
      if (!form) {
        throw new Error("Form not found");
      }
      const formData = new FormData(form);

      const chamaData: Record<string, any> = {
        name: formData.get("name") as string,
        description: formData.get("description") as string,
        contribution_amount: Number(formData.get("contribution_amount")),
        contribution_frequency: frequency,
        every_n_days_count: frequency === "every_n_days" ? Number(formData.get("every_n_days_count")) : null,
        min_members: Number(formData.get("min_members")) || 2,
        max_members: Number(formData.get("max_members")),
        is_public: formData.get("is_public") === "true",
        whatsapp_link: formData.get("whatsapp_link") as string || null,
      };

      // Add monthly day selections
      if (frequency === "monthly" && monthlyDay) {
        chamaData.monthly_contribution_day = Number(monthlyDay);
      }
      if (frequency === "twice_monthly") {
        if (!monthlyDay || !monthlyDay2) {
          toast({ title: "Error", description: "Please select both contribution days for twice monthly", variant: "destructive" });
          setIsLoading(false);
          return;
        }
        if (monthlyDay === monthlyDay2) {
          toast({ title: "Error", description: "The two contribution days must be different", variant: "destructive" });
          setIsLoading(false);
          return;
        }
        chamaData.monthly_contribution_day = Math.min(Number(monthlyDay), Number(monthlyDay2));
        chamaData.monthly_contribution_day_2 = Math.max(Number(monthlyDay), Number(monthlyDay2));
      }

      const res = await supabase.functions.invoke("chama-crud", {
        body: chamaData,
      });

      if (res.error) {
        console.error("Chama create invoke error:", res.error, res.data);
        const apiError = res.error.message || "Failed to create chama";
        throw new Error(apiError);
      }

      // Check for non-2xx status codes in the response data
      if (!res.data || typeof res.data === 'object' && 'error' in res.data) {
        console.error("Chama create API error:", res.data);
        const apiError = (res.data as any)?.error || (res.data as any)?.message || "Failed to create chama";
        throw new Error(apiError);
      }

      const created = (res.data as any)?.data;
      if (!created?.slug) {
        console.error("Unexpected response from chama-crud:", res.data);
        throw new Error("Unexpected response from server");
      }

      // Get user's profile to send SMS
      const { data: profile } = await supabase
        .from('profiles')
        .select('phone')
        .eq('id', userCheck.user.id)
        .single();

      // Send SMS notification
      if (profile?.phone) {
        await sendTransactionalSMS(
          profile.phone,
          SMS_TEMPLATES.chamaCreated(chamaData.name),
          'chama_created'
        );
      }

      toast({
        title: "Success!",
        description: "Chama created successfully",
      });
      // Notify dashboard to refresh lists
      window.dispatchEvent(new CustomEvent('chama:created', { detail: created }));
      
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
  }, [frequency, monthlyDay, monthlyDay2, navigate, toast]);

  const { execute: handleSubmit, isProcessing } = useDebounceAction(handleSubmitInner);

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
              <strong>You must complete verification before creating a Chama.</strong>
              <br />
              Only KYC-approved users can create chamas.{" "}
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
            <CardTitle>Start a Chama Group</CardTitle>
            <CardDescription>
              Create a chama to save and grow wealth together. Commission: 5% on total pool before payout.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
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
                      <SelectItem value="twice_monthly">Twice a Month</SelectItem>
                      <SelectItem value="every_n_days">Every N Days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {frequency === "monthly" && (
                <div className="space-y-2">
                  <Label htmlFor="monthly_day">Contribution Day of Month *</Label>
                  <Select
                    value={monthlyDay}
                    onValueChange={setMonthlyDay}
                    disabled={kycStatus !== "approved"}
                  >
                    <SelectTrigger id="monthly_day">
                      <SelectValue placeholder="Select day" />
                    </SelectTrigger>
                    <SelectContent>
                      {DAY_OPTIONS.map(day => (
                        <SelectItem key={day} value={String(day)}>
                          {getOrdinalSuffix(day)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Days 1–28 only to avoid issues with shorter months
                  </p>
                </div>
              )}

              {frequency === "twice_monthly" && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="monthly_day_1">First Contribution Day *</Label>
                    <Select
                      value={monthlyDay}
                      onValueChange={setMonthlyDay}
                      disabled={kycStatus !== "approved"}
                    >
                      <SelectTrigger id="monthly_day_1">
                        <SelectValue placeholder="Select day" />
                      </SelectTrigger>
                      <SelectContent>
                        {DAY_OPTIONS.map(day => (
                          <SelectItem key={day} value={String(day)}>
                            {getOrdinalSuffix(day)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="monthly_day_2">Second Contribution Day *</Label>
                    <Select
                      value={monthlyDay2}
                      onValueChange={setMonthlyDay2}
                      disabled={kycStatus !== "approved"}
                    >
                      <SelectTrigger id="monthly_day_2">
                        <SelectValue placeholder="Select day" />
                      </SelectTrigger>
                      <SelectContent>
                        {DAY_OPTIONS.filter(d => String(d) !== monthlyDay).map(day => (
                          <SelectItem key={day} value={String(day)}>
                            {getOrdinalSuffix(day)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-xs text-muted-foreground col-span-2">
                    Pick two different days (1–28) for contributions each month
                  </p>
                </div>
              )}

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
                    placeholder="2"
                    defaultValue="2"
                    min="2"
                    disabled={kycStatus !== "approved"}
                  />
                  <p className="text-xs text-muted-foreground">Minimum 2 members</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="max_members">Max Members *</Label>
                  <Input
                    id="max_members"
                    name="max_members"
                    type="number"
                    placeholder="20"
                    min="2"
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
                  disabled={isLoading || isProcessing || kycStatus !== "approved"}
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
      
