import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Phone, Clock, CheckCircle2, MessageSquare } from 'lucide-react';

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

export function CustomerCallbacks() {
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedCallback, setSelectedCallback] = useState<Callback | null>(null);
  const [notes, setNotes] = useState('');
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

  const statusCounts = {
    all: callbacks?.length || 0,
    pending: callbacks?.filter(c => c.status === 'pending').length || 0,
    contacted: callbacks?.filter(c => c.status === 'contacted').length || 0,
    resolved: callbacks?.filter(c => c.status === 'resolved').length || 0,
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Customer Callbacks
          </CardTitle>
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
              ) : !callbacks || callbacks.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No callbacks found</div>
              ) : (
                <div className="space-y-4">
                  {callbacks.map((callback) => (
                    <Card key={callback.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="pt-6">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-2">
                              {getStatusIcon(callback.status)}
                              {getStatusBadge(callback.status)}
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
                            <p className="text-sm line-clamp-2">
                              <span className="font-medium">Question:</span> {callback.question}
                            </p>
                            {callback.notes && (
                              <p className="text-sm text-muted-foreground">
                                <span className="font-medium">Notes:</span> {callback.notes}
                              </p>
                            )}
                          </div>
                          <div className="flex gap-2 ml-4">
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
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
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
            <DialogTitle>Callback Details</DialogTitle>
            <DialogDescription>
              Review conversation history and manage callback status
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

              <div>
                <Label>Question</Label>
                <p className="text-sm mt-1 p-3 bg-muted rounded-lg">{selectedCallback.question}</p>
              </div>

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

              {(selectedCallback.status === 'contacted' || selectedCallback.notes) && (
                <div>
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Add notes about this callback..."
                    rows={4}
                    className="mt-1"
                  />
                </div>
              )}

              <div className="flex gap-2 justify-end">
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
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
