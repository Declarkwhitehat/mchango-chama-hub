import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Search, Loader2, CheckCircle, XCircle, Clock, ExternalLink, Building2, Users, Heart, Shield } from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";

interface VerificationRequest {
  id: string;
  entity_type: 'chama' | 'mchango' | 'organization' | 'welfare';
  entity_id: string;
  requested_by: string;
  status: 'pending' | 'approved' | 'rejected';
  request_reason: string;
  rejection_reason?: string;
  created_at: string;
  reviewed_at?: string;
  entity_name?: string;
  entity_slug?: string;
  requester_name?: string;
  requester_phone?: string;
  requester_id_number?: string;
  requester_created_at?: string;
  entity_collected?: number;
  entity_balance?: number;
  entity_created_at?: string;
}

export const VerificationRequestsManagement = () => {
  const navigate = useNavigate();
  const [requests, setRequests] = useState<VerificationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [typeFilter, setTypeFilter] = useState("all");
  const [processing, setProcessing] = useState<string | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<VerificationRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    try {
      const { data, error } = await supabase
        .from('verification_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Enrich with entity names
      const enrichedRequests = await Promise.all(
        (data || []).map(async (request) => {
          let entityName = 'Unknown';
          let entitySlug = '';
          let requesterName = 'Unknown';

          // Get entity name
          if (request.entity_type === 'chama') {
            const { data: chama } = await supabase
              .from('chama')
              .select('name, slug')
              .eq('id', request.entity_id)
              .maybeSingle();
            if (chama) {
              entityName = chama.name;
              entitySlug = chama.slug;
            }
          } else if (request.entity_type === 'mchango') {
            const { data: mchango } = await supabase
              .from('mchango')
              .select('title, slug')
              .eq('id', request.entity_id)
              .maybeSingle();
            if (mchango) {
              entityName = mchango.title;
              entitySlug = mchango.slug;
            }
          } else if (request.entity_type === 'organization') {
            const { data: org } = await supabase
              .from('organizations')
              .select('name, slug')
              .eq('id', request.entity_id)
              .maybeSingle();
            if (org) {
              entityName = org.name;
              entitySlug = org.slug;
            }
          } else if (request.entity_type === 'welfare') {
            const { data: welfare } = await supabase
              .from('welfares')
              .select('name, slug')
              .eq('id', request.entity_id)
              .maybeSingle();
            if (welfare) {
              entityName = welfare.name;
              entitySlug = welfare.slug;
            }
          }

          // Get requester details
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name, phone, id_number, created_at')
            .eq('id', request.requested_by)
            .maybeSingle();

          let requesterPhone = '';
          let requesterIdNumber = '';
          let requesterCreatedAt = '';
          if (profile) {
            requesterName = profile.full_name;
            requesterPhone = profile.phone || '';
            requesterIdNumber = profile.id_number || '';
            requesterCreatedAt = profile.created_at || '';
          }

          // Get entity financial data
          let entityCollected = 0;
          let entityBalance = 0;
          let entityCreatedAt = '';
          if (request.entity_type === 'chama') {
            const { data: d } = await supabase.from('chama').select('total_gross_collected, available_balance, created_at').eq('id', request.entity_id).maybeSingle();
            if (d) { entityCollected = Number(d.total_gross_collected || 0); entityBalance = Number(d.available_balance || 0); entityCreatedAt = d.created_at; }
          } else if (request.entity_type === 'mchango') {
            const { data: d } = await supabase.from('mchango').select('total_gross_collected, available_balance, created_at').eq('id', request.entity_id).maybeSingle();
            if (d) { entityCollected = Number(d.total_gross_collected || 0); entityBalance = Number(d.available_balance || 0); entityCreatedAt = d.created_at; }
          } else if (request.entity_type === 'organization') {
            const { data: d } = await supabase.from('organizations').select('total_gross_collected, available_balance, created_at').eq('id', request.entity_id).maybeSingle();
            if (d) { entityCollected = Number(d.total_gross_collected || 0); entityBalance = Number(d.available_balance || 0); entityCreatedAt = d.created_at; }
          } else if (request.entity_type === 'welfare') {
            const { data: d } = await supabase.from('welfares').select('available_balance, created_at').eq('id', request.entity_id).maybeSingle();
            if (d) { entityBalance = Number(d.available_balance || 0); entityCreatedAt = d.created_at; }
          }

          return {
            ...request,
            entity_type: request.entity_type as 'chama' | 'mchango' | 'organization' | 'welfare',
            status: request.status as 'pending' | 'approved' | 'rejected',
            entity_name: entityName,
            entity_slug: entitySlug,
            requester_name: requesterName,
            requester_phone: requesterPhone,
            requester_id_number: requesterIdNumber,
            requester_created_at: requesterCreatedAt,
            entity_collected: entityCollected,
            entity_balance: entityBalance,
            entity_created_at: entityCreatedAt,
          };
        })
      );

      setRequests(enrichedRequests);
    } catch (error: any) {
      console.error('Error fetching verification requests:', error);
      toast({
        title: "Error",
        description: "Failed to load verification requests",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (request: VerificationRequest) => {
    setProcessing(request.id);
    try {
      // Update request status
      const { error: requestError } = await supabase
        .from('verification_requests')
        .update({
          status: 'approved',
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', request.id);

      if (requestError) throw requestError;

      // Update entity verification status
      const table = request.entity_type === 'mchango' ? 'mchango' : 
                   request.entity_type === 'chama' ? 'chama' : 
                   request.entity_type === 'welfare' ? 'welfares' : 'organizations';
      
      const { error: entityError } = await supabase
        .from(table)
        .update({ is_verified: true })
        .eq('id', request.entity_id);

      if (entityError) throw entityError;

      // Create notification for the requester
      const entityTypeLabel = request.entity_type === 'mchango' ? 'Campaign' : 
                              request.entity_type === 'chama' ? 'Chama' : 
                              request.entity_type === 'welfare' ? 'Welfare' : 'Organization';
      await supabase
        .from('notifications')
        .insert({
          user_id: request.requested_by,
          title: 'Verification Approved! ✓',
          message: `Congratulations! Your ${entityTypeLabel} "${request.entity_name}" has been verified.`,
          type: 'success',
          category: 'verification',
          related_entity_id: request.entity_id,
          related_entity_type: request.entity_type,
        });

      toast({
        title: "Approved",
        description: `${request.entity_name} has been verified`,
      });

      fetchRequests();
    } catch (error: any) {
      console.error('Error approving request:', error);
      toast({
        title: "Error",
        description: "Failed to approve verification request",
        variant: "destructive",
      });
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async () => {
    if (!selectedRequest) return;
    
    setProcessing(selectedRequest.id);
    try {
      const { error } = await supabase
        .from('verification_requests')
        .update({
          status: 'rejected',
          rejection_reason: rejectionReason.trim() || 'Request did not meet verification criteria',
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', selectedRequest.id);

      if (error) throw error;

      // Fetch verification fee from platform settings
      let verificationFee = 200;
      const { data: feeSetting } = await supabase
        .from('platform_settings')
        .select('setting_value')
        .eq('setting_key', 'verification_fee')
        .maybeSingle();
      if (feeSetting && typeof feeSetting.setting_value === 'object' && feeSetting.setting_value !== null) {
        const val = feeSetting.setting_value as { amount?: number };
        if (val.amount) verificationFee = val.amount;
      }

      const requiresRefund = selectedRequest.entity_type !== 'chama';
      
      if (requiresRefund) {
        const tableName = selectedRequest.entity_type === 'mchango' ? 'mchango' 
          : selectedRequest.entity_type === 'organization' ? 'organizations' 
          : 'welfares';

        // Get current balance
        const { data: entityData } = await supabase
          .from(tableName)
          .select('available_balance')
          .eq('id', selectedRequest.entity_id)
          .single();

        const currentBalance = entityData?.available_balance ?? 0;

        // Refund the fee
        await supabase
          .from(tableName)
          .update({ available_balance: currentBalance + verificationFee })
          .eq('id', selectedRequest.entity_id);

        // Record refund in company_earnings as negative amount
        await supabase.from('company_earnings').insert({
          amount: -verificationFee,
          source: 'VERIFICATION_FEE_REFUND',
          description: `Verification fee refund for rejected ${selectedRequest.entity_type}: ${selectedRequest.entity_name}`,
          group_id: selectedRequest.entity_id,
        });
      }

      // Create notification for the requester
      const entityTypeLabel = selectedRequest.entity_type === 'mchango' ? 'Campaign' : 
                              selectedRequest.entity_type === 'chama' ? 'Chama' : 
                              selectedRequest.entity_type === 'welfare' ? 'Welfare' : 'Organization';
      const refundMsg = requiresRefund ? ` KSh ${verificationFee} verification fee has been refunded to your balance.` : '';
      await supabase
        .from('notifications')
        .insert({
          user_id: selectedRequest.requested_by,
          title: 'Verification Request Rejected',
          message: `Your verification request for ${entityTypeLabel} "${selectedRequest.entity_name}" was not approved.${rejectionReason ? ` Reason: ${rejectionReason}` : ''}${refundMsg}`,
          type: 'error',
          category: 'verification',
          related_entity_id: selectedRequest.entity_id,
          related_entity_type: selectedRequest.entity_type,
        });

      toast({
        title: "Rejected",
        description: requiresRefund 
          ? "Verification request rejected. KSh 200 has been refunded." 
          : "Verification request has been rejected",
      });

      setRejectDialogOpen(false);
      setRejectionReason("");
      setSelectedRequest(null);
      fetchRequests();
    } catch (error: any) {
      console.error('Error rejecting request:', error);
      toast({
        title: "Error",
        description: "Failed to reject verification request",
        variant: "destructive",
      });
    } finally {
      setProcessing(null);
    }
  };

  const handleUnverify = async (request: VerificationRequest) => {
    setProcessing(request.id);
    try {
      const table = request.entity_type === 'mchango' ? 'mchango' : 
                   request.entity_type === 'chama' ? 'chama' : 
                   request.entity_type === 'welfare' ? 'welfares' : 'organizations';
      
      const { error: entityError } = await supabase
        .from(table)
        .update({ is_verified: false })
        .eq('id', request.entity_id);

      if (entityError) throw entityError;

      // Update request status back to rejected so user must re-apply
      const { error: requestError } = await supabase
        .from('verification_requests')
        .update({
          status: 'rejected',
          rejection_reason: 'Verification removed by admin',
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', request.id);

      if (requestError) throw requestError;

      const entityTypeLabel = request.entity_type === 'mchango' ? 'Campaign' : 
                              request.entity_type === 'chama' ? 'Chama' : 
                              request.entity_type === 'welfare' ? 'Welfare' : 'Organization';
      await supabase
        .from('notifications')
        .insert({
          user_id: request.requested_by,
          title: 'Verification Removed',
          message: `The verification badge for your ${entityTypeLabel} "${request.entity_name}" has been removed by admin.`,
          type: 'warning',
          category: 'verification',
          related_entity_id: request.entity_id,
          related_entity_type: request.entity_type,
        });

      toast({
        title: "Unverified",
        description: `${request.entity_name} verification has been removed`,
      });

      fetchRequests();
    } catch (error: any) {
      console.error('Error unverifying:', error);
      toast({
        title: "Error",
        description: "Failed to remove verification",
        variant: "destructive",
      });
    } finally {
      setProcessing(null);
    }
  };

  const getEntityLink = (request: VerificationRequest) => {
    if (request.entity_type === 'chama') return `/chama/${request.entity_slug}`;
    if (request.entity_type === 'mchango') return `/mchango/${request.entity_slug}`;
    if (request.entity_type === 'organization') return `/organizations/${request.entity_slug}`;
    if (request.entity_type === 'welfare') return `/welfare/${request.entity_id}`;
    return '#';
  };

  const getEntityIcon = (type: string) => {
    if (type === 'chama') return <Users className="h-4 w-4" />;
    if (type === 'mchango') return <Heart className="h-4 w-4" />;
    if (type === 'welfare') return <Shield className="h-4 w-4" />;
    return <Building2 className="h-4 w-4" />;
  };

  const getStatusBadge = (status: string) => {
    if (status === 'pending') {
      return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />Pending</Badge>;
    }
    if (status === 'approved') {
      return <Badge className="gap-1 bg-primary"><CheckCircle className="h-3 w-3" />Approved</Badge>;
    }
    return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Rejected</Badge>;
  };

  const filteredRequests = requests.filter(request => {
    const matchesSearch = 
      request.entity_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      request.requester_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      request.request_reason?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === "all" || request.status === statusFilter;
    const matchesType = typeFilter === "all" || request.entity_type === typeFilter;

    return matchesSearch && matchesStatus && matchesType;
  });

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
          <CardTitle>Verification Requests</CardTitle>
          <CardDescription>
            Review and manage verification requests ({requests.filter(r => r.status === 'pending').length} pending)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search requests..."
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
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="chama">Chama</SelectItem>
                <SelectItem value="mchango">Campaign</SelectItem>
                <SelectItem value="organization">Organization</SelectItem>
                <SelectItem value="welfare">Welfare</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Requests List */}
          <div className="space-y-3">
            {filteredRequests.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No verification requests found</p>
              </div>
            ) : (
              filteredRequests.map((request) => (
                <div
                  key={request.id}
                  className="p-4 border rounded-lg space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        {getEntityIcon(request.entity_type)}
                        <span className="font-medium">{request.entity_name}</span>
                        {getStatusBadge(request.status)}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Requested by {request.requester_name} • {format(new Date(request.created_at), "MMM d, yyyy")}
                      </p>
                    </div>
                    <Badge variant="outline" className="capitalize">
                      {request.entity_type === 'mchango' ? 'Campaign' : request.entity_type}
                    </Badge>
                  </div>

                  {/* Requester & Entity Details */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 rounded-lg border bg-muted/30 text-xs">
                    <div>
                      <p className="text-muted-foreground font-medium">Phone</p>
                      <p className="font-mono font-bold">{request.requester_phone || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground font-medium">ID Number</p>
                      <p className="font-bold">{request.requester_id_number || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground font-medium">Account Created</p>
                      <p className="font-bold">{request.requester_created_at ? format(new Date(request.requester_created_at), "MMM d, yyyy") : 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground font-medium">Entity Created</p>
                      <p className="font-bold">{request.entity_created_at ? format(new Date(request.entity_created_at), "MMM d, yyyy") : 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground font-medium">Total Collected</p>
                      <p className="font-bold text-primary">KES {(request.entity_collected || 0).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground font-medium">Available Balance</p>
                      <p className="font-bold">KES {(request.entity_balance || 0).toLocaleString()}</p>
                    </div>
                  </div>

                  <div className="bg-muted/50 p-3 rounded text-sm">
                    <p className="font-medium text-xs text-muted-foreground mb-1">Reason for verification:</p>
                    <p>{request.request_reason}</p>
                  </div>

                  {request.rejection_reason && (
                    <div className="bg-destructive/10 p-3 rounded text-sm">
                      <p className="font-medium text-xs text-destructive mb-1">Rejection reason:</p>
                      <p className="text-destructive">{request.rejection_reason}</p>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(getEntityLink(request))}
                    >
                      <ExternalLink className="h-4 w-4 mr-1" />
                      View
                    </Button>

                    {request.status === 'pending' && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => handleApprove(request)}
                          disabled={processing === request.id}
                          className="bg-primary hover:bg-primary/90"
                        >
                          {processing === request.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <CheckCircle className="h-4 w-4 mr-1" />
                              Approve
                            </>
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => {
                            setSelectedRequest(request);
                            setRejectDialogOpen(true);
                          }}
                          disabled={processing === request.id}
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Reject
                        </Button>
                      </>
                    )}

                    {request.status === 'approved' && (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleUnverify(request)}
                        disabled={processing === request.id}
                      >
                        {processing === request.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <XCircle className="h-4 w-4 mr-1" />
                            Unverify
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Verification Request</DialogTitle>
            <DialogDescription>
              Provide a reason for rejecting this verification request for "{selectedRequest?.entity_name}".
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="rejection-reason">Rejection Reason</Label>
              <Textarea
                id="rejection-reason"
                placeholder="Explain why this request is being rejected..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={processing !== null}
            >
              {processing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Reject Request"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};