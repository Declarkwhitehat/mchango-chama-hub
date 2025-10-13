import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { Users, Loader2, AlertCircle } from "lucide-react";

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

  const [chamaInfo, setChamaInfo] = useState<ChamaInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isJoining, setIsJoining] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    // Load chama details without requiring authentication first
    loadChama();
  }, [slug]);

  const loadChama = async () => {
    setIsLoading(true);
    setErrorMessage("");

    try {
      // Query database directly using RLS policies (public can view active chamas)
      const { data, error } = await supabase
        .from('chama')
        .select(`
          id,
          name,
          slug,
          description,
          contribution_amount,
          contribution_frequency,
          status,
          is_public
        `)
        .eq('slug', slug)
        .eq('status', 'active')
        .eq('is_public', true)
        .single();

      if (error) throw error;

      if (!data) {
        setErrorMessage("Chama not found or is not public");
        return;
      }

      setChamaInfo(data);
    } catch (error: any) {
      console.error('Error loading chama:', error);
      setErrorMessage(error.message || "Failed to load chama details");
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!chamaInfo || isJoining) return;

    // Check if user is authenticated before joining
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      // Redirect to auth with return URL
      navigate("/auth", { state: { returnTo: `/chama/join/${slug}` } });
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
        body: { chama_id: chamaInfo.id },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (error) throw error;

      toast({
        title: "Request Sent Successfully!",
        description: "Your join request is now pending manager approval. You'll be notified once approved.",
      });

      // Navigate to chama detail page to see pending status
      navigate(`/chama/${chamaInfo.slug}`);
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

            {chamaInfo && (
              <div className="space-y-4">
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
