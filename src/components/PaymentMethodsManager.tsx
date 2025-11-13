import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Smartphone, Building2, AlertCircle, Trash2, CheckCircle, Loader2, Shield, Edit } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PAYMENT_METHOD_LIMITS, formatPaymentMethodLabel } from "@/utils/paymentLimits";

interface PaymentMethod {
  id: string;
  method_type: 'mpesa' | 'airtel_money' | 'bank_account';
  phone_number?: string;
  bank_name?: string;
  account_number?: string;
  account_name?: string;
  is_default: boolean;
  is_verified: boolean;
}

const KENYAN_BANKS = [
  "KCB Bank", "Equity Bank", "Co-operative Bank", "NCBA Bank", "Absa Bank Kenya",
  "Stanbic Bank", "Standard Chartered", "DTB (Diamond Trust Bank)", "I&M Bank",
  "Family Bank", "Prime Bank", "Sidian Bank", "Credit Bank",
];

export const PaymentMethodsManager = ({ 
  userName, 
  onUpdate 
}: { 
  userName: string; 
  onUpdate?: () => void;
}) => {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showOTPDialog, setShowOTPDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [otpAction, setOtpAction] = useState<'delete' | 'verify'>('delete');
  const [otpCode, setOtpCode] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
  const [activeTab, setActiveTab] = useState<'mpesa' | 'airtel_money' | 'bank_account'>('mpesa');

  // Form states
  const [phoneNumber, setPhoneNumber] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchMethods();
  }, []);

  const fetchMethods = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke('payment-methods/list', {
        method: 'GET',
      });
      if (error) throw error;
      setMethods(data.methods || []);
    } catch (error: any) {
      toast.error("Failed to load payment methods");
    } finally {
      setLoading(false);
    }
  };

  const validateNameMatch = (inputName: string): boolean => {
    const normalizedUserName = userName.toLowerCase().replace(/\s+/g, '');
    const normalizedInputName = inputName.toLowerCase().replace(/\s+/g, '');
    return normalizedUserName === normalizedInputName;
  };

  const requestOTP = async (phone: string, action: 'delete' | 'verify') => {
    try {
      const { error } = await supabase.functions.invoke('send-otp', {
        body: { phone },
      });
      if (error) throw error;
      toast.success(`OTP sent to ${phone}`);
      return true;
    } catch (error: any) {
      toast.error(error.message || "Failed to send OTP");
      return false;
    }
  };

  const verifyOTP = async (phone: string, otp: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase.functions.invoke('verify-otp', {
        body: { phone, otp },
      });
      if (error) throw error;
      return data.success === true || data.verified === true;
    } catch (error: any) {
      return false;
    }
  };

  const handleAddMethod = async () => {
    setIsSubmitting(true);
    try {
      const methodData: any = {
        method_type: activeTab,
        is_default: methods.length === 0,
      };

      if (activeTab === 'mpesa' || activeTab === 'airtel_money') {
        if (!phoneNumber.match(/^\+254\d{9}$/)) {
          toast.error("Invalid phone number format. Use +254XXXXXXXXX");
          return;
        }

        // Send OTP for verification
        const otpSent = await requestOTP(phoneNumber, 'verify');
        if (!otpSent) return;

        setSelectedMethod({ ...methodData, phone_number: phoneNumber } as any);
        setOtpAction('verify');
        setShowOTPDialog(true);
        setShowAddDialog(false);
        return;
      } else {
        // Bank account validation
        if (!bankName || !accountNumber || !accountName) {
          toast.error("Please fill in all bank account fields");
          return;
        }

        if (!validateNameMatch(accountName)) {
          toast.error(`Account name must match your ID name: ${userName}`);
          return;
        }

        methodData.bank_name = bankName;
        methodData.account_number = accountNumber;
        methodData.account_name = accountName;
        methodData.is_verified = true; // Bank accounts are auto-verified
      }

      const { error } = await supabase.functions.invoke('payment-methods/create', {
        body: methodData,
      });

      if (error) throw error;

      toast.success("Bank account verified and saved successfully!");
      setShowAddDialog(false);
      resetForm();
      await fetchMethods();
      onUpdate?.();
    } catch (error: any) {
      toast.error(error.message || "Failed to add payment method");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteMethod = async (method: PaymentMethod) => {
    if (method.method_type === 'mpesa' || method.method_type === 'airtel_money') {
      // Send OTP to current number for verification
      const otpSent = await requestOTP(method.phone_number!, 'delete');
      if (!otpSent) return;

      setSelectedMethod(method);
      setOtpAction('delete');
      setShowOTPDialog(true);
    } else {
      // Direct delete for bank accounts
      await deleteMethod(method.id);
    }
  };

  const deleteMethod = async (id: string) => {
    try {
      const { error } = await supabase.functions.invoke(`payment-methods/delete/${id}`, {
        method: 'DELETE',
      });
      if (error) throw error;
      toast.success("Payment method deleted");
      await fetchMethods();
      onUpdate?.();
    } catch (error: any) {
      toast.error(error.message || "Failed to delete");
    }
  };

  const handleOTPSubmit = async () => {
    if (!otpCode || !selectedMethod) return;

    setOtpLoading(true);
    try {
      const phone = otpAction === 'delete' 
        ? selectedMethod.phone_number! 
        : phoneNumber;

      const verified = await verifyOTP(phone, otpCode);

      if (!verified) {
        toast.error("Invalid OTP code");
        return;
      }

      if (otpAction === 'delete') {
        await deleteMethod(selectedMethod.id);
      } else {
        // Complete adding the method after OTP verification
        const { error } = await supabase.functions.invoke('payment-methods/create', {
          body: {
            ...selectedMethod,
            phone_number: phone,
            is_verified: true, // Mark as verified after OTP success
          },
        });

        if (error) throw error;
        toast.success("Payment method verified and saved successfully!");
        await fetchMethods();
        onUpdate?.();
      }

      setShowOTPDialog(false);
      setOtpCode("");
      setSelectedMethod(null);
    } catch (error: any) {
      toast.error(error.message || "Operation failed");
    } finally {
      setOtpLoading(false);
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      const { error } = await supabase.functions.invoke(`payment-methods/set-default/${id}`, {
        method: 'POST',
      });
      if (error) throw error;
      toast.success("Default payment method updated");
      await fetchMethods();
    } catch (error: any) {
      toast.error(error.message || "Failed to set default");
    }
  };

  const resetForm = () => {
    setPhoneNumber("");
    setBankName("");
    setAccountNumber("");
    setAccountName("");
  };

  const getIcon = (type: string) => {
    return type === 'bank_account' ? <Building2 className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />;
  };

  return (
    <div className="space-y-4">
      {/* Transaction Limits Info */}
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription className="text-sm">
          <strong>Daily Transaction Limits:</strong> M-Pesa & Airtel Money: KES 150,000 | Bank Account: KES 500,000
        </AlertDescription>
      </Alert>

      {/* Payment Methods List */}
      <div className="space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : methods.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-sm text-muted-foreground mb-4">No payment methods added yet</p>
              <Button onClick={() => setShowAddDialog(true)} size="sm">
                Add Payment Method
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {methods.map((method) => (
              <Card key={method.id} className="relative">
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1">
                      {getIcon(method.method_type)}
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium">
                            {formatPaymentMethodLabel(method.method_type)}
                          </p>
                          {method.is_default && (
                            <Badge variant="secondary" className="text-xs">Default</Badge>
                          )}
                          {method.is_verified && (
                            <Badge variant="default" className="text-xs bg-green-500">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Verified
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {method.phone_number || 
                           `${method.bank_name} - ${method.account_name}`}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Daily Limit: KES {PAYMENT_METHOD_LIMITS[method.method_type].daily_limit.toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {!method.is_default && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSetDefault(method.id)}
                        >
                          Set Default
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteMethod(method)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            {methods.length < 3 && (
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => setShowAddDialog(true)}
              >
                Add Another Payment Method ({methods.length}/3)
              </Button>
            )}
          </>
        )}
      </div>

      {/* Add Payment Method Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Payment Method</DialogTitle>
            <DialogDescription>
              Add a payout method. Name must match your ID: <strong>{userName}</strong>
            </DialogDescription>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="mpesa">M-Pesa</TabsTrigger>
              <TabsTrigger value="airtel_money">Airtel Money</TabsTrigger>
              <TabsTrigger value="bank_account">Bank</TabsTrigger>
            </TabsList>

            <TabsContent value="mpesa" className="space-y-4">
              <Alert>
                <Shield className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  OTP will be sent to verify this number
                </AlertDescription>
              </Alert>
              <div className="space-y-2">
                <Label>M-Pesa Phone Number</Label>
                <Input
                  placeholder="+254XXXXXXXXX"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                />
              </div>
            </TabsContent>

            <TabsContent value="airtel_money" className="space-y-4">
              <Alert>
                <Shield className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  OTP will be sent to verify this number
                </AlertDescription>
              </Alert>
              <div className="space-y-2">
                <Label>Airtel Money Phone Number</Label>
                <Input
                  placeholder="+254XXXXXXXXX"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                />
              </div>
            </TabsContent>

            <TabsContent value="bank_account" className="space-y-4">
              <div className="space-y-2">
                <Label>Bank Name</Label>
                <Select value={bankName} onValueChange={setBankName}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select your bank" />
                  </SelectTrigger>
                  <SelectContent>
                    {KENYAN_BANKS.map((bank) => (
                      <SelectItem key={bank} value={bank}>{bank}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Account Number</Label>
                <Input
                  placeholder="Enter account number"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Account Name (Must match ID)</Label>
                <Input
                  placeholder={userName}
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Must exactly match: {userName}
                </p>
              </div>
            </TabsContent>
          </Tabs>

          <Button 
            onClick={handleAddMethod} 
            disabled={isSubmitting}
            className="w-full"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {activeTab === 'bank_account' ? 'Add Method' : 'Send OTP'}
          </Button>
        </DialogContent>
      </Dialog>

      {/* OTP Verification Dialog */}
      <Dialog open={showOTPDialog} onOpenChange={setShowOTPDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {otpAction === 'delete' ? 'Verify Deletion' : 'Verify Phone Number'}
            </DialogTitle>
            <DialogDescription>
              Enter the OTP code sent to{' '}
              {otpAction === 'delete' ? selectedMethod?.phone_number : phoneNumber}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>OTP Code</Label>
              <Input
                placeholder="Enter 6-digit code"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                maxLength={6}
              />
            </div>

            <Button 
              onClick={handleOTPSubmit} 
              disabled={otpLoading || otpCode.length !== 6}
              className="w-full"
            >
              {otpLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {otpAction === 'delete' ? 'Confirm Delete' : 'Verify & Add'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
