import { Layout } from "@/components/Layout";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { User, Mail, Phone, LogOut, Edit, AlertCircle, CheckCircle, Clock, Wallet, Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { PaymentMethodsManager } from "@/components/PaymentMethodsManager";
import { useNativeBiometrics } from "@/hooks/useNativeBiometrics";

const Profile = () => {
  const navigate = useNavigate();
  const { profile, signOut, lockApp, refreshProfile } = useAuth();
  const { isNativeApp: isNative } = useNativeBiometrics();

  const handleLogout = async () => {
    const { error } = await signOut();
    if (error) {
      toast.error("Failed to log out");
      return;
    }
    toast.success("Logged out successfully");
    navigate("/");
  };

  const handleLockApp = async () => {
    try {
      await lockApp();
      toast.success("App locked. Use fingerprint to unlock.");
      navigate("/auth");
    } catch (err) {
      toast.error("Failed to lock app");
    }
  };

  if (!profile) {
    return (
      <Layout title="Profile">
        <div className="container px-4 py-6 pb-24 max-w-2xl mx-auto">
          <p>Loading...</p>
        </div>
      </Layout>
    );
  }

  const getKYCStatusBadge = () => {
    if (!profile.kyc_submitted_at) {
      return (
        <Badge variant="secondary" className="flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          Not Submitted
        </Badge>
      );
    }

    switch (profile.kyc_status) {
      case 'approved':
        return (
          <Badge className="bg-green-500 flex items-center gap-1">
            <CheckCircle className="h-3 w-3" />
            Approved
          </Badge>
        );
      case 'rejected':
        return (
          <Badge variant="destructive" className="flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            Rejected
          </Badge>
        );
      case 'pending':
      default:
        return (
          <Badge variant="secondary" className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Pending Review
          </Badge>
        );
    }
  };

  return (
    <Layout title="Profile">
      <div className="container px-3 sm:px-4 py-4 sm:py-6 pb-20 sm:pb-24 max-w-2xl mx-auto space-y-4 sm:space-y-6">

        {/* Profile Header */}
        <Card>
          <CardContent className="pt-4 sm:pt-6 px-4 sm:px-6 pb-4 sm:pb-6">
            <div className="flex flex-col items-center text-center space-y-3 sm:space-y-4">
              <Avatar className="h-20 w-20 sm:h-24 sm:w-24">
                <AvatarFallback className="text-xl sm:text-2xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground">
                  {profile.full_name?.split(" ").map(n => n[0]).join("") || "?"}
                </AvatarFallback>
              </Avatar>
              <div className="space-y-1">
                <h2 className="text-xl sm:text-2xl font-bold text-foreground break-words">{profile.full_name}</h2>
                <p className="text-sm sm:text-base text-muted-foreground">Member since {formatDate(profile.created_at)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* KYC Status */}
        <Card>
          <CardHeader className="px-4 sm:px-6 py-4 sm:py-6">
            <CardTitle className="text-lg sm:text-xl">Verification Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 sm:space-y-4 px-4 sm:px-6 pb-4 sm:pb-6">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 sm:gap-0">
              <span className="text-sm sm:text-base text-muted-foreground">KYC Status</span>
              {getKYCStatusBadge()}
            </div>
            {profile.kyc_status === 'rejected' && profile.kyc_rejection_reason && (
              <div className="bg-destructive/10 p-3 sm:p-4 rounded">
                <p className="text-xs sm:text-sm font-medium mb-1">Rejection Reason:</p>
                <p className="text-xs sm:text-sm break-words">{profile.kyc_rejection_reason}</p>
              </div>
            )}
            {!profile.kyc_submitted_at && (
              <Button onClick={() => navigate("/kyc-upload")} className="w-full text-sm sm:text-base">
                Complete KYC Verification
              </Button>
            )}
            {profile.kyc_status === 'pending' && (
              <p className="text-xs sm:text-sm text-muted-foreground">
                Your documents are being reviewed by our team. This usually takes 1-2 business days.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Personal Information */}
        <Card>
          <CardHeader className="px-4 sm:px-6 py-4 sm:py-6">
            <div className="flex justify-between items-center gap-2">
              <CardTitle className="text-lg sm:text-xl">Personal Information</CardTitle>
              <Button variant="ghost" size="sm" className="h-8 w-8 sm:h-9 sm:w-9 p-0">
                <Edit className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 sm:space-y-4 px-4 sm:px-6 pb-4 sm:pb-6">
            <div className="space-y-1.5 sm:space-y-2">
              <Label className="text-xs sm:text-sm text-muted-foreground">Full Name</Label>
              <div className="flex items-center gap-2">
                <User className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground flex-shrink-0" />
                <span className="text-sm sm:text-base text-foreground break-words">{profile.full_name}</span>
              </div>
            </div>
            <div className="space-y-1.5 sm:space-y-2">
              <Label className="text-xs sm:text-sm text-muted-foreground">Email</Label>
              <div className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground flex-shrink-0" />
                <span className="text-sm sm:text-base text-foreground break-all">{profile.email}</span>
              </div>
            </div>
            <div className="space-y-1.5 sm:space-y-2">
              <Label className="text-xs sm:text-sm text-muted-foreground">Phone</Label>
              <div className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground flex-shrink-0" />
                <span className="text-sm sm:text-base text-foreground">{profile.phone}</span>
              </div>
            </div>
            <div className="space-y-1.5 sm:space-y-2">
              <Label className="text-xs sm:text-sm text-muted-foreground">ID Number</Label>
              <div className="flex items-center gap-2">
                <User className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground flex-shrink-0" />
                <span className="text-sm sm:text-base text-foreground">{profile.id_number}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payment Methods */}
        <Card>
          <CardHeader className="px-4 sm:px-6 py-4 sm:py-6">
            <div>
              <CardTitle className="text-lg sm:text-xl flex items-center gap-2">
                <Wallet className="h-5 w-5" />
                Payment Methods
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm mt-1">
                Manage your payout methods (up to 3)
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
            <PaymentMethodsManager
              userName={profile.full_name}
              onUpdate={refreshProfile}
            />
          </CardContent>
        </Card>

        {/* Account actions */}
        <Card>
          <CardHeader className="px-4 sm:px-6 py-4 sm:py-6">
            <CardTitle className="text-lg sm:text-xl">Account</CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              For password, fingerprint and 2FA, open the Security page.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 px-4 sm:px-6 pb-4 sm:pb-6">
            {isNative && (
              <Button
                variant="outline"
                className="w-full justify-start text-sm sm:text-base"
                onClick={handleLockApp}
              >
                <Lock className="mr-2 h-4 w-4" />
                Lock App (use fingerprint to unlock)
              </Button>
            )}
            <Button
              variant="outline"
              className="w-full justify-start text-sm sm:text-base text-destructive border-destructive hover:bg-destructive/10"
              onClick={handleLogout}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Log Out
            </Button>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default Profile;
