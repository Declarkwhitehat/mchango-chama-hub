import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Search, Ban, PlayCircle, Loader2, ExternalLink, BadgeCheck, BadgeX, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";

interface Campaign {
  id: string;
  title: string;
  slug: string;
  description: string;
  target_amount: number;
  current_amount: number;
  status: string;
  is_verified: boolean;
  created_at: string;
  profiles: {
    full_name: string;
    email: string;
  };
}

export const CampaignsManagement = () => {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [processing, setProcessing] = useState<string | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; campaign: Campaign | null; confirmText: string }>({
    open: false,
    campaign: null,
    confirmText: "",
  });

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const fetchCampaigns = async () => {
    try {
      const { data, error } = await supabase
        .from('mchango')
        .select(`
          *,
          profiles:created_by (
            full_name,
            email
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setCampaigns(data || []);
    } catch (error: any) {
      console.error('Error fetching campaigns:', error);
      toast({
        title: "Error",
        description: "Failed to load campaigns",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const updateCampaignStatus = async (campaignId: string, newStatus: 'active' | 'cancelled' | 'completed') => {
    setProcessing(campaignId);
    try {
      const { error } = await supabase
        .from('mchango')
        .update({ status: newStatus })
        .eq('id', campaignId);

      if (error) throw error;

      toast({
        title: "Success",
        description: `Campaign ${newStatus === 'active' ? 'activated' : 'cancelled'}`,
      });

      await fetchCampaigns();
    } catch (error: any) {
      console.error('Error updating campaign:', error);
      toast({
        title: "Error",
        description: "Failed to update campaign status",
        variant: "destructive",
      });
    } finally {
      setProcessing(null);
    }
  };

  const toggleVerification = async (campaignId: string, currentStatus: boolean) => {
    setProcessing(campaignId);
    try {
      const { error } = await supabase
        .from('mchango')
        .update({ is_verified: !currentStatus })
        .eq('id', campaignId);

      if (error) throw error;

      toast({
        title: "Success",
        description: `Campaign ${!currentStatus ? 'verified' : 'unverified'}`,
      });

      await fetchCampaigns();
    } catch (error: any) {
      console.error('Error toggling verification:', error);
      toast({
        title: "Error",
        description: "Failed to update verification status",
        variant: "destructive",
      });
    } finally {
      setProcessing(null);
    }
  };

  const deleteCampaign = async (campaignId: string, campaignTitle: string) => {
    setProcessing(campaignId);
    try {
      // Delete related records first
      // 1. Delete donations
      await supabase
        .from("mchango_donations")
        .delete()
        .eq("mchango_id", campaignId);

      // 2. Delete transactions
      await supabase
        .from("transactions")
        .delete()
        .eq("mchango_id", campaignId);

      // 3. Delete payouts
      await supabase
        .from("payouts")
        .delete()
        .eq("mchango_id", campaignId);

      // 4. Delete withdrawals
      await supabase
        .from("withdrawals")
        .delete()
        .eq("mchango_id", campaignId);

      // 5. Finally delete the campaign
      const { error } = await supabase
        .from("mchango")
        .delete()
        .eq("id", campaignId);

      if (error) throw error;

      toast({
        title: "Campaign Deleted",
        description: `"${campaignTitle}" has been permanently deleted`,
      });

      setDeleteDialog({ open: false, campaign: null, confirmText: "" });
      await fetchCampaigns();
    } catch (error: any) {
      console.error("Error deleting campaign:", error);
      toast({
        title: "Error",
        description: "Failed to delete campaign",
        variant: "destructive",
      });
    } finally {
      setProcessing(null);
    }
  };

  const filteredCampaigns = campaigns.filter(campaign => {
    const matchesSearch = 
      campaign.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      campaign.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      campaign.profiles?.full_name.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = 
      statusFilter === "all" || 
      campaign.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge>Active</Badge>;
      case 'completed':
        return <Badge className="bg-accent text-accent-foreground">Completed</Badge>;
      case 'cancelled':
        return <Badge variant="destructive">Cancelled</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Campaign Management</CardTitle>
        <CardDescription>
          View and manage all mchango campaigns ({campaigns.length} total)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search campaigns..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Campaigns List */}
        <div className="space-y-3">
          {filteredCampaigns.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No campaigns found</p>
            </div>
          ) : (
            filteredCampaigns.map((campaign) => {
              const progress = (Number(campaign.current_amount) / Number(campaign.target_amount)) * 100;
              
              return (
                <div
                  key={campaign.id}
                  className="p-4 border rounded-lg space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{campaign.title}</h3>
                        {campaign.is_verified && <VerifiedBadge size="sm" />}
                        {getStatusBadge(campaign.status)}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {campaign.description}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        By: {campaign.profiles?.full_name} • Created {format(new Date(campaign.created_at), "MMM d, yyyy")}
                      </p>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Progress</span>
                      <span className="font-medium">
                        KES {Number(campaign.current_amount).toLocaleString()} / {Number(campaign.target_amount).toLocaleString()}
                      </span>
                    </div>
                    <Progress value={progress} className="h-2" />
                    <p className="text-xs text-muted-foreground text-right">
                      {progress.toFixed(1)}% raised
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => navigate(`/admin/campaign/${campaign.id}`)}
                    >
                      <ExternalLink className="h-4 w-4 mr-1" />
                      View Details
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(`/mchango/${campaign.slug}`)}
                    >
                      Public View
                    </Button>

                    <Button
                      size="sm"
                      variant={campaign.is_verified ? "outline" : "default"}
                      onClick={() => toggleVerification(campaign.id, campaign.is_verified)}
                      disabled={processing === campaign.id}
                      className={campaign.is_verified ? "text-muted-foreground" : "bg-blue-500 hover:bg-blue-600"}
                    >
                      {processing === campaign.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : campaign.is_verified ? (
                        <>
                          <BadgeX className="h-4 w-4 mr-1" />
                          Unverify
                        </>
                      ) : (
                        <>
                          <BadgeCheck className="h-4 w-4 mr-1" />
                          Verify
                        </>
                      )}
                    </Button>
                    
                    {campaign.status === 'active' && (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => updateCampaignStatus(campaign.id, 'cancelled')}
                        disabled={processing === campaign.id}
                      >
                        {processing === campaign.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Ban className="h-4 w-4 mr-1" />
                            Cancel
                          </>
                        )}
                      </Button>
                    )}

                    {campaign.status === 'cancelled' && (
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => updateCampaignStatus(campaign.id, 'active')}
                        disabled={processing === campaign.id}
                      >
                        {processing === campaign.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <PlayCircle className="h-4 w-4 mr-1" />
                            Reactivate
                          </>
                        )}
                      </Button>
                    )}

                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setDeleteDialog({ open: true, campaign, confirmText: "" })}
                      disabled={processing === campaign.id}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </CardContent>

      {/* Delete Confirmation Dialog with Type-to-Confirm */}
      <AlertDialog open={deleteDialog.open} onOpenChange={(open) => !open && setDeleteDialog({ open: false, campaign: null, confirmText: "" })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">⚠️ Delete Campaign Permanently</AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              <p>
                You are about to <strong>permanently delete</strong> the campaign <strong>"{deleteDialog.campaign?.title}"</strong>. 
                This will remove all donations, transactions, and related records.
              </p>
              <p className="text-destructive font-medium">This action cannot be undone!</p>
              <div className="space-y-2">
                <p className="text-sm">To confirm, type <strong>DELETE</strong> below:</p>
                <Input
                  value={deleteDialog.confirmText}
                  onChange={(e) => setDeleteDialog(prev => ({ ...prev, confirmText: e.target.value }))}
                  placeholder="Type DELETE to confirm"
                  className="border-destructive/50 focus-visible:ring-destructive"
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteDialog.campaign && deleteCampaign(deleteDialog.campaign.id, deleteDialog.campaign.title)}
              disabled={deleteDialog.confirmText !== "DELETE" || processing === deleteDialog.campaign?.id}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {processing === deleteDialog.campaign?.id ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : null}
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};
