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
import { Search, Loader2, CheckCircle, XCircle, Clock, ExternalLink, Building2, Users, Heart } from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";

interface VerificationRequest {
  id: string;
  entity_type: 'chama' | 'mchango' | 'organization';
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
          }

          // Get requester name
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', request.requested_by)
            .maybeSingle();
          if (profile) {
            requesterName = profile.full_name;
          }

          return {
            ...request,
            entity_type: request.entity_type as 'chama' | 'mchango' | 'organization',
            status: request.status as 'pending' | 'approved' | 'rejected',
            entity_name: entityName,
            entity_slug: entitySlug,
            requester_name: requesterName,
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
                   request.entity_type === 'chama' ? 'chama' : 'organizations';
      
      const { error: entityError } = await supabase
        .from(table)
        .update({ is_verified: true })
        .eq('id', request.entity_id);

      if (entityError) throw entityError;

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

      toast({
        title: "Rejected",
        description: "Verification request has been rejected",
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

  const getEntityLink = (request: VerificationRequest) => {
    if (request.entity_type === 'chama') return `/chama/${request.entity_slug}`;
    if (request.entity_type === 'mchango') return `/mchango/${request.entity_slug}`;
    if (request.entity_type === 'organization') return `/organizations/${request.entity_slug}`;
    return '#';
  };

  const getEntityIcon = (type: string) => {
    if (type === 'chama') return <Users className="h-4 w-4" />;
    if (type === 'mchango') return <Heart className="h-4 w-4" />;
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