import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Key, Eye, EyeOff, Fingerprint, Trash2, Plus, Shield, CheckCircle, Lock } from "lucide-react";
import { TwoFactorSetup } from "@/components/TwoFactorSetup";
import { TwoFactorConfirmDialog } from "@/components/TwoFactorConfirmDialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect } from "react";
import { useWebAuthn } from "@/hooks/useWebAuthn";
import { useWebAuthnManagement } from "@/hooks/useWebAuthnManagement";
import { useNativeBiometrics } from "@/hooks/useNativeBiometrics";
import {
  isBiometricEnabled,
  setStoredSession,
  setBiometricEnabled as setBiometricEnabledStorage,
  hardLogoutStorage,
} from "@/lib/secureStorage";
import { format } from "date-fns";

const Security = () => {
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  const { isSupported: isWebAuthnSupported, registerCredential } = useWebAuthn();
  const { isLoading: isLoadingCredentials, credentials, listCredentials, deleteCredential } = useWebAuthnManagement();
  const [credentialToDelete, setCredentialToDelete] = useState<string | null>(null);
  const [isAddingBiometric, setIsAddingBiometric] = useState(false);

  const { isNativeApp: isNative, isAvailable: isNativeBiometricAvailable, authenticate: nativeAuthenticate } = useNativeBiometrics();
  const [nativeBiometricEnabled, setNativeBiometricEnabled] = useState(false);
  const [isTogglingNativeBiometric, setIsTogglingNativeBiometric] = useState(false);
  const [showDisableBiometricDialog, setShowDisableBiometricDialog] = useState(false);

  const [is2FAEnabled, setIs2FAEnabled] = useState(false);
  const [show2FAForPassword, setShow2FAForPassword] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!isNative) {
        if (!cancelled) setNativeBiometricEnabled(false);
        return;
      }
      const enabled = await isBiometricEnabled();
      if (!cancelled) setNativeBiometricEnabled(enabled);
    };
    void load();
    return () => { cancelled = true; };
  }, [isNative]);

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
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success("Password updated successfully");
      setIsPasswordDialogOpen(false);
      setNewPassword("");
      setConfirmPassword("");
    } catch (error: any) {
      toast.error(error.message || "Failed to update password");
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleEnableNativeBiometric = async () => {
    setIsTogglingNativeBiometric(true);
    try {
      const available = await isNativeBiometricAvailable();
      if (!available) {
        toast.error('Fingerprint is not available on this device. Please set up fingerprint in your phone Settings → Security → Fingerprint.');
        setIsTogglingNativeBiometric(false);
        return;
      }
      const result = await nativeAuthenticate('Scan your fingerprint to enable fingerprint login');
      if (result.success) {
        const { data } = await supabase.auth.getSession();
        const session = data.session;
        if (session?.access_token && session.refresh_token) {
          await setStoredSession({ access_token: session.access_token, refresh_token: session.refresh_token });
          await setBiometricEnabledStorage(true);
          setNativeBiometricEnabled(true);
          toast.success('Fingerprint login enabled!');
        } else {
          toast.error('Could not save session. Please log out and log in again first.');
        }
      } else {
        toast.error(result.error || 'Fingerprint verification failed.');
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to enable fingerprint login');
    } finally {
      setIsTogglingNativeBiometric(false);
    }
  };

  const handleDisableNativeBiometric = async () => {
    await hardLogoutStorage();
    setNativeBiometricEnabled(false);
    setShowDisableBiometricDialog(false);
    toast.success('Fingerprint login disabled.');
  };

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
    if (result.success) setCredentialToDelete(null);
  };

  return (
    <Layout title="Security">
      <div className="container px-3 sm:px-4 py-4 sm:py-6 pb-20 sm:pb-24 max-w-2xl mx-auto space-y-4 sm:space-y-6">

        <Card>
          <CardHeader className="px-4 sm:px-6 py-4 sm:py-6">
            <CardTitle className="text-lg sm:text-xl flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Security Settings
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              Manage your password, fingerprint login, and two-factor authentication.
            </CardDescription>
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
                  <DialogTitle>Change Password</DialogTitle>
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
                        className="text-sm pr-10"
                      />
                      <Button
                        type="button" variant="ghost" size="icon"
                        className="absolute right-0 top-0 h-full px-2 hover:bg-transparent"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                      >
                        {showNewPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
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
                        className="text-sm pr-10"
                      />
                      <Button
                        type="button" variant="ghost" size="icon"
                        className="absolute right-0 top-0 h-full px-2 hover:bg-transparent"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      >
                        {showConfirmPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                      </Button>
                    </div>
                  </div>
                  <Button onClick={handlePasswordUpdate} className="w-full" disabled={isUpdatingPassword}>
                    {isUpdatingPassword ? "Updating..." : "Update Password"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <TwoFactorConfirmDialog
              open={show2FAForPassword}
              onOpenChange={setShow2FAForPassword}
              onConfirmed={executePasswordUpdate}
              title="Verify to Change Password"
              description="Enter your 2FA code to confirm password change"
            />

            {/* Native Fingerprint Login */}
            {isNative && (
              <div className="space-y-3 pt-4 border-t border-border">
                <div className="flex items-center gap-2">
                  <Fingerprint className="h-5 w-5 text-primary" />
                  <h3 className="text-base sm:text-lg font-semibold">Fingerprint Login</h3>
                </div>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Use your fingerprint to sign in faster. Your fingerprint data never leaves your device.
                </p>

                {nativeBiometricEnabled ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 p-3 bg-primary/10 rounded-lg border border-primary/20">
                      <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" />
                      <p className="text-xs sm:text-sm font-medium">Fingerprint login is enabled</p>
                    </div>
                    <Button
                      variant="outline"
                      className="w-full text-destructive border-destructive hover:bg-destructive/10"
                      onClick={() => setShowDisableBiometricDialog(true)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Disable Fingerprint Login
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg border border-border">
                      <Lock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <p className="text-xs sm:text-sm text-muted-foreground">Fingerprint login is not enabled</p>
                    </div>
                    <Button
                      onClick={handleEnableNativeBiometric}
                      disabled={isTogglingNativeBiometric}
                      className="w-full"
                    >
                      <Fingerprint className="mr-2 h-4 w-4" />
                      {isTogglingNativeBiometric ? 'Setting up...' : 'Enable Fingerprint Login'}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* WebAuthn (Browser) */}
            {!isNative && isWebAuthnSupported() && (
              <div className="space-y-4 pt-4 border-t border-border">
                <div className="flex items-center gap-2">
                  <Fingerprint className="h-5 w-5 text-primary" />
                  <h3 className="text-base sm:text-lg font-semibold">Biometric Login</h3>
                </div>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Manage biometric authentication devices for this browser.
                </p>

                {isLoadingCredentials ? (
                  <div className="text-xs text-muted-foreground">Loading devices...</div>
                ) : credentials.length === 0 ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg border border-border">
                      <Shield className="h-4 w-4 text-muted-foreground" />
                      <p className="text-xs sm:text-sm text-muted-foreground">No biometric devices registered</p>
                    </div>
                    <Button onClick={handleAddBiometric} disabled={isAddingBiometric} className="w-full">
                      <Plus className="mr-2 h-4 w-4" />
                      {isAddingBiometric ? 'Adding...' : 'Add Biometric Device'}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {credentials.map((credential) => (
                      <div key={credential.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border border-border">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <Fingerprint className="h-4 w-4 text-primary flex-shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm truncate">{credential.device_name || 'Biometric Device'}</p>
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
                        <Button variant="ghost" size="sm" onClick={() => setCredentialToDelete(credential.credential_id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                    <Button onClick={handleAddBiometric} disabled={isAddingBiometric} variant="outline" className="w-full">
                      <Plus className="mr-2 h-4 w-4" />
                      {isAddingBiometric ? 'Adding...' : 'Add Another Device'}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Two-Factor Authentication */}
            <div className="pt-4 border-t border-border">
              <TwoFactorSetup isEnabled={is2FAEnabled} onStatusChange={check2FAStatus} />
            </div>

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
              You will need to use your password to log in after disabling fingerprint login.
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

export default Security;
