import { Layout } from "@/components/Layout";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { User, Mail, Phone, LogOut, Edit, AlertCircle, CheckCircle, Clock, Key, Eye, EyeOff, Wallet, Fingerprint, Trash2, Plus, Shield } from "lucide-react";
import { TwoFactorSetup } from "@/components/TwoFactorSetup";
import { TwoFactorConfirmDialog } from "@/components/TwoFactorConfirmDialog";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect } from "react";
import { PaymentMethodsManager } from "@/components/PaymentMethodsManager";
import { useWebAuthn } from "@/hooks/useWebAuthn";
import { useWebAuthnManagement } from "@/hooks/useWebAuthnManagement";
import { useNativeBiometrics } from "@/hooks/useNativeBiometrics";
import {
  isNativeBiometricEnabled as readNativeBiometricEnabled,
  saveCurrentSessionForBiometric,
  clearBiometricSession,
} from "@/lib/nativeBiometricSession";
import { format } from "date-fns";

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

  // WebAuthn (browser) biometric management
  const { isSupported: isWebAuthnSupported, registerCredential } = useWebAuthn();
  const { isLoading: isLoadingCredentials, credentials, listCredentials, deleteCredential } = useWebAuthnManagement();
  const [credentialToDelete, setCredentialToDelete] = useState<string | null>(null);
  const [isAddingBiometric, setIsAddingBiometric] = useState(false);

  // Native biometric management (Android app)
  const { isNativeApp: isNative, isAvailable: isNativeBiometricAvailable, authenticate: nativeAuthenticate } = useNativeBiometrics();
  const [nativeBiometricEnabled, setNativeBiometricEnabled] = useState(false);
  const [isTogglingNativeBiometric, setIsTogglingNativeBiometric] = useState(false);
  const [showDisableBiometricDialog, setShowDisableBiometricDialog] = useState(false);

  const [is2FAEnabled, setIs2FAEnabled] = useState(false);
  const [show2FAForPassword, setShow2FAForPassword] = useState(false);

  // Load native biometric state from shared helper
  useEffect(() => {
    if (isNative) {
      setNativeBiometricEnabled(readNativeBiometricEnabled());
    }
  }, [isNative]);

  // Check 2FA status
  const check2FAStatus = async () => {
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
    } catch (error) {
      console.error('Failed to check 2FA status:', error);
    }
  };

  useEffect(() => {
    if (isWebAuthnSupported()) {
      listCredentials();
    }
    check2FAStatus();
  }, []);

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

    if (is2FAEnabled) {
      setShow2FAForPassword(true);
      return;
    }

    await executePasswordUpdate();
  };

  const executePasswordUpdate = async () => {
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

  // Enable native fingerprint login
  const handleEnableNativeBiometric = async () => {
    setIsTogglingNativeBiometric(true);
    try {
      // Check if biometric is available on this device
      const available = await isNativeBiometricAvailable();
      if (!available) {
        toast.error('Fingerprint is not available on this device. Please set up fingerprint in your phone Settings → Security → Fingerprint.');
        setIsTogglingNativeBiometric(false);
        return;
      }

      // Ask user to verify fingerprint first
      const result = await nativeAuthenticate('Scan your fingerprint to enable fingerprint login');
      if (result.success) {
        // Store flag and current session
        localStorage.setItem('nativeBiometricEnabled', 'true');
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData.session) {
          localStorage.setItem('biometricSession', JSON.stringify({
            access_token: sessionData.session.access_token,
            refresh_token: sessionData.session.refresh_token,
          }));
          setNativeBiometricEnabled(true);
          toast.success('Fingerprint login enabled! Use your fingerprint next time you sign in.');
        } else {
          toast.error('Could not save session. Please log out and log in again first.');
          setIsTogglingNativeBiometric(false);
          return;
        }
      } else {
        toast.error(result.error || 'Fingerprint verification failed. Please try again.');
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to enable fingerprint login');
    } finally {
      setIsTogglingNativeBiometric(false);
    }
  };

  // Disable native fingerprint login
  const handleDisableNativeBiometric = () => {
    localStorage.removeItem('nativeBiometricEnabled');
    localStorage.removeItem('biometricSession');
    setNativeBiometricEnabled(false);
    setShowDisableBiometricDialog(false);
    toast.success('Fingerprint login disabled.');
  };

  // WebAuthn (browser) biometric management
  const handleAddBiometric = async () => {
    setIsAddingBiometric(true);
    try {
      const result = await registerCredential();
      if (result.success) {
        toast.success('Biometric device added successfully!');
        await listCredentials();
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to add biometric device');
    } finally {
      setIsAddingBiometric(false);
    }
  };

  const handleDeleteBiometric = async () => {
    if (!credentialToDelete) return;
    const result = await deleteCredential(credentialToDelete);
    if (result.success) {
      setCredentialToDelete(null);
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
                Payment Methods Dashboard
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm mt-1">
                Manage your payout methods with transaction limits (up to 3)
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

        {/* Security */}
        <Card>
          <CardHeader className="px-4 sm:px-6 py-4 sm:py-6">
            <CardTitle className="text-lg sm:text-xl">Security</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Manage your account security</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 px-4 sm:px-6 pb-4 sm:pb-6">

            {/* Change Password */}
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

            {/* 2FA Confirmation for Password Change */}
            <TwoFactorConfirmDialog
              open={show2FAForPassword}
              onOpenChange={setShow2FAForPassword}
              onConfirmed={executePasswordUpdate}
              title="Verify to Change Password"
              description="Enter your 2FA code to confirm password change"
            />

            {/* Native Fingerprint Login (Android App Only) */}
            {isNative && (
              <div className="space-y-3 pt-4 border-t border-border">
                <div className="flex items-center gap-2">
                  <Fingerprint className="h-5 w-5 text-primary" />
                  <h3 className="text-base sm:text-lg font-semibold">Fingerprint Login</h3>
                </div>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Use your fingerprint to sign in faster and more securely. Your fingerprint data never leaves your device.
                </p>

                {nativeBiometricEnabled ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 p-3 sm:p-4 bg-green-50 rounded-lg border border-green-200">
                      <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5 text-green-600 flex-shrink-0" />
                      <p className="text-xs sm:text-sm text-green-700 font-medium">
                        Fingerprint login is enabled
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      className="w-full text-sm sm:text-base text-destructive border-destructive hover:bg-destructive/10"
                      onClick={() => setShowDisableBiometricDialog(true)}
                    >
                      <Trash2 className="mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      Disable Fingerprint Login
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 p-3 sm:p-4 bg-muted/50 rounded-lg border border-border">
                      <Shield className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground flex-shrink-0" />
                      <p className="text-xs sm:text-sm text-muted-foreground">
                        Fingerprint login is not enabled
                      </p>
                    </div>
                    <Button
                      onClick={handleEnableNativeBiometric}
                      disabled={isTogglingNativeBiometric}
                      className="w-full text-sm sm:text-base"
                    >
                      <Fingerprint className="mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      {isTogglingNativeBiometric ? 'Setting up...' : 'Enable Fingerprint Login'}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* WebAuthn Biometric (Browser Only) */}
            {!isNative && isWebAuthnSupported() && (
              <div className="space-y-4 pt-4 border-t border-border">
                <div className="flex items-center gap-2">
                  <Fingerprint className="h-5 w-5 text-primary" />
                  <h3 className="text-base sm:text-lg font-semibold">Biometric Login</h3>
                </div>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Manage your biometric authentication devices. Your biometric data never leaves your device.
                </p>

                {isLoadingCredentials ? (
                  <div className="text-xs sm:text-sm text-muted-foreground">Loading devices...</div>
                ) : credentials.length === 0 ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 p-3 sm:p-4 bg-muted/50 rounded-lg border border-border">
                      <Shield className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
                      <p className="text-xs sm:text-sm text-muted-foreground">No biometric devices registered</p>
                    </div>
                    <Button
                      onClick={handleAddBiometric}
                      disabled={isAddingBiometric}
                      className="w-full text-sm sm:text-base"
                    >
                      <Plus className="mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      {isAddingBiometric ? 'Adding...' : 'Add Biometric Device'}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {credentials.map((credential) => (
                      <div
                        key={credential.id}
                        className="flex items-center justify-between p-3 sm:p-4 bg-muted/50 rounded-lg border border-border"
                      >
                        <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                          <Fingerprint className="h-4 w-4 sm:h-5 sm:w-5 text-primary flex-shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm sm:text-base truncate">
                              {credential.device_name || 'Biometric Device'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Registered {format(new Date(credential.created_at), 'MMM d, yyyy')}
                            </p>
                            {credential.last_used_at && (
                              <p className="text-xs text-muted-foreground">
                                Last used {format(new Date(credential.last_used_at), 'MMM d, yyyy')}
                              </p>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setCredentialToDelete(credential.credential_id)}
                          className="flex-shrink-0"
                        >
                          <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      onClick={handleAddBiometric}
                      disabled={isAddingBiometric}
                      variant="outline"
                      className="w-full text-sm sm:text-base"
                    >
                      <Plus className="mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      {isAddingBiometric ? 'Adding...' : 'Add Another Device'}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Two-Factor Authentication */}
            <TwoFactorSetup isEnabled={is2FAEnabled} onStatusChange={check2FAStatus} />

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

      {/* Delete WebAuthn Credential Confirmation */}
      <AlertDialog open={!!credentialToDelete} onOpenChange={() => setCredentialToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Biometric Device?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this biometric device? You'll need to use your password to log in.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteBiometric}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove Device
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Disable Native Fingerprint Confirmation */}
      <AlertDialog open={showDisableBiometricDialog} onOpenChange={setShowDisableBiometricDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable Fingerprint Login?</AlertDialogTitle>
            <AlertDialogDescription>
              You will need to use your password to log in after disabling fingerprint login. You can re-enable it anytime from this settings page.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDisableNativeBiometric}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Disable Fingerprint
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </Layout>
  );
};

export default Profile;
