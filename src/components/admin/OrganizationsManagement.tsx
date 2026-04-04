import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Search, Ban, PlayCircle, Loader2, ExternalLink, CheckCircle, Building2, ShieldCheck, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
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

interface Organization {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: string;
  status: string;
  is_verified: boolean;
  is_public: boolean;
  current_amount: number;
  available_balance: number;
  total_gross_collected: number;
  total_commission_paid: number;
  created_at: string;
  created_by: string;
  profiles: {
    full_name: string;
    email: string;
  } | null;
  donation_count?: number;
}

export const OrganizationsManagement = () => {
  const navigate = useNavigate();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [processing, setProcessing] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    orgId: string;
    action: 'unverify' | 'deactivate' | 'activate';
    orgName: string;
  } | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; org: Organization | null; confirmText: string }>({
    open: false,
    org: null,
    confirmText: "",
  });

  useEffect(() => {
    fetchOrganizations();
  }, []);

  const fetchOrganizations = async () => {
    try {
      // Fetch organizations with creator profile
      const { data: orgs, error } = await supabase
        .from('organizations')
        .select(`
          *,
          profiles:created_by (
            full_name,
            email
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch donation counts for each organization
      const orgsWithCounts = await Promise.all(
        (orgs || []).map(async (org) => {
          const { count } = await supabase
            .from('organization_donations')
            .select('*', { count: 'exact', head: true })
            .eq('organization_id', org.id)
            .eq('payment_status', 'completed');

          return {
            ...org,
            donation_count: count || 0,
          };
        })
      );

      setOrganizations(orgsWithCounts);
    } catch (error: any) {
      console.error('Error fetching organizations:', error);
      toast({
        title: "Error",
        description: "Failed to load organizations",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async () => {
    if (!confirmDialog) return;

    const { orgId, action } = confirmDialog;
    setProcessing(orgId);

    try {
      let updateData: any = {};

      switch (action) {
        case 'unverify':
          updateData = { is_verified: false };
          break;
        case 'activate':
          updateData = { status: 'active' };
          break;
        case 'deactivate':
          updateData = { status: 'inactive' };
          break;
      }

      const { error } = await supabase
        .from('organizations')
        .update(updateData)
        .eq('id', orgId);

      if (error) throw error;

      const actionMessages: Record<string, string> = {
        verify: 'Organization verified successfully',
        unverify: 'Organization verification removed',
        activate: 'Organization activated',
        deactivate: 'Organization deactivated',
      };

      toast({
        title: "Success",
        description: actionMessages[action],
      });

      await fetchOrganizations();
    } catch (error: any) {
      console.error('Error updating organization:', error);
      toast({
        title: "Error",
        description: "Failed to update organization",
        variant: "destructive",
      });
    } finally {
      setProcessing(null);
      setConfirmDialog(null);
    }
  };

  const deleteOrganization = async (orgId: string, orgName: string) => {
    setProcessing(orgId);
    try {
      // Delete related records first
      // 1. Delete donations
      await supabase
        .from("organization_donations")
        .delete()
        .eq("organization_id", orgId);

      // 2. Delete verification requests
      await supabase
        .from("verification_requests")
        .delete()
        .eq("entity_id", orgId)
        .eq("entity_type", "organization");

      // 3. Finally delete the organization
      const { error } = await supabase
        .from("organizations")
        .delete()
        .eq("id", orgId);

      if (error) throw error;

      toast({
        title: "Organization Deleted",
        description: `"${orgName}" has been permanently deleted`,
      });

      setDeleteDialog({ open: false, org: null, confirmText: "" });
      await fetchOrganizations();
    } catch (error: any) {
      console.error("Error deleting organization:", error);
      toast({
        title: "Error",
        description: "Failed to delete organization",
        variant: "destructive",
      });
    } finally {
      setProcessing(null);
    }
  };

  const filteredOrganizations = organizations.filter(org => {
    const matchesSearch = 
      org.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      org.slug.toLowerCase().includes(searchTerm.toLowerCase()) ||
      org.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      org.profiles?.full_name?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = 
      statusFilter === "all" || org.status === statusFilter;

    const matchesCategory = 
      categoryFilter === "all" || org.category === categoryFilter;

    return matchesSearch && matchesStatus && matchesCategory;
  });

  const categories = [...new Set(organizations.map(o => o.category))];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge>Active</Badge>;
      case 'inactive':
        return <Badge variant="secondary">Inactive</Badge>;
      case 'deleted':
        return <Badge variant="destructive">Deleted</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const formatCurrency = (amount: number) => {
    return `KES ${Number(amount || 0).toLocaleString()}`;
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
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Organizations Management
          </CardTitle>
          <CardDescription>
            View and manage all registered organizations ({organizations.length} total)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Stats Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="p-3 bg-muted rounded-lg text-center">
              <div className="text-2xl font-bold">{organizations.filter(o => o.status === 'active').length}</div>
              <div className="text-xs text-muted-foreground">Active</div>
            </div>
            <div className="p-3 bg-muted rounded-lg text-center">
              <div className="text-2xl font-bold">{organizations.filter(o => o.is_verified).length}</div>
              <div className="text-xs text-muted-foreground">Verified</div>
            </div>
            <div className="p-3 bg-muted rounded-lg text-center">
              <div className="text-2xl font-bold">
                {formatCurrency(organizations.reduce((sum, o) => sum + Number(o.total_gross_collected || 0), 0))}
              </div>
              <div className="text-xs text-muted-foreground">Total Raised</div>
            </div>
            <div className="p-3 bg-muted rounded-lg text-center">
              <div className="text-2xl font-bold">
                {formatCurrency(organizations.reduce((sum, o) => sum + Number(o.total_commission_paid || 0), 0))}
              </div>
              <div className="text-xs text-muted-foreground">Commission</div>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px] relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search organizations..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="deleted">Deleted</SelectItem>
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Organizations List */}
          <div className="space-y-3">
            {filteredOrganizations.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Building2 className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No organizations found</p>
              </div>
            ) : (
              filteredOrganizations.map((org) => (
                <div
                  key={org.id}
                  className="p-4 border rounded-lg space-y-3"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-medium">{org.name}</h3>
                        {getStatusBadge(org.status)}
                        {org.is_verified && (
                          <Badge variant="outline" className="text-accent border-accent">
                            <ShieldCheck className="h-3 w-3 mr-1" />
                            Verified
                          </Badge>
                        )}
                        <Badge variant="secondary">{org.category}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {org.description || 'No description'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        By: {org.profiles?.full_name || 'Unknown'} ({org.profiles?.email}) • 
                        Created {format(new Date(org.created_at), "MMM d, yyyy")}
                      </p>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Donations:</span>
                      <span className="font-medium">{org.donation_count}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total Raised:</span>
                      <span className="font-medium">{formatCurrency(org.total_gross_collected)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Balance:</span>
                      <span className="font-medium">{formatCurrency(org.available_balance)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Commission:</span>
                      <span className="font-medium">{formatCurrency(org.total_commission_paid)}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => navigate(`/admin/organization/${org.id}`)}
                    >
                      <ExternalLink className="h-4 w-4 mr-1" />
                      View Details
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(`/organizations/${org.slug}`)}
                    >
                      Public View
                    </Button>
                    
                    {org.is_verified && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setConfirmDialog({ 
                          open: true, 
                          orgId: org.id, 
                          action: 'unverify',
                          orgName: org.name 
                        })}
                        disabled={processing === org.id}
                      >
                        Remove Verification
                      </Button>
                    )}

                    {org.status === 'active' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-secondary border-secondary hover:bg-secondary/10"
                        onClick={() => setConfirmDialog({ 
                          open: true, 
                          orgId: org.id, 
                          action: 'deactivate',
                          orgName: org.name 
                        })}
                        disabled={processing === org.id}
                      >
                        <Ban className="h-4 w-4 mr-1" />
                        Deactivate
                      </Button>
                    ) : org.status !== 'deleted' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setConfirmDialog({ 
                          open: true, 
                          orgId: org.id, 
                          action: 'activate',
                          orgName: org.name 
                        })}
                        disabled={processing === org.id}
                      >
                        <PlayCircle className="h-4 w-4 mr-1" />
                        Activate
                      </Button>
                    )}

                    {org.status !== 'deleted' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setDeleteDialog({ open: true, org, confirmText: "" })}
                        disabled={processing === org.id}
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Delete
                      </Button>
                    )}

                    {processing === org.id && (
                      <Loader2 className="h-4 w-4 animate-spin ml-2" />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Confirmation Dialog for non-destructive actions */}
      <AlertDialog open={confirmDialog?.open} onOpenChange={(open) => !open && setConfirmDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmDialog?.action === 'unverify' && 'Remove Verification'}
              {confirmDialog?.action === 'activate' && 'Activate Organization'}
              {confirmDialog?.action === 'deactivate' && 'Deactivate Organization'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDialog?.action === 'unverify' && 
                `Are you sure you want to remove verification from "${confirmDialog?.orgName}"?`}
              {confirmDialog?.action === 'activate' && 
                `Are you sure you want to activate "${confirmDialog?.orgName}"?`}
              {confirmDialog?.action === 'deactivate' && 
                `Are you sure you want to deactivate "${confirmDialog?.orgName}"? It will no longer be visible publicly.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleAction}>
              {confirmDialog?.action === 'unverify' && 'Remove'}
              {confirmDialog?.action === 'activate' && 'Activate'}
              {confirmDialog?.action === 'deactivate' && 'Deactivate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog with Type-to-Confirm */}
      <AlertDialog open={deleteDialog.open} onOpenChange={(open) => !open && setDeleteDialog({ open: false, org: null, confirmText: "" })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">⚠️ Delete Organization Permanently</AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              <p>
                You are about to <strong>permanently delete</strong> the organization <strong>"{deleteDialog.org?.name}"</strong>. 
                This will remove all donations, transaction records, and verification requests.
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
              onClick={() => deleteDialog.org && deleteOrganization(deleteDialog.org.id, deleteDialog.org.name)}
              disabled={deleteDialog.confirmText !== "DELETE" || processing === deleteDialog.org?.id}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {processing === deleteDialog.org?.id ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : null}
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
