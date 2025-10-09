import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { CheckCircle, AlertCircle, Loader2 } from "lucide-react";

interface ChamaInfo {
  id: string;
  name: string;
  slug: string;
  description: string;
  contribution_amount: number;
  contribution_frequency: string;
}

const ChamaJoin = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const codeFromUrl = searchParams.get("code");

  const [code, setCode] = useState(codeFromUrl || "");
  const [chamaInfo, setChamaInfo] = useState<ChamaInfo | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [isValid, setIsValid] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth", { state: { returnTo: `/chama/join${codeFromUrl ? `?code=${codeFromUrl}` : ""}` } });
      }
    };

    checkAuth();

    if (codeFromUrl) {
      validateCode(codeFromUrl);
    }
  }, [codeFromUrl, navigate]);

  const validateCode = async (inviteCode: string) => {
    if (!inviteCode || inviteCode.length < 6) {
      setErrorMessage("Please enter a valid invite code");
      setIsValid(false);
      return;
    }

    setIsValidating(true);
    setErrorMessage("");

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setErrorMessage("Please log in to validate invite codes");
        setIsValid(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke(
        `chama-invite/validate?code=${inviteCode.toUpperCase()}`,
        {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }
      );

      if (error || !data.valid) {
        setErrorMessage(data?.error || "Invalid or expired invite code");
        setIsValid(false);
        setChamaInfo(null);
        return;
      }

      setIsValid(true);
      setChamaInfo(data.data.chama);
    } catch (error: any) {
      setErrorMessage(error.message || "Failed to validate code");
      setIsValid(false);
    } finally {
      setIsValidating(false);
    }
  };

  const handleValidate = () => {
    validateCode(code);
  };

  const handleJoin = async () => {
    setIsJoining(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast({
          title: "Error",
          description: "Please log in to continue",
          variant: "destructive",
        });
        return;
      }

      const { data, error } = await supabase.functions.invoke("chama-join", {
        body: { code: code.toUpperCase() },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (error) throw error;

      toast({
        title: "Success!",
        description: data.message || "Join request submitted successfully",
      });

      // Navigate to chama detail page
      navigate(`/chama/${chamaInfo?.slug}`);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to join chama",
        variant: "destructive",
      });
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <Layout showBackButton title="Join Chama">
      <div className="container px-4 py-6 max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Join a Chama</CardTitle>
            <CardDescription>
              Enter your invite code to join a chama group
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="code">Invite Code</Label>
                <div className="flex gap-2">
                  <Input
                    id="code"
                    placeholder="Enter 8-character code"
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value.toUpperCase());
                      setIsValid(false);
                      setErrorMessage("");
                    }}
                    maxLength={8}
                    className="font-mono"
                  />
                  <Button
                    onClick={handleValidate}
                    disabled={isValidating || code.length < 6}
                  >
                    {isValidating ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Validating...
                      </>
                    ) : (
                      "Validate"
                    )}
                  </Button>
                </div>
              </div>

              {errorMessage && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{errorMessage}</AlertDescription>
                </Alert>
              )}

              {isValid && chamaInfo && (
                <Alert className="border-success bg-success/10">
                  <CheckCircle className="h-4 w-4 text-success" />
                  <AlertDescription>
                    Valid invite code! You can join this chama.
                  </AlertDescription>
                </Alert>
              )}
            </div>

            {isValid && chamaInfo && (
              <div className="space-y-4 pt-4 border-t">
                <h3 className="font-semibold text-lg">Chama Details</h3>
                
                <div className="space-y-3">
                  <div>
                    <Label className="text-muted-foreground">Name</Label>
                    <p className="font-medium">{chamaInfo.name}</p>
                  </div>

                  <div>
                    <Label className="text-muted-foreground">Description</Label>
                    <p className="text-sm">{chamaInfo.description}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-muted-foreground">Contribution</Label>
                      <p className="font-medium">KES {chamaInfo.contribution_amount.toLocaleString()}</p>
                    </div>

                    <div>
                      <Label className="text-muted-foreground">Frequency</Label>
                      <p className="font-medium capitalize">{chamaInfo.contribution_frequency}</p>
                    </div>
                  </div>
                </div>

                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Your join request will be pending until a manager approves it.
                  </AlertDescription>
                </Alert>

                <Button
                  className="w-full"
                  onClick={handleJoin}
                  disabled={isJoining}
                >
                  {isJoining ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Joining...
                    </>
                  ) : (
                    "Submit Join Request"
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default ChamaJoin;
