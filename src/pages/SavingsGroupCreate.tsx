import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/Layout";
import { ArrowLeft, Loader2, Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

// Validation schema
const savingsGroupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, "Name must be at least 3 characters")
    .max(100, "Name must be less than 100 characters")
    .regex(/^[a-zA-Z0-9\s-]+$/, "Name can only contain letters, numbers, spaces, and hyphens"),
  description: z
    .string()
    .trim()
    .max(500, "Description must be less than 500 characters")
    .optional(),
  saving_goal: z
    .number()
    .min(1000, "Saving goal must be at least KES 1,000")
    .max(100000000, "Saving goal must be less than KES 100,000,000"),
  max_members: z
    .number()
    .int("Max members must be a whole number")
    .min(5, "Minimum 5 members required")
    .max(500, "Maximum 500 members allowed"),
  whatsapp_link: z
    .string()
    .trim()
    .url("Must be a valid URL")
    .regex(/^https:\/\/(wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com)\//, "Must be a valid WhatsApp link")
    .max(255, "URL too long")
    .optional()
    .or(z.literal("")),
  period_months: z
    .number()
    .int("Period must be a whole number")
    .min(6, "Minimum period is 6 months")
    .max(24, "Maximum period is 24 months"),
});

type SavingsGroupFormData = z.infer<typeof savingsGroupSchema>;

export default function SavingsGroupCreate() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const form = useForm<SavingsGroupFormData>({
    resolver: zodResolver(savingsGroupSchema),
    defaultValues: {
      name: "",
      description: "",
      saving_goal: 10000,
      max_members: 100,
      whatsapp_link: "",
      period_months: 6,
    },
  });

  const onSubmit = async (data: SavingsGroupFormData) => {
    if (!user) {
      toast({
        title: "Authentication required",
        description: "Please log in to create a savings group",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error("Please log in to continue");
      }

      // Call backend API
      const { data: response, error } = await supabase.functions.invoke('savings-group-crud', {
        method: 'POST',
        body: {
          name: data.name,
          description: data.description || null,
          saving_goal: data.saving_goal,
          max_members: data.max_members,
          whatsapp_link: data.whatsapp_link || null,
          period_months: data.period_months,
        },
      });

      if (error) {
        const errorMessage = error?.message || response?.error?.message || response?.error?.error || "Failed to create savings group";
        throw new Error(errorMessage);
      }

      if (!response?.success || !response?.group) {
        throw new Error("Failed to create savings group");
      }

      toast({
        title: "Success!",
        description: "Savings group created successfully",
      });

      navigate(`/savings-groups/${response.group.id}`);
    } catch (error: any) {
      console.error("Error creating group:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create savings group",
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
          <div className="mb-6">
            <h1 className="text-2xl sm:text-3xl font-bold mb-2">
              Create Savings Group
            </h1>
            <p className="text-muted-foreground">
              Set up your savings group and invite members to join
            </p>
          </div>

          <Alert className="mb-6">
            <Info className="h-4 w-4" />
            <AlertDescription>
              <strong>Important:</strong> You'll be automatically added as the first member and manager. 
              Minimum 5 members required to start the group.
            </AlertDescription>
          </Alert>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Group Name *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., Tech Savers 2025"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Choose a unique name for your savings group
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Describe the purpose of your savings group..."
                        rows={4}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Optional: Help members understand the group's goals
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="saving_goal"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Saving Goal (KES) *</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="100000"
                          min="1000"
                          step="1000"
                          {...field}
                          onChange={(e) => field.onChange(parseFloat(e.target.value))}
                        />
                      </FormControl>
                      <FormDescription>
                        Minimum KES 1,000
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="max_members"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Max Members *</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="100"
                          min="5"
                          max="500"
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value))}
                        />
                      </FormControl>
                      <FormDescription>
                        Between 5 and 500
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="period_months"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Group Period (Months) *</FormLabel>
                    <FormControl>
                      <Select
                        value={field.value?.toString()}
                        onValueChange={(value) => field.onChange(parseInt(value))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select period" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="6">6 months</SelectItem>
                          <SelectItem value="9">9 months</SelectItem>
                          <SelectItem value="12">12 months</SelectItem>
                          <SelectItem value="15">15 months</SelectItem>
                          <SelectItem value="18">18 months</SelectItem>
                          <SelectItem value="21">21 months</SelectItem>
                          <SelectItem value="24">24 months</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormDescription>
                      Recommended: 6, 9, or 12 months
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="whatsapp_link"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>WhatsApp Group Link</FormLabel>
                    <FormControl>
                      <Input
                        type="url"
                        placeholder="https://chat.whatsapp.com/..."
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Optional: Share your WhatsApp group link for member communication
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex flex-col sm:flex-row gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate("/savings-group")}
                  disabled={loading}
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
                  Create Savings Group
                </Button>
              </div>
            </form>
          </Form>
        </Card>
      </div>
    </Layout>
  );
}
