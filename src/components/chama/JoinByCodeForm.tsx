import { useState, useCallback } from "react";
import { useDebounceAction } from "@/hooks/useDebounceAction";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Users, Loader2, CheckCircle, AlertCircle, UserPlus, Calendar, Coins } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

interface ChamaPreview {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  contribution_amount: number;
  contribution_frequency: string;
  max_members: number;
  current_members?: number;
}

interface JoinByCodeFormProps {
  onJoinSuccess?: () => void;
}

export function JoinByCodeForm({ onJoinSuccess }: JoinByCodeFormProps) {
  const [code, setCode] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [chamaPreview, setChamaPreview] = useState<ChamaPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"input" | "preview" | "success">("input");
  
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const formatCode = (value: string) => {
    // Remove non-alphanumeric and uppercase
    return value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 8);
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCode(e.target.value);
    setCode(formatted);
    setError(null);
    setChamaPreview(null);
    setStep("input");
  };

  const validateCode = async () => {
    if (!code || code.length < 6) {
      setError("Please enter a valid 8-character code");
      return;
    }

    if (!user) {
      toast.error("Please sign in to join a Chama");
      navigate("/auth", { state: { returnTo: `/chama/join?code=${code}` } });
      return;
    }

    if (profile?.kyc_status !== "approved") {
      setError("Complete your KYC verification to join a Chama");
      return;
    }

    setIsValidating(true);
    setError(null);

    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;

      // Use action-based routing for validation
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chama-invite`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ action: "validate", code }),
        }
      );

      const result = await response.json();

      if (!response.ok || !result.valid) {
        // Handle specific error cases
        const errorMessage = result.error || result.message || "Invalid code";
        
        if (errorMessage.toLowerCase().includes("expired")) {
          setError("This code has expired. Ask the manager for a new one.");
        } else if (errorMessage.toLowerCase().includes("used")) {
          setError("This code has already been used.");
        } else if (errorMessage.toLowerCase().includes("not found") || errorMessage.toLowerCase().includes("invalid")) {
          setError("This code doesn't exist. Please check and try again.");
        } else {
          setError(errorMessage);
        }
        return;
      }

      // Success - show chama preview
      setChamaPreview(result.data?.chama || result.chama);
      setStep("preview");
    } catch (err: any) {
      console.error("Code validation error:", err);
      setError("Failed to validate code. Please try again.");
    } finally {
      setIsValidating(false);
    }
  };

  const submitJoinRequestInner = useCallback(async () => {
    if (!chamaPreview || !user) return;

    setIsJoining(true);
    setError(null);

    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;

      if (!token) {
        toast.error("Session expired. Please sign in again.");
        navigate("/auth");
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chama-join`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            invite_code: code,
            chama_id: chamaPreview.id,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        const errorMessage = result.error || result.details || "Failed to submit join request";
        
        if (errorMessage.toLowerCase().includes("already a member")) {
          setError("You're already a member of this Chama!");
        } else if (errorMessage.toLowerCase().includes("pending")) {
          setError("You already have a pending request for this Chama.");
        } else if (errorMessage.toLowerCase().includes("kyc")) {
          setError("Complete your verification to join a Chama.");
        } else if (errorMessage.toLowerCase().includes("not active")) {
          setError("This Chama is not accepting new members.");
        } else {
          setError(errorMessage);
        }
        return;
      }

      // Success!
      setStep("success");
      toast.success("Join request submitted! Awaiting manager approval.");
      onJoinSuccess?.();
      
      // Reset form after a delay
      setTimeout(() => {
        setCode("");
        setChamaPreview(null);
        setStep("input");
      }, 5000);
    } catch (err: any) {
      console.error("Join request error:", err);
      setError("Failed to submit request. Please try again.");
    } finally {
      setIsJoining(false);
    }
  }, [chamaPreview, user, code, navigate, onJoinSuccess]);

  const { execute: submitJoinRequest, isProcessing: isJoinProcessing } = useDebounceAction(submitJoinRequestInner);

  const getFrequencyLabel = (frequency: string) => {
    switch (frequency) {
      case "daily": return "Daily";
      case "weekly": return "Weekly";
      case "bi-weekly": return "Bi-Weekly";
      case "monthly": return "Monthly";
      default: return frequency;
    }
  };

  const resetForm = () => {
    setCode("");
    setChamaPreview(null);
    setError(null);
    setStep("input");
  };

  return (
    <Card className="border-2 border-dashed border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader className="pb-3">
        <CardTitle className="text-base sm:text-lg flex items-center gap-2">
          <UserPlus className="h-5 w-5 text-primary" />
          Join a Chama
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          Enter an invite code to request membership
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {step === "input" && (
          <>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                placeholder="Enter code (e.g., 2F5XHCTE)"
                value={code}
                onChange={handleCodeChange}
                className="flex-1 text-center text-lg font-mono tracking-widest uppercase h-12"
                maxLength={8}
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
              />
              <Button
                onClick={validateCode}
                disabled={code.length < 6 || isValidating}
                className="h-12 px-6 min-w-[140px]"
              >
                {isValidating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Checking...
                  </>
                ) : (
                  "Verify Code"
                )}
              </Button>
            </div>

            {error && (
              <Alert variant="destructive" className="py-2">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs sm:text-sm">{error}</AlertDescription>
              </Alert>
            )}
          </>
        )}

        {step === "preview" && chamaPreview && (
          <div className="space-y-4">
            <div className="bg-background border rounded-lg p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-foreground">{chamaPreview.name}</h3>
                  {chamaPreview.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                      {chamaPreview.description}
                    </p>
                  )}
                </div>
                <Badge variant="secondary" className="shrink-0">
                  <Users className="h-3 w-3 mr-1" />
                  {chamaPreview.max_members} max
                </Badge>
              </div>
              
              <div className="flex flex-wrap gap-3 pt-2 border-t">
                <div className="flex items-center gap-1.5 text-sm">
                  <Coins className="h-4 w-4 text-primary" />
                  <span className="font-medium">KES {chamaPreview.contribution_amount.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>{getFrequencyLabel(chamaPreview.contribution_frequency)}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                onClick={resetForm}
                className="flex-1 h-11"
              >
                Cancel
              </Button>
              <Button
                onClick={submitJoinRequest}
                disabled={isJoining || isJoinProcessing}
                className="flex-1 h-11"
              >
                {isJoining ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Request to Join
                  </>
                )}
              </Button>
            </div>

            {error && (
              <Alert variant="destructive" className="py-2">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs sm:text-sm">{error}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {step === "success" && (
          <div className="text-center py-4 space-y-3">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
              <CheckCircle className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Request Submitted!</h3>
              <p className="text-sm text-muted-foreground mt-1">
                The manager has been notified. You'll gain access once approved.
              </p>
            </div>
            <Button variant="outline" onClick={resetForm} size="sm">
              Join Another Chama
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
