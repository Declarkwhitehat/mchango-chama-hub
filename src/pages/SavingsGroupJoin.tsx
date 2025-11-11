import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Users, Search, CheckCircle2, AlertCircle, UserPlus } from "lucide-react";

const joinSchema = z.object({
  groupIdentifier: z.string()
    .min(3, "Group identifier must be at least 3 characters")
    .max(100, "Group identifier must be less than 100 characters"),
});

type JoinFormData = z.infer<typeof joinSchema>;

export default function SavingsGroupJoin() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [validatingCode, setValidatingCode] = useState(false);
  const [groupPreview, setGroupPreview] = useState<any>(null);
  const [joinStatus, setJoinStatus] = useState<'idle' | 'pending' | 'approved' | 'already_member'>('idle');
  const [inviteCode, setInviteCode] = useState<string | null>(null);

  const form = useForm<JoinFormData>({
    resolver: zodResolver(joinSchema),
    defaultValues: {
      groupIdentifier: "",
    },
  });

  // Auto-validate invite code from URL
  useEffect(() => {
    const code = searchParams.get('code');
    if (code) {
      setInviteCode(code);
      validateInviteCode(code);
    }
  }, [searchParams]);

  const validateInviteCode = async (code: string) => {
    setValidatingCode(true);
    setGroupPreview(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error("Please log in to continue");
      }

      const { data, error } = await supabase.functions.invoke(
        'savings-group-invite',
        {
          body: { path: `/validate/${code}` },
        }
      );

      if (error || !data?.valid) {
        throw new Error(data?.error || 'Invalid invite code');
      }

      const group = data.group;

      // Check if user is already a member
      const { data: existingMembership } = await supabase
        .from("saving_group_members")
        .select("id, status, is_approved")
        .eq("group_id", group.id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (existingMembership) {
        if (existingMembership.is_approved) {
          setJoinStatus('already_member');
        } else {
          setJoinStatus('pending');
        }
      }

      // Get member count
      const { count } = await supabase
        .from("saving_group_members")
        .select("*", { count: "exact", head: true })
        .eq("group_id", group.id)
        .eq("status", "active")
        .eq("is_approved", true);

      setGroupPreview({
        ...group,
        memberCount: count || 0,
        existingMembership,
      });

      toast({
        title: "Valid Invite Code",
        description: "You've been invited to join this group!",
      });
    } catch (error: any) {
      console.error("Error validating invite code:", error);
      toast({
        title: "Invalid Invite Code",
        description: error.message || "The invite code is invalid or expired",
        variant: "destructive",
      });
      setInviteCode(null);
    } finally {
      setValidatingCode(false);
    }
  };

  const searchGroup = async () => {
    const identifier = form.getValues("groupIdentifier").trim().toLowerCase();
    
    if (!identifier) {
      toast({
        title: "Error",
        description: "Please enter a group name or slug",
        variant: "destructive",
      });
      return;
    }

    setSearching(true);
    setGroupPreview(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error("Please log in to continue");
      }

      // Search by slug first
      let { data: group, error } = await supabase
        .from("saving_groups")
        .select(`
          *,
          saving_group_members!inner(id, user_id, status, is_approved)
        `)
        .eq("slug", identifier)
        .eq("status", "active")
        .single();

      // If not found by slug, search by name (case-insensitive partial match)
      if (error || !group) {
        const { data: groups, error: nameError } = await supabase
          .from("saving_groups")
          .select(`
            *,
            saving_group_members!inner(id, user_id, status, is_approved)
          `)
          .ilike("name", `%${identifier}%`)
          .eq("status", "active")
          .limit(1);

        if (nameError || !groups || groups.length === 0) {
          throw new Error("Savings group not found or not active");
        }

        group = groups[0];
      }

      // Check if user is already a member
      const { data: existingMembership } = await supabase
        .from("saving_group_members")
        .select("id, status, is_approved")
        .eq("group_id", group.id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (existingMembership) {
        if (existingMembership.is_approved) {
          setJoinStatus('already_member');
          toast({
            title: "Already a Member",
            description: "You are already a member of this group",
          });
        } else {
          setJoinStatus('pending');
          toast({
            title: "Pending Approval",
            description: "Your join request is awaiting manager approval",
          });
        }
      }

      // Get member count
      const { count } = await supabase
        .from("saving_group_members")
        .select("*", { count: "exact", head: true })
        .eq("group_id", group.id)
        .eq("status", "active")
        .eq("is_approved", true);

      setGroupPreview({
        ...group,
        memberCount: count || 0,
        existingMembership,
      });
    } catch (error: any) {
      console.error("Error searching group:", error);
      toast({
        title: "Search Failed",
        description: error.message || "Failed to find savings group",
        variant: "destructive",
      });
    } finally {
      setSearching(false);
    }
  };

  const joinGroup = async () => {
    if (!groupPreview) return;

    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error("Please log in to continue");
      }

      let result;

      if (inviteCode) {
        // Join via invite code
        const { data, error } = await supabase.functions.invoke(
          'savings-group-invite',
          {
            body: { path: `/join/${inviteCode}` },
          }
        );

        if (error || !data?.success) {
          throw new Error(data?.error || error?.message || "Failed to join group");
        }

        result = data;
      } else {
        // Regular join (existing logic)
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/savings-group-members/groups/${groupPreview.id}/join`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              "Content-Type": "application/json",
            },
          }
        );

        result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Failed to join group");
        }
      }

      setJoinStatus('pending');

      toast({
        title: "Join Request Submitted",
        description: "Your request is pending approval by the group manager. You'll be notified once approved.",
      });

      // Redirect to group detail page after 2 seconds
      setTimeout(() => {
        navigate(`/savings-groups/${groupPreview.id}`);
      }, 2000);
    } catch (error: any) {
      console.error("Error joining group:", error);
      toast({
        title: "Join Failed",
        description: error.message || "Failed to submit join request",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold mb-2">
            {inviteCode ? "You've Been Invited!" : "Join Savings Group"}
          </h1>
          <p className="text-muted-foreground">
            {inviteCode 
              ? "Review the group details below and join with one click"
              : "Search for a savings group by name or slug and request to join"
            }
          </p>
        </div>

        {/* Validating Code Indicator */}
        {validatingCode && (
          <Alert>
            <Loader2 className="h-4 w-4 animate-spin" />
            <AlertTitle>Validating Invite Code</AlertTitle>
            <AlertDescription>
              Please wait while we validate your invite link...
            </AlertDescription>
          </Alert>
        )}

        {/* Search Form - Hide if invite code present */}
        {!inviteCode && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Find Savings Group
            </CardTitle>
            <CardDescription>
              Enter the group name or slug to search
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={(e) => { e.preventDefault(); searchGroup(); }} className="space-y-4">
                <FormField
                  control={form.control}
                  name="groupIdentifier"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Group Name or Slug</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., tech-savers or Tech Savers"
                          {...field}
                          disabled={searching}
                        />
                      </FormControl>
                      <FormDescription>
                        Enter the exact slug (e.g., "tech-savers") or part of the group name
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" disabled={searching} className="w-full">
                  {searching && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <Search className="mr-2 h-4 w-4" />
                  Search Group
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
        )}

        {/* Group Preview */}
        {groupPreview && (
          <Card className="border-2 border-primary">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  {groupPreview.name}
                </span>
                <div className="flex gap-2">
                  {inviteCode && (
                    <Badge variant="secondary">Via Invite Link</Badge>
                  )}
                  <Badge variant="default">{groupPreview.status}</Badge>
                </div>
              </CardTitle>
              <CardDescription>
                Slug: {groupPreview.slug}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {groupPreview.description && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Description</p>
                  <p>{groupPreview.description}</p>
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">Saving Goal</p>
                  <p className="text-xl font-bold">KES {groupPreview.saving_goal.toLocaleString()}</p>
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">Current Members</p>
                  <p className="text-xl font-bold">{groupPreview.memberCount} / {groupPreview.max_members}</p>
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">Monthly Target</p>
                  <p className="text-xl font-bold">KES {groupPreview.monthly_target.toLocaleString()}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Cycle Period</p>
                  <p className="font-semibold">
                    {new Date(groupPreview.cycle_start_date).toLocaleDateString()} - {new Date(groupPreview.cycle_end_date).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Total Savings</p>
                  <p className="font-semibold">KES {groupPreview.total_savings?.toLocaleString() || 0}</p>
                </div>
              </div>

              {groupPreview.whatsapp_link && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">WhatsApp Group</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(groupPreview.whatsapp_link, "_blank")}
                  >
                    Join WhatsApp Group
                  </Button>
                </div>
              )}

              {/* Join Status */}
              {joinStatus === 'idle' && !groupPreview.existingMembership && (
                <Alert>
                  <UserPlus className="h-4 w-4" />
                  <AlertTitle>Ready to Join</AlertTitle>
                  <AlertDescription>
                    Click below to submit your join request. The group manager will review and approve your request.
                  </AlertDescription>
                </Alert>
              )}

              {joinStatus === 'pending' && (
                <Alert className="border-yellow-500">
                  <AlertCircle className="h-4 w-4 text-yellow-500" />
                  <AlertTitle>Pending Approval</AlertTitle>
                  <AlertDescription>
                    Your join request is awaiting manager approval. You'll be notified once approved.
                  </AlertDescription>
                </Alert>
              )}

              {joinStatus === 'already_member' && (
                <Alert className="border-primary">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <AlertTitle>Already a Member</AlertTitle>
                  <AlertDescription>
                    You are already an approved member of this group.
                  </AlertDescription>
                </Alert>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3">
                {joinStatus === 'idle' && !groupPreview.existingMembership && (
                  <Button
                    onClick={joinGroup}
                    disabled={loading || groupPreview.memberCount >= groupPreview.max_members}
                    className="flex-1"
                  >
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    <UserPlus className="mr-2 h-4 w-4" />
                    {inviteCode ? "Join via Invite" : "Request to Join"}
                  </Button>
                )}

                {joinStatus === 'already_member' && (
                  <Button
                    onClick={() => navigate(`/savings-groups/${groupPreview.id}`)}
                    className="flex-1"
                  >
                    View Group Dashboard
                  </Button>
                )}

                {joinStatus === 'pending' && (
                  <Button
                    onClick={() => navigate(`/savings-groups/${groupPreview.id}`)}
                    variant="outline"
                    className="flex-1"
                  >
                    View Pending Status
                  </Button>
                )}

                <Button
                  variant="ghost"
                  onClick={() => {
                    setGroupPreview(null);
                    setJoinStatus('idle');
                    form.reset();
                  }}
                >
                  Search Another Group
                </Button>
              </div>

              {groupPreview.memberCount >= groupPreview.max_members && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Group Full</AlertTitle>
                  <AlertDescription>
                    This group has reached its maximum member capacity.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        )}

        {/* Browse Groups Link */}
        <div className="text-center">
          <Button
            variant="link"
            onClick={() => navigate("/savings-groups")}
          >
            Browse All Savings Groups
          </Button>
        </div>
      </div>
    </Layout>
  );
}
