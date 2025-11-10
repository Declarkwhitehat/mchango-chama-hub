import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/Layout";
import { ArrowLeft, Loader2 } from "lucide-react";

export default function SavingsGroupCreate() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    saving_goal: "",
    max_members: "100",
    whatsapp_link: "",
    whatsapp_group_link: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    try {
      // Generate slug from name
      const slug = formData.name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-");

      const { data, error } = await supabase.from("saving_groups").insert({
        name: formData.name,
        slug,
        description: formData.description,
        saving_goal: parseFloat(formData.saving_goal),
        max_members: parseInt(formData.max_members),
        whatsapp_link: formData.whatsapp_link || null,
        whatsapp_group_link: formData.whatsapp_group_link || null,
        created_by: user.id,
        manager_id: user.id,
        status: "active",
        cycle_start_date: new Date().toISOString(),
        cycle_end_date: new Date(
          new Date().setMonth(new Date().getMonth() + 6)
        ).toISOString(),
      }).select().single();

      if (error) throw error;

      // Add creator as first member
      await supabase.from("saving_group_members").insert({
        group_id: data.id,
        user_id: user.id,
        status: "active",
      });

      toast({
        title: "Success!",
        description: "Savings group created successfully",
      });

      navigate(`/savings-group/${data.id}`);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <Button
          variant="ghost"
          onClick={() => navigate("/savings-group")}
          className="mb-6"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Groups
        </Button>

        <Card className="p-6 sm:p-8">
          <h1 className="text-2xl sm:text-3xl font-bold mb-2">
            Create Savings Group
          </h1>
          <p className="text-muted-foreground mb-6">
            Set up your savings group and invite members to join
          </p>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <Label htmlFor="name">Group Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="e.g., Tech Savers 2025"
                required
              />
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="Describe the purpose of your savings group"
                rows={4}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="saving_goal">Saving Goal (KES) *</Label>
                <Input
                  id="saving_goal"
                  type="number"
                  value={formData.saving_goal}
                  onChange={(e) =>
                    setFormData({ ...formData, saving_goal: e.target.value })
                  }
                  placeholder="100000"
                  min="1000"
                  step="1000"
                  required
                />
              </div>

              <div>
                <Label htmlFor="max_members">Max Members *</Label>
                <Input
                  id="max_members"
                  type="number"
                  value={formData.max_members}
                  onChange={(e) =>
                    setFormData({ ...formData, max_members: e.target.value })
                  }
                  placeholder="100"
                  min="5"
                  max="500"
                  required
                />
              </div>
            </div>

            <div>
              <Label htmlFor="whatsapp_link">WhatsApp Contact (Optional)</Label>
              <Input
                id="whatsapp_link"
                type="url"
                value={formData.whatsapp_link}
                onChange={(e) =>
                  setFormData({ ...formData, whatsapp_link: e.target.value })
                }
                placeholder="https://wa.me/254..."
              />
            </div>

            <div>
              <Label htmlFor="whatsapp_group_link">
                WhatsApp Group Link (Optional)
              </Label>
              <Input
                id="whatsapp_group_link"
                type="url"
                value={formData.whatsapp_group_link}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    whatsapp_group_link: e.target.value,
                  })
                }
                placeholder="https://chat.whatsapp.com/..."
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/savings-group")}
                className="w-full sm:w-auto"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading}
                className="w-full sm:flex-1"
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Group
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </Layout>
  );
}
