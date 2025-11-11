import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { User, Mail, Phone, MapPin, LogOut, Edit, AlertCircle, CheckCircle, Clock, Key, Eye, EyeOff, Wallet } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect } from "react";
import { PaymentMethodCard } from "@/components/PaymentMethodCard";
import { PaymentDetailsSetup } from "@/components/PaymentDetailsSetup";

const Profile = () => {
  const navigate = useNavigate();
  const { user, profile, signOut, refreshProfile } = useAuth();
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [showPaymentSetup, setShowPaymentSetup] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [loadingMethods, setLoadingMethods] = useState(true);

  useEffect(() => {
    fetchPaymentMethods();
  }, []);

  const fetchPaymentMethods = async () => {
    try {
      setLoadingMethods(true);
      const { data, error } = await supabase.functions.invoke('payment-methods/list');
      if (error) throw error;
      setPaymentMethods(data.methods || []);
    } catch (error: any) {
      console.error('Error fetching payment methods:', error);
    } finally {
      setLoadingMethods(false);
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      const { error } = await supabase.functions.invoke(`payment-methods/set-default/${id}`, {
        method: 'POST',
      });
      if (error) throw error;
      toast.success("Default payment method updated");
      await fetchPaymentMethods();
    } catch (error: any) {
      toast.error(error.message || "Failed to set default");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.functions.invoke(`payment-methods/delete/${id}`, {
        method: 'DELETE',
      });
      if (error) throw error;
      toast.success("Payment method deleted");
      await fetchPaymentMethods();
    } catch (error: any) {
      toast.error(error.message || "Failed to delete payment method");
    }
  };

  const handlePaymentSetupComplete = async () => {
    setShowPaymentSetup(false);
    await fetchPaymentMethods();
    await refreshProfile();
  };

  const handleLogout = async () => {
    const { error } = await signOut();
    if (error) {
      toast.error("Failed to log out");
      return;
    }
    toast.success("Logged out successfully");
    navigate("/");
  };

  const handlePasswordUpdate = async () => {
    if (!newPassword || newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("Passwords don't match");
      return;
    }

    setIsUpdatingPassword(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) throw error;

      toast.success("Password updated successfully");
      setIsPasswordDialogOpen(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error: any) {
      toast.error(error.message || "Failed to update password");
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  if (!profile) {
    return (
      <Layout>
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
    <Layout>
      <PaymentDetailsSetup open={showPaymentSetup} onComplete={handlePaymentSetupComplete} />
      <div className="container px-3 sm:px-4 py-4 sm:py-6 pb-20 sm:pb-24 max-w-2xl mx-auto space-y-4 sm:space-y-6">
        {/* Profile Header */}
        <Card>
          <CardContent className="pt-4 sm:pt-6 px-4 sm:px-6 pb-4 sm:pb-6">
            <div className="flex flex-col items-center text-center space-y-3 sm:space-y-4">
              <Avatar className="h-20 w-20 sm:h-24 sm:w-24">
                <AvatarFallback className="text-xl sm:text-2xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground">
                  {profile.full_name.split(" ").map(n => n[0]).join("")}
                </AvatarFallback>
              </Avatar>
              <div className="space-y-1">
                <h2 className="text-xl sm:text-2xl font-bold text-foreground break-words">{profile.full_name}</h2>
                <p className="text-sm sm:text-base text-muted-foreground">Member since {new Date(profile.created_at).toLocaleDateString()}</p>
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
              <Button
                onClick={() => navigate("/kyc-upload")}
                className="w-full text-sm sm:text-base"
              >
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
            <div className="flex justify-between items-center gap-2">
              <div>
                <CardTitle className="text-lg sm:text-xl flex items-center gap-2">
                  <Wallet className="h-5 w-5" />
                  Payment Methods
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm mt-1">
                  Manage your payout methods (up to 3)
                </CardDescription>
              </div>
              {paymentMethods.length < 3 && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setShowPaymentSetup(true)}
                  className="text-xs sm:text-sm"
                >
                  Add Method
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3 px-4 sm:px-6 pb-4 sm:pb-6">
            {loadingMethods ? (
              <p className="text-sm text-muted-foreground">Loading payment methods...</p>
            ) : paymentMethods.length === 0 ? (
              <div className="text-center py-6 space-y-3">
                <p className="text-sm text-muted-foreground">No payment methods added yet</p>
                <Button onClick={() => setShowPaymentSetup(true)} size="sm">
                  Add Payment Method
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {paymentMethods.map((method) => (
                  <PaymentMethodCard
                    key={method.id}
                    method={method}
                    onSetDefault={handleSetDefault}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Security */}
        <Card>
          <CardHeader className="px-4 sm:px-6 py-4 sm:py-6">
            <CardTitle className="text-lg sm:text-xl">Security</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Manage your account security</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 px-4 sm:px-6 pb-4 sm:pb-6">
            <Dialog open={isPasswordDialogOpen} onOpenChange={setIsPasswordDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-sm sm:text-base">
                  <Key className="mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  Change Password
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-[95vw] sm:max-w-md mx-auto">
                <DialogHeader>
                  <DialogTitle className="text-lg sm:text-xl">Change Password</DialogTitle>
                  <DialogDescription className="text-xs sm:text-sm">
                    Enter your new password below. Make sure it's at least 8 characters long.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3 sm:space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="new-password" className="text-xs sm:text-sm">New Password</Label>
                    <div className="relative">
                      <Input
                        id="new-password"
                        type={showNewPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Enter new password"
                        className="text-sm sm:text-base pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full px-2 sm:px-3 hover:bg-transparent"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                      >
                        {showNewPassword ? (
                          <EyeOff className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-password" className="text-xs sm:text-sm">Confirm New Password</Label>
                    <div className="relative">
                      <Input
                        id="confirm-password"
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Confirm new password"
                        className="text-sm sm:text-base pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full px-2 sm:px-3 hover:bg-transparent"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <Button 
                    onClick={handlePasswordUpdate} 
                    className="w-full text-sm sm:text-base"
                    disabled={isUpdatingPassword}
                  >
                    {isUpdatingPassword ? "Updating..." : "Update Password"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>

        {/* Actions */}
        <Card>
          <CardContent className="pt-4 sm:pt-6 px-4 sm:px-6 pb-4 sm:pb-6">
            <Button
              variant="destructive"
              className="w-full text-sm sm:text-base"
              onClick={handleLogout}
            >
              <LogOut className="mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" />
              Logout
            </Button>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default Profile;
