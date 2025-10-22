import { useState, useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { Users, Loader2, AlertCircle, CheckCircle } from "lucide-react";

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
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  const inviteCode = searchParams.get("code");

  const [chamaInfo, setChamaInfo] = useState<ChamaInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isJoining, setIsJoining] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isCodeValid, setIsCodeValid] = useState(false);

  useEffect(() => {
    if (inviteCode) {
      validateInviteCode();
    } else {
      setErrorMessage("No invite code provided. Please use a valid invite link.");
      setIsLoading(false);
    }
  }, [inviteCode]);

  const validateInviteCode = async () => {
    setIsLoading(true);
    setErrorMessage("");

    try {
      const { data, error } = await supabase.functions.invoke(`chama-invite/validate/${inviteCode}`);

      if (error) throw error;

      if (!data.valid) {
        setErrorMessage(data.message || "Invalid invite code");
        setIsLoading(false);
        return;
      }

      // Load chama details
      const chamaData = data.chama;
      setChamaInfo({
        id: chamaData.id,
        name: chamaData.name,
        slug: chamaData.slug,
        description: chamaData.description,
        contribution_amount: chamaData.contribution_amount,
        contribution_frequency: chamaData.contribution_frequency,
      });
      setIsCodeValid(true);
    } catch (error: any) {
      console.error('Error validating invite code:', error);
      setErrorMessage(error.message || "Failed to validate invite code");
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!chamaInfo || isJoining || !isCodeValid) return;

    // Check if user is authenticated before joining
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      // Redirect to auth with return URL
      navigate("/auth", { state: { returnTo: `/chama/join/${slug}?code=${inviteCode}` } });
      return;
    }

    setIsJoining(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast({
          title: "Error",
          description: "Please log in to continue",
          variant: "destructive",
        });
        setIsJoining(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke("chama-join", {
        body: { 
          chama_id: chamaInfo.id,
          invite_code: inviteCode 
        },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (error) throw error;

      toast({
        title: "Request Sent Successfully!",
        description: "Your join request is now pending manager approval. You'll be notified once approved.",
      });

      // Navigate to chama detail page to see pending status
      navigate(`/chama/${chamaInfo.id}`);
    } catch (error: any) {
      const errorMessage = error.message || "Failed to submit join request";
      
      if (errorMessage.includes("already a member") || errorMessage.includes("already exists")) {
        toast({
          title: "Already Requested",
          description: "You have already submitted a join request for this chama.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive",
        });
      }
    } finally {
      setIsJoining(false);
    }
  };

  if (isLoading) {
    return (
      <Layout showBackButton title="Join Chama">
        <div className="container px-4 py-6 max-w-2xl mx-auto flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout showBackButton title="Join Chama">
      <div className="container px-4 py-6 max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Join {chamaInfo?.name || "Chama"}
            </CardTitle>
            <CardDescription>
              Submit your request to join this chama group
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {errorMessage && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            )}

            {chamaInfo && isCodeValid && (
              <div className="space-y-4">
                <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-800 dark:text-green-200">
                    Valid invite code! You can now request to join this chama.
                  </AlertDescription>
                </Alert>

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
                    Your join request will be pending until a manager approves it. You'll be notified once approved.
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
                      Submitting...
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
