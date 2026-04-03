import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { BadgeCheck, Loader2, Clock, CheckCircle, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

interface VerificationRequestButtonProps {
  entityType: 'chama' | 'mchango' | 'organization' | 'welfare';
  entityId: string;
  entityName: string;
  isVerified: boolean;
  isOwner: boolean;
}

interface VerificationRequest {
  id: string;
  status: 'pending' | 'approved' | 'rejected';
  request_reason: string;
  rejection_reason?: string;
  created_at: string;
}

export const VerificationRequestButton = ({
  entityType,
  entityId,
  entityName,
  isVerified,
  isOwner,
}: VerificationRequestButtonProps) => {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reason, setReason] = useState("");
  const [existingRequest, setExistingRequest] = useState<VerificationRequest | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user && isOwner) {
      fetchExistingRequest();
    } else {
      setLoading(false);
    }
  }, [user, entityId, entityType, isOwner]);

  const fetchExistingRequest = async () => {
    try {
      const { data, error } = await supabase
        .from('verification_requests')
        .select('*')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setExistingRequest({
          ...data,
          status: data.status as 'pending' | 'approved' | 'rejected',
        });
      } else {
        setExistingRequest(null);
      }
    } catch (error) {
      console.error('Error fetching verification request:', error);
    } finally {
      setLoading(false);
    }
  };

  const VERIFICATION_FEE = 200;
  const requiresFee = entityType !== 'chama';

  const getEntityTable = () => {
    switch (entityType) {
      case 'mchango': return 'mchango';
      case 'organization': return 'organizations';
      case 'welfare': return 'welfare_groups';
      default: return '';
    }
  };

  const handleSubmit = async () => {
    if (!reason.trim()) {
      toast({
        title: "Reason Required",
        description: "Please explain why you're requesting verification",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      // For non-chama entities, check balance and deduct verification fee
      if (requiresFee) {
        const table = getEntityTable();
        const { data: entityData, error: fetchError } = await supabase
          .from(table)
          .select('available_balance')
          .eq('id', entityId)
          .single();

        if (fetchError) throw fetchError;

        const balance = entityData?.available_balance ?? 0;
        if (balance < VERIFICATION_FEE) {
          toast({
            title: "Insufficient Balance",
            description: `You need at least KSh ${VERIFICATION_FEE} in your ${entityType === 'mchango' ? 'campaign' : entityType} balance to request verification.`,
            variant: "destructive",
          });
          setIsSubmitting(false);
          return;
        }

        // Deduct fee from entity balance
        const { error: deductError } = await supabase
          .from(table)
          .update({ available_balance: balance - VERIFICATION_FEE })
          .eq('id', entityId);

        if (deductError) throw deductError;

        // Record fee as company revenue
        const { error: revenueError } = await supabase
          .from('company_earnings')
          .insert({
            amount: VERIFICATION_FEE,
            source: 'verification_fee',
            description: `Verification fee for ${entityType}: ${entityName}`,
            group_id: entityId,
          });

        if (revenueError) {
          console.error('Failed to record verification revenue:', revenueError);
        }
      }

      const { error } = await supabase
        .from('verification_requests')
        .insert({
          entity_type: entityType,
          entity_id: entityId,
          requested_by: user?.id,
          request_reason: reason.trim(),
        });

      if (error) {
        if (error.code === '23505') {
          toast({
            title: "Request Already Exists",
            description: "You already have a pending verification request for this entity",
            variant: "destructive",
          });
        } else {
          throw error;
        }
        return;
      }

      toast({
        title: "Request Submitted",
        description: requiresFee
          ? `KSh ${VERIFICATION_FEE} has been deducted. Your verification request has been submitted for admin review.`
          : "Your verification request has been submitted for admin review",
      });

      setIsOpen(false);
      setReason("");
      fetchExistingRequest();
    } catch (error: any) {
      console.error('Error submitting verification request:', error);
      toast({
        title: "Error",
        description: "Failed to submit verification request",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Don't show if not owner or already verified
  if (!isOwner || isVerified || loading) {
    return null;
  }

  // Show status badge if there's an existing request
  if (existingRequest) {
    if (existingRequest.status === 'pending') {
      return (
        <Badge variant="secondary" className="gap-1">
          <Clock className="h-3 w-3" />
          Verification Pending
        </Badge>
      );
    }
    if (existingRequest.status === 'rejected') {
      return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2 text-destructive">
              <XCircle className="h-4 w-4" />
              Verification Rejected - Retry
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Request Verification</DialogTitle>
              <DialogDescription>
                Your previous request was rejected: "{existingRequest.rejection_reason || 'No reason provided'}"
                <br /><br />
                Submit a new request with additional information.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="reason">Why should "{entityName}" be verified?</Label>
                <Textarea
                  id="reason"
                  placeholder="Explain why this entity should receive verified status..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={4}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <BadgeCheck className="h-4 w-4 mr-2" />
                    Submit Request
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      );
    }
  }

  // Show request button if no pending request
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <BadgeCheck className="h-4 w-4" />
          Request Verification
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request Verification Badge</DialogTitle>
          <DialogDescription>
            A verified badge shows users that your {entityType === 'mchango' ? 'campaign' : entityType} is authentic and trustworthy.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="reason">Why should "{entityName}" be verified?</Label>
            <Textarea
              id="reason"
              placeholder="Explain why this entity should receive verified status. Include any relevant details about legitimacy, track record, or official registration..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <BadgeCheck className="h-4 w-4 mr-2" />
                Submit Request
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};