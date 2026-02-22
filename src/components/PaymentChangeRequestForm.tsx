import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Phone, Shield, CheckCircle } from "lucide-react";
import { z } from "zod";
import { TwoFactorConfirmDialog } from "./TwoFactorConfirmDialog";

const phoneSchema = z.string()
  .regex(/^\+254(7[0-9]|11[0-1])\d{7}$/, "Please enter a valid Safaricom number (+254XXXXXXXXX)");

const reasonSchema = z.string()
  .min(10, "Please provide more details (at least 10 characters)")
  .max(500, "Reason must be less than 500 characters");

interface PaymentChangeRequestFormProps {
  open: boolean;
  onClose: () => void;
  currentPhone: string | null;
  userName: string;
}

export const PaymentChangeRequestForm = ({ 
  open, 
  onClose, 
  currentPhone,
  userName 
}: PaymentChangeRequestFormProps) => {
  const [newPhone, setNewPhone] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<{ phone?: string; reason?: string }>({});
  const [is2FAEnabled, setIs2FAEnabled] = useState(false);
  const [show2FAConfirm, setShow2FAConfirm] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const check2FA = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/totp-2fa`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ action: 'status' }),
        });
        const data = await response.json();
        setIs2FAEnabled(data.enabled || false);
      } catch {}
    };
    if (open) check2FA();
  }, [open]);

  const validateForm = (): boolean => {
    const newErrors: { phone?: string; reason?: string } = {};
    
    try {
      phoneSchema.parse(newPhone);
    } catch (e: any) {
      newErrors.phone = e.errors?.[0]?.message || "Invalid phone number";
    }

    try {
      reasonSchema.parse(reason);
    } catch (e: any) {
      newErrors.reason = e.errors?.[0]?.message || "Invalid reason";
    }

    if (newPhone === currentPhone) {
      newErrors.phone = "New number must be different from current number";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    if (is2FAEnabled) {
      setShow2FAConfirm(true);
      return;
    }

    await executeSubmit();
  };

  const executeSubmit = async () => {

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Create callback request for payment method change
      // Store user_id in conversation_history for reliable admin lookup
      const { error } = await supabase
        .from('customer_callbacks')
        .insert({
          customer_name: userName,
          phone_number: currentPhone || newPhone,
          question: `Payment Method Change Request: Current M-Pesa: ${currentPhone}, New M-Pesa: ${newPhone}`,
          notes: `Reason: ${reason}`,
          status: 'pending',
          conversation_history: [{ 
            user_id: user.id, 
            requested_at: new Date().toISOString(),
            current_phone: currentPhone,
            new_phone: newPhone
          }]
        });
      if (error) throw error;

      setSubmitted(true);
      toast({
        title: "Request Submitted",
        description: "Our team will review your request and contact you soon.",
      });
    } catch (error: any) {
      console.error('Error submitting request:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to submit request. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setNewPhone("");
    setReason("");
    setErrors({});
    setSubmitted(false);
    onClose();
  };

  return (
    <>
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Request Payment Method Change
          </DialogTitle>
          <DialogDescription>
            Submit a request to change your M-Pesa payout number. Our team will verify and process your request.
          </DialogDescription>
        </DialogHeader>

        {submitted ? (
          <div className="space-y-4 py-4">
            <div className="flex flex-col items-center text-center space-y-3">
              <div className="p-3 bg-primary/10 rounded-full">
                <CheckCircle className="h-8 w-8 text-primary" />
              </div>
              <h3 className="font-semibold text-lg">Request Submitted!</h3>
              <p className="text-sm text-muted-foreground">
                Your payment method change request has been submitted successfully. 
                Our customer support team will review it and contact you within 24-48 hours.
              </p>
            </div>
            <Button onClick={handleClose} className="w-full">
              Close
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Current number display */}
            <div className="p-3 rounded-lg bg-muted/50 border">
              <p className="text-xs text-muted-foreground mb-1">Current M-Pesa Number</p>
              <p className="font-medium">{currentPhone || "Not set"}</p>
            </div>

            {/* New phone number */}
            <div className="space-y-2">
              <Label htmlFor="new-phone">New M-Pesa Number (Safaricom Only)</Label>
              <Input
                id="new-phone"
                placeholder="+254712345678"
                value={newPhone}
                onChange={(e) => {
                  setNewPhone(e.target.value);
                  if (errors.phone) setErrors(prev => ({ ...prev, phone: undefined }));
                }}
                className={errors.phone ? "border-destructive" : ""}
              />
              {errors.phone && (
                <p className="text-xs text-destructive">{errors.phone}</p>
              )}
            </div>

            {/* Reason for change */}
            <div className="space-y-2">
              <Label htmlFor="reason">Reason for Change</Label>
              <Textarea
                id="reason"
                placeholder="Please explain why you need to change your payment number..."
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  if (errors.reason) setErrors(prev => ({ ...prev, reason: undefined }));
                }}
                rows={3}
                maxLength={500}
                className={errors.reason ? "border-destructive" : ""}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                {errors.reason ? (
                  <p className="text-destructive">{errors.reason}</p>
                ) : (
                  <span>Minimum 10 characters</span>
                )}
                <span>{reason.length}/500</span>
              </div>
            </div>

            {/* Security notice */}
            <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
              <Shield className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-xs text-amber-800 dark:text-amber-200">
                For security, we may contact you to verify your identity before processing this change.
              </AlertDescription>
            </Alert>

            {/* Submit button */}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={handleClose} className="flex-1">
                Cancel
              </Button>
              <Button 
                onClick={handleSubmit} 
                disabled={loading || !newPhone || !reason}
                className="flex-1"
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Submit Request
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>

      <TwoFactorConfirmDialog
        open={show2FAConfirm}
        onOpenChange={setShow2FAConfirm}
        onConfirmed={executeSubmit}
        title="Verify to Change Payment Number"
        description="Enter your 2FA code to confirm the payment method change request"
      />
    </>
  );
};
