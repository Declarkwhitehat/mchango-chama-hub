import { useState } from "react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Shield, Loader2 } from "lucide-react";

const WelfareJoin = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [joinCode, setJoinCode] = useState(slug?.toUpperCase() || "");
  const [loading, setLoading] = useState(false);

  const handleJoin = async () => {
    if (!joinCode.trim()) {
      toast.error("Please enter a group code");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('welfare-members', {
        method: 'POST',
        body: { group_code: joinCode.trim().toUpperCase() },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success("Joined welfare group successfully!");
      navigate('/welfare');
    } catch (error: any) {
      toast.error(error.message || "Failed to join");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="container px-4 py-8 max-w-md mx-auto">
        <Card>
          <CardHeader className="text-center">
            <Shield className="h-12 w-12 mx-auto text-primary mb-2" />
            <CardTitle>Join Welfare Group</CardTitle>
            <CardDescription>Enter the group code to join</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Group Code</Label>
              <Input
                placeholder="e.g., AB12"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                maxLength={8}
                className="text-center text-lg tracking-widest"
              />
            </div>
            <Button onClick={handleJoin} disabled={loading || !joinCode.trim()} className="w-full">
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Join Welfare
            </Button>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default WelfareJoin;
