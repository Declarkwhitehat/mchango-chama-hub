import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Phone, Clock, CheckCircle2, MessageSquare, CreditCard, ArrowRight, Loader2, XCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface Callback {
  id: string;
  customer_name: string | null;
  phone_number: string;
  question: string;
  conversation_history: any;
  status: 'pending' | 'contacted' | 'resolved';
  created_at: string;
  resolved_at: string | null;
  notes: string | null;
}

interface ParsedPaymentRequest {
  currentPhone: string;
  newPhone: string;
  reason: string;
}

const parsePaymentRequest = (callback: Callback): ParsedPaymentRequest | null => {
  if (!callback.question.includes('Payment Method Change Request')) return null;
  
  const match = callback.question.match(/Current M-Pesa: ([^,]+), New M-Pesa: (.+)/);
  if (!match) return null;
  
  return {
    currentPhone: match[1] || 'Unknown',
    newPhone: match[2] || 'Unknown',
    reason: callback.notes?.replace('Reason: ', '') || 'No reason provided'
  };
};

const isPaymentChangeRequest = (callback: Callback): boolean => {
  return callback.question.includes('Payment Method Change Request');
};

export function CustomerCallbacks() {
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [showOnlyPaymentRequests, setShowOnlyPaymentRequests] = useState(false);
  const [selectedCallback, setSelectedCallback] = useState<Callback | null>(null);
  const [notes, setNotes] = useState('');
  const [processingAction, setProcessingAction] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: callbacks, isLoading } = useQuery({
    queryKey: ['customer-callbacks', selectedStatus],
    queryFn: async () => {
      let query = supabase
        .from('customer_callbacks')
        .select('*')
        .order('created_at', { ascending: false });

      if (selectedStatus !== 'all') {
        query = query.eq('status', selectedStatus);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Callback[];
    },
  });

  // Filter callbacks based on payment request toggle
  const filteredCallbacks = callbacks?.filter(callback => {
    if (!showOnlyPaymentRequests) return true;
    return isPaymentChangeRequest(callback);
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status, notes }: { id: string; status: string; notes?: string }) => {
      const updates: any = { 
        status,
        ...(notes && { notes })
      };
      
      if (status === 'resolved') {
        updates.resolved_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('customer_callbacks')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-callbacks'] });
      toast({
        title: 'Status Updated',
        description: 'Callback status has been updated successfully.',
      });
      setSelectedCallback(null);
      setNotes('');
    },
    onError: (error) => {
      toast({
        title: 'Update Failed',
        description: error instanceof Error ? error.message : 'Failed to update status',
        variant: 'destructive',
      });
    },
  });

  const handleApprovePaymentChange = async (callback: Callback) => {
    const parsed = parsePaymentRequest(callback);
    if (!parsed) {
      toast({
        title: "Invalid Request",
        description: "This is not a valid payment method change request.",
        variant: "destructive",
      });
      return;
    }

    // Verify this is a legitimate customer request (not admin-initiated)
    if (!callback.question.includes('Payment Method Change Request')) {
      toast({
        title: "Cannot Process",
        description: "Payment changes can only be made through customer requests.",
        variant: "destructive",
      });
      return;
    }

    setProcessingAction('approve');
    try {
      // Step 1: Find the user by phone (with flexible matching for format variations)
      // Try exact match first, then fall back to last 9 digits matching
      const normalizedPhone = parsed.currentPhone.replace(/\D/g, '').slice(-9);
      
      let { data: profiles, error: findError } = await supabase
        .from('profiles')
        .select('id, phone, full_name')
        .eq('phone', parsed.currentPhone)
        .limit(1);

      // If exact match fails, try matching last 9 digits
      if ((!profiles || profiles.length === 0) && normalizedPhone.length === 9) {
        const { data: fuzzyProfiles, error: fuzzyError } = await supabase
          .from('profiles')
          .select('id, phone, full_name')
          .ilike('phone', `%${normalizedPhone}`)
          .limit(1);
        
        if (!fuzzyError && fuzzyProfiles && fuzzyProfiles.length > 0) {
          profiles = fuzzyProfiles;
        }
      }

      if (findError || !profiles || profiles.length === 0) {
        throw new Error(`Could not find user with phone number: ${parsed.currentPhone}. Please verify the number is correct.`);
      }

      const profile = profiles[0];
      const userId = profile.id;

      // Step 2: Update profile phone number
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ 
          phone: parsed.newPhone,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (profileError) {
        throw new Error(`Failed to update profile phone: ${profileError.message}`);
      }

      // Step 3: Update M-Pesa payment method
      const { error: paymentError } = await supabase
        .from('payment_methods')
        .update({ 
          phone_number: parsed.newPhone,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .eq('method_type', 'mpesa');

      if (paymentError) {
        // Attempt to rollback profile change
        await supabase.from('profiles').update({ phone: profile.phone }).eq('id', userId);
        throw new Error(`Failed to update payment method: ${paymentError.message}`);
      }

      // Step 4: Verify the changes were applied
      const { data: verifiedProfile, error: verifyError } = await supabase
        .from('profiles')
        .select('phone')
        .eq('id', userId)
        .single();

      if (verifyError || verifiedProfile?.phone !== parsed.newPhone) {
        throw new Error('Phone number update could not be verified. Please check admin permissions.');
      }

      // Step 5: Mark callback as resolved with detailed notes
      await updateStatusMutation.mutateAsync({
        id: callback.id,
        status: 'resolved',
        notes: `APPROVED: Payment method changed from ${parsed.currentPhone} to ${parsed.newPhone} for user ${profile.full_name || userId}. Original reason: ${parsed.reason}`
      });

      toast({
        title: 'Payment Method Updated',
        description: `Successfully changed payment number to ${parsed.newPhone}`,
      });
    } catch (error: any) {
      console.error('Payment change approval error:', error);
      toast({
        title: 'Update Failed',
        description: error.message || 'Failed to update payment method',
        variant: 'destructive',
      });
    } finally {
      setProcessingAction(null);
    }
  };

  const handleRejectPaymentChange = async (callback: Callback) => {
    setProcessingAction('reject');
    try {
      await updateStatusMutation.mutateAsync({
        id: callback.id,
        status: 'resolved',
        notes: `REJECTED: ${notes || 'Request was rejected by admin'}. Original notes: ${callback.notes || 'None'}`
      });

      toast({
        title: 'Request Rejected',
        description: 'Payment method change request has been rejected.',
      });
    } catch (error: any) {
      toast({
        title: 'Action Failed',
        description: error.message || 'Failed to reject request',
        variant: 'destructive',
      });
    } finally {
      setProcessingAction(null);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      pending: 'destructive',
      contacted: 'secondary',
      resolved: 'default',
    };
    return (
      <Badge variant={variants[status as keyof typeof variants] as any}>
        {status}
      </Badge>
    );
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4" />;
      case 'contacted':
        return <Phone className="h-4 w-4" />;
      case 'resolved':
        return <CheckCircle2 className="h-4 w-4" />;
      default:
        return null;
    }
  };

  const allCallbacks = callbacks || [];
  const statusCounts = {
    all: filteredCallbacks?.length || 0,
    pending: filteredCallbacks?.filter(c => c.status === 'pending').length || 0,
    contacted: filteredCallbacks?.filter(c => c.status === 'contacted').length || 0,
    resolved: filteredCallbacks?.filter(c => c.status === 'resolved').length || 0,
  };

  const paymentRequestCount = allCallbacks.filter(c => isPaymentChangeRequest(c) && c.status === 'pending').length;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Customer Callbacks
              </CardTitle>
              <CardDescription className="mt-1">
                Manage customer support and payment change requests
              </CardDescription>
            </div>
            
            {/* Payment requests filter toggle */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor="payment-filter" className="text-sm cursor-pointer">
                Payment Requests Only
              </Label>
              <Switch
                id="payment-filter"
                checked={showOnlyPaymentRequests}
                onCheckedChange={setShowOnlyPaymentRequests}
              />
              {paymentRequestCount > 0 && (
                <Badge variant="destructive" className="ml-1">
                  {paymentRequestCount}
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={selectedStatus} onValueChange={setSelectedStatus}>
            <TabsList className="grid w-full grid-cols-4 mb-4">
              <TabsTrigger value="all">All ({statusCounts.all})</TabsTrigger>
              <TabsTrigger value="pending">Pending ({statusCounts.pending})</TabsTrigger>
              <TabsTrigger value="contacted">Contacted ({statusCounts.contacted})</TabsTrigger>
              <TabsTrigger value="resolved">Resolved ({statusCounts.resolved})</TabsTrigger>
            </TabsList>

            <TabsContent value={selectedStatus}>
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : !filteredCallbacks || filteredCallbacks.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {showOnlyPaymentRequests ? 'No payment change requests found' : 'No callbacks found'}
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredCallbacks.map((callback) => {
                    const isPaymentRequest = isPaymentChangeRequest(callback);
                    const parsed = isPaymentRequest ? parsePaymentRequest(callback) : null;
                    
                    return (
                      <Card key={callback.id} className={`hover:shadow-md transition-shadow ${isPaymentRequest ? 'border-l-4 border-l-primary' : ''}`}>
                        <CardContent className="pt-6">
                          <div className="flex items-start justify-between">
                            <div className="flex-1 space-y-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                {getStatusIcon(callback.status)}
                                {getStatusBadge(callback.status)}
                                {isPaymentRequest && (
                                  <Badge variant="outline" className="bg-primary/10">
                                    <CreditCard className="h-3 w-3 mr-1" />
                                    Payment Change
                                  </Badge>
                                )}
                                <span className="text-sm text-muted-foreground">
                                  {new Date(callback.created_at).toLocaleString()}
                                </span>
                              </div>
                              <div>
                                <p className="font-semibold">
                                  {callback.customer_name || 'Anonymous'}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {callback.phone_number}
                                </p>
                              </div>
                              
                              {/* Payment request details */}
                              {isPaymentRequest && parsed ? (
                                <div className="p-3 rounded-lg bg-muted/50 space-y-2">
                                  <div className="flex items-center gap-2 text-sm">
                                    <span className="font-medium">Current:</span>
                                    <code className="px-2 py-0.5 bg-background rounded">{parsed.currentPhone}</code>
                                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                    <span className="font-medium">New:</span>
                                    <code className="px-2 py-0.5 bg-primary/10 text-primary rounded">{parsed.newPhone}</code>
                                  </div>
                                  <p className="text-sm text-muted-foreground">
                                    <span className="font-medium">Reason:</span> {parsed.reason}
                                  </p>
                                </div>
                              ) : (
                                <p className="text-sm line-clamp-2">
                                  <span className="font-medium">Question:</span> {callback.question}
                                </p>
                              )}
                              
                              {callback.notes && !isPaymentRequest && (
                                <p className="text-sm text-muted-foreground">
                                  <span className="font-medium">Notes:</span> {callback.notes}
                                </p>
                              )}
                            </div>
                            
                            <div className="flex gap-2 ml-4 flex-wrap justify-end">
                              {/* Payment request actions */}
                              {isPaymentRequest && callback.status === 'pending' && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="default"
                                    onClick={() => handleApprovePaymentChange(callback)}
                                    disabled={!!processingAction}
                                  >
                                    {processingAction === 'approve' ? (
                                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                                    ) : (
                                      <CheckCircle2 className="h-4 w-4 mr-1" />
                                    )}
                                    Approve
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => {
                                      setSelectedCallback(callback);
                                      setNotes('');
                                    }}
                                    disabled={!!processingAction}
                                  >
                                    <XCircle className="h-4 w-4 mr-1" />
                                    Reject
                                  </Button>
                                </>
                              )}
                              
                              {/* Regular callback actions */}
                              {!isPaymentRequest && (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setSelectedCallback(callback)}
                                  >
                                    View Details
                                  </Button>
                                  {callback.status === 'pending' && (
                                    <Button
                                      size="sm"
                                      onClick={() => updateStatusMutation.mutate({ 
                                        id: callback.id, 
                                        status: 'contacted' 
                                      })}
                                    >
                                      Mark Contacted
                                    </Button>
                                  )}
                                  {callback.status === 'contacted' && (
                                    <Button
                                      size="sm"
                                      onClick={() => {
                                        setSelectedCallback(callback);
                                        setNotes(callback.notes || '');
                                      }}
                                    >
                                      Mark Resolved
                                    </Button>
                                  )}
                                </>
                              )}
                              
                              {/* View details for resolved payment requests */}
                              {isPaymentRequest && callback.status !== 'pending' && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setSelectedCallback(callback)}
                                >
                                  View Details
                                </Button>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Details Dialog */}
      <Dialog open={!!selectedCallback} onOpenChange={() => setSelectedCallback(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedCallback && isPaymentChangeRequest(selectedCallback) 
                ? 'Payment Change Request Details' 
                : 'Callback Details'
              }
            </DialogTitle>
            <DialogDescription>
              {selectedCallback && isPaymentChangeRequest(selectedCallback)
                ? 'Review and process payment method change request'
                : 'Review conversation history and manage callback status'
              }
            </DialogDescription>
          </DialogHeader>

          {selectedCallback && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Customer Name</Label>
                  <p className="text-sm">{selectedCallback.customer_name || 'Anonymous'}</p>
                </div>
                <div>
                  <Label>Phone Number</Label>
                  <p className="text-sm">{selectedCallback.phone_number}</p>
                </div>
                <div>
                  <Label>Status</Label>
                  <div className="mt-1">{getStatusBadge(selectedCallback.status)}</div>
                </div>
                <div>
                  <Label>Created</Label>
                  <p className="text-sm">{new Date(selectedCallback.created_at).toLocaleString()}</p>
                </div>
              </div>

              {/* Payment request specific view */}
              {isPaymentChangeRequest(selectedCallback) && (() => {
                const parsed = parsePaymentRequest(selectedCallback);
                return parsed ? (
                  <Alert className="border-primary/30 bg-primary/5">
                    <CreditCard className="h-4 w-4" />
                    <AlertDescription>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">Current Number:</span>
                          <code className="px-2 py-0.5 bg-background rounded">{parsed.currentPhone}</code>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">Requested Number:</span>
                          <code className="px-2 py-0.5 bg-primary/10 text-primary rounded">{parsed.newPhone}</code>
                        </div>
                        <div>
                          <span className="font-medium">Reason:</span> {parsed.reason}
                        </div>
                      </div>
                    </AlertDescription>
                  </Alert>
                ) : null;
              })()}

              {!isPaymentChangeRequest(selectedCallback) && (
                <div>
                  <Label>Question</Label>
                  <p className="text-sm mt-1 p-3 bg-muted rounded-lg">{selectedCallback.question}</p>
                </div>
              )}

              {selectedCallback.conversation_history && (
                <div>
                  <Label>Conversation History</Label>
                  <div className="mt-2 space-y-2 max-h-64 overflow-y-auto p-3 bg-muted rounded-lg">
                    {selectedCallback.conversation_history.map((msg: any, idx: number) => (
                      <div key={idx} className="text-sm">
                        <span className="font-semibold">
                          {msg.role === 'user' ? 'User' : 'AI'}:
                        </span>{' '}
                        {msg.content}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes for rejection or resolution */}
              {(selectedCallback.status === 'pending' && isPaymentChangeRequest(selectedCallback)) || 
               (selectedCallback.status === 'contacted' || selectedCallback.notes) ? (
                <div>
                  <Label htmlFor="notes">
                    {selectedCallback.status === 'pending' && isPaymentChangeRequest(selectedCallback)
                      ? 'Rejection Reason (required for rejection)'
                      : 'Notes'
                    }
                  </Label>
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={
                      selectedCallback.status === 'pending' && isPaymentChangeRequest(selectedCallback)
                        ? 'Provide a reason for rejecting this request...'
                        : 'Add notes about this callback...'
                    }
                    rows={3}
                    className="mt-1"
                  />
                </div>
              ) : null}

              {/* Display existing notes for resolved items */}
              {selectedCallback.status === 'resolved' && selectedCallback.notes && (
                <div>
                  <Label>Resolution Notes</Label>
                  <p className="text-sm mt-1 p-3 bg-muted rounded-lg whitespace-pre-wrap">{selectedCallback.notes}</p>
                </div>
              )}

              <div className="flex gap-2 justify-end">
                {/* Payment request actions in dialog */}
                {isPaymentChangeRequest(selectedCallback) && selectedCallback.status === 'pending' && (
                  <>
                    <Button
                      variant="destructive"
                      onClick={() => handleRejectPaymentChange(selectedCallback)}
                      disabled={!!processingAction || !notes.trim()}
                    >
                      {processingAction === 'reject' ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      ) : (
                        <XCircle className="h-4 w-4 mr-1" />
                      )}
                      Reject Request
                    </Button>
                    <Button
                      onClick={() => handleApprovePaymentChange(selectedCallback)}
                      disabled={!!processingAction}
                    >
                      {processingAction === 'approve' ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 mr-1" />
                      )}
                      Approve & Update
                    </Button>
                  </>
                )}
                
                {/* Regular callback actions */}
                {!isPaymentChangeRequest(selectedCallback) && (
                  <>
                    {selectedCallback.status === 'pending' && (
                      <Button
                        onClick={() => updateStatusMutation.mutate({ 
                          id: selectedCallback.id, 
                          status: 'contacted' 
                        })}
                        disabled={updateStatusMutation.isPending}
                      >
                        Mark as Contacted
                      </Button>
                    )}
                    {selectedCallback.status === 'contacted' && (
                      <Button
                        onClick={() => updateStatusMutation.mutate({ 
                          id: selectedCallback.id, 
                          status: 'resolved',
                          notes
                        })}
                        disabled={updateStatusMutation.isPending}
                      >
                        Mark as Resolved
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
