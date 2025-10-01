import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

const ChamaCreate = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    // Simulate group creation
    setTimeout(() => {
      toast.success("Chama group created successfully!");
      navigate("/home");
      setIsLoading(false);
    }, 1000);
  };

  return (
    <Layout showBackButton title="Create Chama">
      <div className="container px-4 py-6 max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Start a Savings Group</CardTitle>
            <CardDescription>
              Create a chama to save and grow wealth together
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name">Group Name</Label>
                <Input
                  id="name"
                  placeholder="e.g., Women Empowerment Group"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Describe the purpose and goals of your group..."
                  rows={4}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="contribution">Monthly Contribution (KES)</Label>
                  <Input
                    id="contribution"
                    type="number"
                    placeholder="5000"
                    min="100"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="maxMembers">Max Members</Label>
                  <Input
                    id="maxMembers"
                    type="number"
                    placeholder="20"
                    min="2"
                    max="100"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="meetingDay">Meeting Day</Label>
                <select
                  id="meetingDay"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  required
                >
                  <option value="">Select a day</option>
                  <option value="monday">Monday</option>
                  <option value="tuesday">Tuesday</option>
                  <option value="wednesday">Wednesday</option>
                  <option value="thursday">Thursday</option>
                  <option value="friday">Friday</option>
                  <option value="saturday">Saturday</option>
                  <option value="sunday">Sunday</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <select
                  id="category"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  required
                >
                  <option value="">Select a category</option>
                  <option value="business">Business Investment</option>
                  <option value="education">Education</option>
                  <option value="housing">Housing</option>
                  <option value="general">General Savings</option>
                  <option value="emergency">Emergency Fund</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label>Group Rules (optional)</Label>
                <Textarea
                  id="rules"
                  placeholder="List any rules or guidelines for group members..."
                  rows={3}
                />
              </div>

              <div className="pt-4">
                <Button
                  type="submit"
                  variant="heroSecondary"
                  className="w-full"
                  disabled={isLoading}
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
