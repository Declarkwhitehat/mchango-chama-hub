import { useEffect, useState } from "react";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CheckCircle, XCircle, Clock, Eye } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";

interface KYCSubmission {
  id: string;
  full_name: string;
  id_number: string;
  phone: string;
  email: string;
  kyc_status: 'pending' | 'approved' | 'rejected';
  id_front_url: string | null;
  id_back_url: string | null;
  kyc_submitted_at: string | null;
  kyc_rejection_reason: string | null;
}

const AdminKYC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [submissions, setSubmissions] = useState<KYCSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubmission, setSelectedSubmission] = useState<KYCSubmission | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [processing, setProcessing] = useState(false);
  const [idFrontUrl, setIdFrontUrl] = useState<string | null>(null);
  const [idBackUrl, setIdBackUrl] = useState<string | null>(null);

  useEffect(() => {
    fetchSubmissions();
  }, []);

  const fetchSubmissions = async () => {
    try {
      // Fetch all profiles with KYC submissions
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .not('kyc_submitted_at', 'is', null)
        .order('kyc_submitted_at', { ascending: false });

      if (error) {
        console.error('Fetch error:', error);
        throw error;
      }

      console.log('KYC Submissions fetched:', data?.length || 0);
      setSubmissions(data || []);
    } catch (error: any) {
      console.error('Error fetching submissions:', error);
      toast({
        title: "Error",
        description: `Failed to load KYC submissions: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadDocumentImages = async (submission: KYCSubmission) => {
    try {
      // Get signed URLs for the ID documents
      if (submission.id_front_url) {
        const { data: frontData } = await supabase.storage
          .from('id-documents')
          .createSignedUrl(submission.id_front_url, 3600); // 1 hour expiry
        
        if (frontData) {
          setIdFrontUrl(frontData.signedUrl);
        }
      }

      if (submission.id_back_url) {
        const { data: backData } = await supabase.storage
          .from('id-documents')
          .createSignedUrl(submission.id_back_url, 3600);
        
        if (backData) {
          setIdBackUrl(backData.signedUrl);
        }
      }
    } catch (error) {
      console.error('Error loading document images:', error);
    }
  };

  const handleApprove = async (submissionId: string) => {
    setProcessing(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          kyc_status: 'approved',
          kyc_reviewed_at: new Date().toISOString(),
          kyc_reviewed_by: user?.id,
        })
        .eq('id', submissionId);

      if (error) throw error;

      toast({
        title: "Success!",
        description: "KYC approved successfully",
      });
      fetchSubmissions();
      setSelectedSubmission(null);
      setIdFrontUrl(null);
      setIdBackUrl(null);
    } catch (error: any) {
      console.error('Error approving KYC:', error);
      toast({
        title: "Error",
        description: "Failed to approve KYC",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async (submissionId: string) => {
    if (!rejectionReason.trim()) {
      toast({
        title: "Error",
        description: "Please provide a rejection reason",
        variant: "destructive",
      });
      return;
    }

    setProcessing(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          kyc_status: 'rejected',
          kyc_reviewed_at: new Date().toISOString(),
          kyc_reviewed_by: user?.id,
          kyc_rejection_reason: rejectionReason,
        })
        .eq('id', submissionId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "KYC rejected",
      });
      fetchSubmissions();
      setSelectedSubmission(null);
      setRejectionReason("");
      setIdFrontUrl(null);
      setIdBackUrl(null);
    } catch (error: any) {
      console.error('Error rejecting KYC:', error);
      toast({
        title: "Error",
        description: "Failed to reject KYC",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  useEffect(() => {
    if (selectedSubmission) {
      loadDocumentImages(selectedSubmission);
    }
  }, [selectedSubmission]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case 'approved':
        return <Badge className="bg-green-500"><CheckCircle className="h-3 w-3 mr-1" />Approved</Badge>;
      case 'rejected':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="container px-4 py-6 pb-24">
          <p>Loading...</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container px-4 py-6 pb-24 max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">KYC Review Queue</h1>
          <p className="text-muted-foreground">Review and approve user identity verifications</p>
        </div>

        {selectedSubmission ? (
          <Card>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle>{selectedSubmission.full_name}</CardTitle>
                  <CardDescription>Review submission details</CardDescription>
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedSubmission(null);
                    setRejectionReason("");
                  }}
                >
                  Back to List
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Email</Label>
                  <p className="font-medium">{selectedSubmission.email}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Phone</Label>
                  <p className="font-medium">{selectedSubmission.phone}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">ID Number</Label>
                  <p className="font-medium">{selectedSubmission.id_number}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <div>{getStatusBadge(selectedSubmission.kyc_status)}</div>
                </div>
              </div>

              <div className="space-y-4">
                <Label>ID Documents</Label>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Front Side</p>
                    {idFrontUrl ? (
                      <img
                        src={idFrontUrl}
                        alt="ID Front"
                        className="w-full rounded border cursor-pointer hover:opacity-90"
                        onClick={() => window.open(idFrontUrl, '_blank')}
                      />
                    ) : selectedSubmission.id_front_url ? (
                      <p className="text-sm text-muted-foreground">Loading...</p>
                    ) : (
                      <p className="text-sm text-muted-foreground">No image uploaded</p>
                    )}
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Back Side</p>
                    {idBackUrl ? (
                      <img
                        src={idBackUrl}
                        alt="ID Back"
                        className="w-full rounded border cursor-pointer hover:opacity-90"
                        onClick={() => window.open(idBackUrl, '_blank')}
                      />
                    ) : selectedSubmission.id_back_url ? (
                      <p className="text-sm text-muted-foreground">Loading...</p>
                    ) : (
                      <p className="text-sm text-muted-foreground">No image uploaded</p>
                    )}
                  </div>
                </div>
              </div>

              {selectedSubmission.kyc_status === 'pending' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="rejection-reason">Rejection Reason (if rejecting)</Label>
                    <Textarea
                      id="rejection-reason"
                      placeholder="Provide a reason if rejecting..."
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      rows={3}
                    />
                  </div>

                  <div className="flex gap-3">
                    <Button
                      variant="destructive"
                      onClick={() => handleReject(selectedSubmission.id)}
                      disabled={processing || !rejectionReason.trim()}
                      className="flex-1"
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      {processing ? "Processing..." : "Reject"}
                    </Button>
                    <Button
                      onClick={() => handleApprove(selectedSubmission.id)}
                      disabled={processing}
                      className="flex-1 bg-green-500 hover:bg-green-600"
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      {processing ? "Processing..." : "Approve"}
                    </Button>
                  </div>
                </div>
              )}

              {selectedSubmission.kyc_status === 'rejected' && selectedSubmission.kyc_rejection_reason && (
                <div className="bg-destructive/10 p-4 rounded">
                  <Label>Rejection Reason</Label>
                  <p className="text-sm mt-1">{selectedSubmission.kyc_rejection_reason}</p>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {submissions.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground">No KYC submissions yet</p>
                </CardContent>
              </Card>
            ) : (
              submissions.map((submission) => (
                <Card key={submission.id}>
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <h3 className="font-semibold">{submission.full_name}</h3>
                        <p className="text-sm text-muted-foreground">{submission.email}</p>
                        <p className="text-xs text-muted-foreground">
                          Submitted: {new Date(submission.kyc_submitted_at!).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        {getStatusBadge(submission.kyc_status)}
                        <Button
                          size="sm"
                          onClick={() => setSelectedSubmission(submission)}
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          Review
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default AdminKYC;
