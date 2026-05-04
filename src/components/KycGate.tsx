import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, Clock, ShieldCheck, XCircle, Loader2 } from "lucide-react";

interface KycGateProps {
  children: React.ReactNode;
  /** Human-readable label for what the user is trying to create, e.g. "welfare group", "chama", "campaign", "organization". */
  featureLabel: string;
}

/**
 * Gates child content behind KYC approval, showing a clear, friendly card
 * explaining the user's current verification state instead of a blank screen
 * or a generic redirect.
 *
 * States handled:
 *  - profile loading            -> small inline spinner
 *  - approved                   -> renders children
 *  - never submitted KYC        -> amber CTA card linking to /kyc-upload
 *  - submitted, awaiting review -> calm info card asking the user to wait
 *  - rejected                   -> red card with reason + resubmit CTA
 */
export const KycGate = ({ children, featureLabel }: KycGateProps) => {
  const { profile, loading } = useAuth();
  const navigate = useNavigate();

  // Profile not loaded yet — show a lightweight inline loader.
  if (loading || !profile) {
    return (
      <Card>
        <CardContent className="py-10 flex flex-col items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <p className="text-sm">Checking your verification status…</p>
        </CardContent>
      </Card>
    );
  }

  const status = profile.kyc_status;
  const submitted = !!profile.kyc_submitted_at;

  // Approved — render the actual create form.
  if (status === "approved") {
    return <>{children}</>;
  }

  // Rejected — explain and let them resubmit.
  if (status === "rejected") {
    return (
      <Card className="border-destructive/40 bg-destructive/5">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-destructive/10">
              <XCircle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <CardTitle>Verification was not approved</CardTitle>
              <CardDescription>
                You need an approved verification before you can create a {featureLabel}.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {profile.kyc_rejection_reason && (
            <div className="rounded-md border border-destructive/30 bg-background p-3 text-sm">
              <p className="font-medium mb-1">Reason from our team:</p>
              <p className="text-muted-foreground">{profile.kyc_rejection_reason}</p>
            </div>
          )}
          <Button onClick={() => navigate("/kyc-upload")} className="w-full sm:w-auto">
            Resubmit verification
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Submitted, awaiting admin review.
  if (submitted) {
    return (
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Clock className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle>Verification under review</CardTitle>
              <CardDescription>
                Thanks — we received your documents. Please wait while our team reviews them.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            You'll be able to create a {featureLabel} once an admin approves your verification.
            Reviews are usually completed within 24 hours. We'll notify you as soon as it's done.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => navigate("/")}>
              Back to Home
            </Button>
            <Button variant="ghost" onClick={() => navigate("/profile")}>
              View my profile
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Never submitted KYC — invite them to upload.
  return (
    <Card className="border-warning/40 bg-warning/5">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-warning/10">
            <AlertCircle className="h-5 w-5 text-warning" />
          </div>
          <div>
            <CardTitle>Verify your identity first</CardTitle>
            <CardDescription>
              To create a {featureLabel}, please complete a quick identity verification.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
          <p>
            This protects your group members and donors. It only takes a minute — upload your ID and
            a selfie, then wait for admin approval.
          </p>
        </div>
        <Button onClick={() => navigate("/kyc-upload")} className="w-full sm:w-auto">
          Upload verification documents
        </Button>
      </CardContent>
    </Card>
  );
};

export default KycGate;
