import { useState, useCallback } from "react";
import { useDebounceAction } from "@/hooks/useDebounceAction";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Shield, Loader2 } from "lucide-react";

const WelfareCreate = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [whatsappLink, setWhatsappLink] = useState("");
  const [minPeriod, setMinPeriod] = useState(3);

  const handleCreateInner = useCallback(async () => {
    if (!name.trim() || name.trim().length < 3) {
      toast.error("Name must be at least 3 characters");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('welfare-crud', {
        method: 'POST',
        body: {
          name: name.trim(),
          description: description.trim() || null,
          is_public: isPublic,
          whatsapp_link: whatsappLink.trim() || null,
          min_contribution_period_months: minPeriod,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success("Welfare group created! You are now the Chairman.");
      navigate(`/welfare/${data.data.id}`);
    } catch (error: any) {
      console.error('Error creating welfare:', error);
      toast.error(error.message || "Failed to create welfare group");
    } finally {
      setLoading(false);
    }
  }, [name, description, isPublic, whatsappLink, minPeriod, navigate]);

  const { execute: handleCreate, isProcessing } = useDebounceAction(handleCreateInner);

  return (
    <Layout>
      <div className="container px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            Create Welfare Group
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            As the creator, you will automatically become the Chairman of this welfare group.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Welfare Details</CardTitle>
            <CardDescription>Fill in the details for your welfare group</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Welfare Name *</Label>
              <Input
                id="name"
                placeholder="e.g., Family Support Welfare"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Describe the purpose of this welfare group..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="minPeriod">Min. Contribution Period (months before withdrawal eligibility)</Label>
              <Input
                id="minPeriod"
                type="number"
                min={1}
                max={24}
                value={minPeriod}
                onChange={(e) => setMinPeriod(Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">Members must contribute for this many months before being eligible to receive withdrawals</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="whatsapp">WhatsApp Group Link (optional)</Label>
              <Input
                id="whatsapp"
                placeholder="https://chat.whatsapp.com/..."
                value={whatsappLink}
                onChange={(e) => setWhatsappLink(e.target.value)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Public Welfare</Label>
                <p className="text-xs text-muted-foreground">Allow anyone to discover and join</p>
              </div>
              <Switch checked={isPublic} onCheckedChange={setIsPublic} />
            </div>

            <div className="bg-muted/50 p-4 rounded-lg space-y-2 text-sm">
              <p className="font-medium">What happens next:</p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>You become the <strong>Chairman</strong> automatically</li>
                <li>Assign a <strong>Secretary</strong> and <strong>Treasurer</strong> from members</li>
                <li>Secretary sets contribution amounts and cycles</li>
                <li>Withdrawals require approval from both Secretary & Treasurer</li>
                <li>5% commission on all contributions</li>
              </ul>
            </div>

            <Button
              onClick={handleCreate}
              disabled={loading || isProcessing || !name.trim()}
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Welfare Group"
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default WelfareCreate;
