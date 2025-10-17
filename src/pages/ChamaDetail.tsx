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
import { toast } from "@/hooks/use-toast";
import { AlertCircle, CheckCircle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ChamaCreate = () => {
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [contributionAmount, setContributionAmount] = useState<number | "">("");
  const [contributionFrequency, setContributionFrequency] = useState("monthly");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const formRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    // auto-generate slug from title
    const s = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "")
      .slice(0, 80);
    setSlug(s);
  }, [title]);

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);

      // Basic validation
      if (!title) {
        toast({ title: "Title required", description: "Please provide a title for the chama." });
        return;
      }

      const chamaData = {
        title,
        slug,
        description,
        category,
        contribution_amount: contributionAmount === "" ? null : Number(contributionAmount),
        contribution_frequency: contributionFrequency,
      };

      // Call server function to create chama and return the created record
      const res = await supabase.functions.invoke("chama-crud", {
        body: chamaData,
      });

      // Debug log
      console.log("chama-crud invoke response:", res);

      if (res.error) {
        console.error("Chama create invoke error:", res.error, res.data);
        const apiError = (res.data as any)?.error || (res.data as any)?.message || res.error.message;
        throw new Error(apiError || "Failed to create chama");
      }

      // Extract created record from res.data.data or res.data
      const created = (res.data as any)?.data ?? res.data;
      if (!created) {
        console.error("Chama create: no data returned from function:", res);
        throw new Error("Chama created but failed to return details.");
      }

      // Navigate to the created chama detail page (prefer slug then id)
      const destination = `/chama/${created.slug ?? created.id}`;
      navigate(destination);
      return created;
    } catch (err: any) {
      console.error("Error creating chama:", err);
      toast({
        title: "Chama creation failed",
        description: err.message || "Please try again later.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Layout showBackButton>
      <div className="container px-4 py-6 max-w-3xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Create a new Chama</CardTitle>
            <CardDescription>Set up your chama and invite members to join.</CardDescription>
          </CardHeader>
          <CardContent>
            <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Savings Group" />
              </div>

              <div>
                <Label>Slug (auto generated)</Label>
                <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="unique-slug" />
              </div>

              <div>
                <Label>Description</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe your chama" />
              </div>

              <div>
                <Label>Category</Label>
                <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Savings" />
              </div>

              <div>
                <Label>Contribution amount</Label>
                <Input
                  type="number"
                  value={contributionAmount === "" ? "" : contributionAmount}
                  onChange={(e) => setContributionAmount(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="Amount"
                />
              </div>

              <div>
                <Label>Contribution frequency</Label>
                <Select value={contributionFrequency} onValueChange={(val) => setContributionFrequency(val)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select frequency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Creating..." : "Create Chama"}
                </Button>
                <Button variant="ghost" onClick={() => navigate(-1)} type="button">
                  Cancel
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
