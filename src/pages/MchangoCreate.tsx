import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

const MchangoCreate = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    // Simulate campaign creation
    setTimeout(() => {
      toast.success("Campaign created successfully!");
      navigate("/home");
      setIsLoading(false);
    }, 1000);
  };

  return (
    <Layout showBackButton title="Create Mchango">
      <div className="container px-4 py-6 max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Start a Fundraiser</CardTitle>
            <CardDescription>
              Create a campaign to raise funds for your cause
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="title">Campaign Title</Label>
                <Input
                  id="title"
                  placeholder="e.g., Medical Emergency Fund"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Tell your story and explain why you need support..."
                  rows={5}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="goal">Goal Amount (KES)</Label>
                  <Input
                    id="goal"
                    type="number"
                    placeholder="50000"
                    min="1000"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="duration">Duration (days)</Label>
                  <Input
                    id="duration"
                    type="number"
                    placeholder="30"
                    min="1"
                    max="90"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <select
                  id="category"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  required
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
                  type="url"
                  placeholder="https://example.com/image.jpg"
                />
              </div>

              <div className="pt-4">
                <Button
                  type="submit"
                  variant="hero"
                  className="w-full"
                  disabled={isLoading}
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
