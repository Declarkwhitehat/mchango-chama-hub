import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Shield, Lock, HelpCircle } from "lucide-react";
import { toast } from "sonner";

interface SecurityQuestion {
  id: string;
  question_text: string;
}

const PinSetup = () => {
  const navigate = useNavigate();
  const { user, session } = useAuth();
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [step, setStep] = useState<"pin" | "questions">("pin");
  const [questions, setQuestions] = useState<SecurityQuestion[]>([]);
  const [selectedQuestions, setSelectedQuestions] = useState<string[]>(["", "", ""]);
  const [answers, setAnswers] = useState<string[]>(["", "", ""]);
  const [loading, setLoading] = useState(false);
  const [loadingQuestions, setLoadingQuestions] = useState(true);

  useEffect(() => {
    fetchQuestions();
  }, []);

  const fetchQuestions = async () => {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/pin-management`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ action: 'get-security-questions' }),
      });
      const data = await response.json();
      setQuestions(data.questions || []);
    } catch (err) {
      console.error('Failed to fetch questions:', err);
    } finally {
      setLoadingQuestions(false);
    }
  };

  const handlePinStep = () => {
    if (pin.length !== 5) {
      toast.error("PIN must be exactly 5 digits");
      return;
    }
    if (pin !== confirmPin) {
      toast.error("PINs do not match");
      return;
    }
    setStep("questions");
  };

  const handleSubmit = async () => {
    // Validate questions
    const uniqueQuestions = new Set(selectedQuestions.filter(Boolean));
    if (uniqueQuestions.size !== 3) {
      toast.error("Please select 3 different security questions");
      return;
    }
    for (let i = 0; i < 3; i++) {
      if (!answers[i] || answers[i].trim().length < 2) {
        toast.error(`Answer ${i + 1} must be at least 2 characters`);
        return;
      }
    }

    setLoading(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/pin-management`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          action: 'set-pin',
          pin,
          security_answers: selectedQuestions.map((qId, i) => ({
            question_id: qId,
            answer: answers[i],
          })),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        toast.error(data.error || 'Failed to set PIN');
        return;
      }

      toast.success("PIN and security questions set successfully!");
      const returnTo = sessionStorage.getItem('pinSetupReturnTo') || '/home';
      sessionStorage.removeItem('pinSetupReturnTo');
      navigate(returnTo, { replace: true });
    } catch (err) {
      toast.error('An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const updateQuestion = (index: number, value: string) => {
    const updated = [...selectedQuestions];
    updated[index] = value;
    setSelectedQuestions(updated);
  };

  const updateAnswer = (index: number, value: string) => {
    const updated = [...answers];
    updated[index] = value;
    setAnswers(updated);
  };

  const getAvailableQuestions = (currentIndex: number) => {
    const otherSelected = selectedQuestions.filter((_, i) => i !== currentIndex);
    return questions.filter(q => !otherSelected.includes(q.id));
  };

  if (!user) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-2">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-xl">Set Up Security PIN</CardTitle>
          <CardDescription>
            {step === "pin" 
              ? "Create a 5-digit PIN to secure your account. This PIN will be required for login and sensitive actions."
              : "Choose 3 security questions. These will help you recover your PIN if forgotten."
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === "pin" ? (
            <div className="space-y-6">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Lock className="h-4 w-4" /> Enter 5-Digit PIN
                </Label>
                <div className="flex justify-center">
                  <InputOTP maxLength={5} value={pin} onChange={setPin}>
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                    </InputOTPGroup>
                  </InputOTP>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Confirm PIN</Label>
                <div className="flex justify-center">
                  <InputOTP maxLength={5} value={confirmPin} onChange={setConfirmPin}>
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                    </InputOTPGroup>
                  </InputOTP>
                </div>
              </div>
              <Button className="w-full" onClick={handlePinStep} disabled={pin.length !== 5 || confirmPin.length !== 5}>
                Continue to Security Questions
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {[0, 1, 2].map((index) => (
                <div key={index} className="space-y-2 p-3 rounded-lg border bg-muted/30">
                  <Label className="flex items-center gap-2 text-sm font-medium">
                    <HelpCircle className="h-3.5 w-3.5" /> Question {index + 1}
                  </Label>
                  <Select
                    value={selectedQuestions[index]}
                    onValueChange={(v) => updateQuestion(index, v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a question" />
                    </SelectTrigger>
                    <SelectContent>
                      {getAvailableQuestions(index).map((q) => (
                        <SelectItem key={q.id} value={q.id}>
                          {q.question_text}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Your answer"
                    value={answers[index]}
                    onChange={(e) => updateAnswer(index, e.target.value)}
                  />
                </div>
              ))}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep("pin")} className="flex-1">
                  Back
                </Button>
                <Button className="flex-1" onClick={handleSubmit} disabled={loading}>
                  {loading ? "Setting up..." : "Complete Setup"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PinSetup;
