import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { PaymentMethodCard } from "./PaymentMethodCard";
import { Loader2 } from "lucide-react";

interface PaymentMethod {
  id: string;
  method_type: 'mpesa' | 'bank_account';
  phone_number?: string;
  bank_name?: string;
  account_number?: string;
  account_name?: string;
  is_default: boolean;
  is_primary?: boolean;
}

const KENYAN_BANKS = [
  "KCB Bank",
  "Equity Bank",
  "Co-operative Bank",
  "NCBA Bank",
  "Absa Bank Kenya",
  "Stanbic Bank",
  "Standard Chartered",
  "DTB (Diamond Trust Bank)",
  "I&M Bank",
  "Family Bank",
  "CBA (Commercial Bank of Africa)",
  "NIC Bank",
  "Sidian Bank",
  "Prime Bank",
  "Gulf African Bank",
  "First Community Bank",
  "HFC (Housing Finance Company)",
  "Consolidated Bank",
  "Credit Bank",
];

export const PaymentDetailsSetup = ({ open, onComplete }: { open: boolean; onComplete: () => void }) => {
  const [loading, setLoading] = useState(false);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [activeTab, setActiveTab] = useState<'mpesa' | 'bank_account'>('mpesa');
  const { toast } = useToast();

  // Form states
  const [phoneNumber, setPhoneNumber] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');

  useEffect(() => {
    if (open) {
      fetchMethods();
    }
  }, [open]);

  const fetchMethods = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('payment-methods/list');
      if (error) throw error;
      setMethods(data.methods || []);
    } catch (error: any) {
      console.error('Error fetching methods:', error);
    }
  };

  const addMethod = async () => {
    setLoading(true);
    try {
      const methodData: any = {
        method_type: activeTab,
        is_default: methods.length === 0, // First method is default
      };

      if (activeTab === 'mpesa') {
        if (!phoneNumber || !phoneNumber.match(/^\+254(7[0-9]|11[0-1])\d{7}$/)) {
          toast({
            title: "Invalid Phone Number",
            description: "Please enter a valid Safaricom number in format +254XXXXXXXXX",
            variant: "destructive",
          });
          return;
        }
        methodData.phone_number = phoneNumber;
      } else {
        if (!bankName || !accountNumber || !accountName) {
          toast({
            title: "Missing Information",
            description: "Please fill in all bank account fields",
            variant: "destructive",
          });
          return;
        }
        methodData.bank_name = bankName;
        methodData.account_number = accountNumber;
        methodData.account_name = accountName;
      }

      const { data, error } = await supabase.functions.invoke('payment-methods/create', {
        body: methodData,
      });

      if (error) throw error;

      toast({
        title: "Payment Method Added",
        description: "Your payment method has been saved successfully.",
      });

      // Reset form
      setPhoneNumber('');
      setBankName('');
      setAccountNumber('');
      setAccountName('');

      await fetchMethods();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to add payment method",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const setDefault = async (id: string) => {
    try {
      const { error } = await supabase.functions.invoke(`payment-methods/set-default/${id}`, {
        method: 'POST',
      });
      if (error) throw error;

      toast({
        title: "Default Updated",
        description: "Default payment method updated successfully.",
      });

      await fetchMethods();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to set default",
        variant: "destructive",
      });
    }
  };

  const deleteMethod = async (id: string) => {
    try {
      const { error } = await supabase.functions.invoke(`payment-methods/delete/${id}`, {
        method: 'DELETE',
      });
      if (error) throw error;

      toast({
        title: "Payment Method Deleted",
        description: "Payment method removed successfully.",
      });

      await fetchMethods();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete payment method",
        variant: "destructive",
      });
    }
  };

  const handleComplete = () => {
    if (methods.length === 0) {
      toast({
        title: "Add Payment Method",
        description: "Please add at least one payment method to continue.",
        variant: "destructive",
      });
      return;
    }

    const hasDefault = methods.some(m => m.is_default);
    if (!hasDefault) {
      toast({
        title: "Set Default Method",
        description: "Please set one payment method as default.",
        variant: "destructive",
      });
      return;
    }

    onComplete();
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Complete Your Profile - Payment Setup</DialogTitle>
          <DialogDescription>
            Add up to 3 payout methods. This is where you'll receive payments.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Saved Methods */}
          {methods.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Saved Payment Methods ({methods.length}/3)</h3>
              <div className="space-y-2">
                {methods.map((method) => (
                  <PaymentMethodCard
                    key={method.id}
                    method={method}
                    onSetDefault={setDefault}
                    onDelete={deleteMethod}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Add New Method */}
          {methods.length < 3 && (
            <div className="space-y-4">
              <h3 className="text-sm font-medium">
                {methods.length === 0 ? 'Add Your First Payment Method' : 'Add Another Payment Method'}
              </h3>

              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'mpesa' | 'bank_account')}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="mpesa">M-Pesa</TabsTrigger>
                  <TabsTrigger value="bank_account">Bank Account</TabsTrigger>
                </TabsList>

                <TabsContent value="mpesa" className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="mpesa-phone">M-Pesa Phone Number (Safaricom Only)</Label>
                    <Input
                      id="mpesa-phone"
                      placeholder="+254712345678"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Enter Safaricom M-Pesa number (format: +254XXXXXXXXX)
                    </p>
                  </div>
                </TabsContent>

                <TabsContent value="bank_account" className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="bank-name">Bank Name</Label>
                    <Select value={bankName} onValueChange={setBankName}>
                      <SelectTrigger id="bank-name">
                        <SelectValue placeholder="Select your bank" />
                      </SelectTrigger>
                      <SelectContent>
                        {KENYAN_BANKS.map((bank) => (
                          <SelectItem key={bank} value={bank}>
                            {bank}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="account-number">Account Number</Label>
                    <Input
                      id="account-number"
                      placeholder="1234567890"
                      value={accountNumber}
                      onChange={(e) => setAccountNumber(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="account-name">Account Name</Label>
                    <Input
                      id="account-name"
                      placeholder="John Doe"
                      value={accountName}
                      onChange={(e) => setAccountName(e.target.value)}
                    />
                  </div>
                </TabsContent>
              </Tabs>

              <Button onClick={addMethod} disabled={loading} className="w-full">
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Add Payment Method
              </Button>
            </div>
          )}

          {/* Complete Button */}
          <div className="flex gap-2 pt-4 border-t">
            {methods.length > 0 && (
              <Button onClick={handleComplete} className="flex-1">
                Complete Setup
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
