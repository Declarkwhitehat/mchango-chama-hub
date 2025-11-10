import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";
import SavingsGroupManagerDashboard from "@/components/savings/ManagerDashboard";
import SavingsGroupMemberDashboard from "@/components/savings/MemberDashboard";

export default function SavingsGroupDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState<any>(null);
  const [membership, setMembership] = useState<any>(null);
  const [isManager, setIsManager] = useState(false);

  useEffect(() => {
    if (id && user) {
      fetchGroupData();
    }
  }, [id, user]);

  const fetchGroupData = async () => {
    try {
      // Fetch group details
      const { data: groupData, error: groupError } = await supabase
        .from("saving_groups")
        .select("*")
        .eq("id", id)
        .single();

      if (groupError) throw groupError;
      setGroup(groupData);
      setIsManager(groupData.manager_id === user?.id);

      // Fetch membership
      const { data: memberData } = await supabase
        .from("saving_group_members")
        .select("*")
        .eq("group_id", id)
        .eq("user_id", user?.id)
        .single();

      setMembership(memberData);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
      navigate("/savings-group");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-8 flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!group) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-8">
          <p>Group not found</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <Button
          variant="ghost"
          onClick={() => navigate("/savings-group")}
          className="mb-6"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Groups
        </Button>

        {isManager ? (
          <SavingsGroupManagerDashboard
            group={group}
            onRefresh={fetchGroupData}
          />
        ) : (
          <SavingsGroupMemberDashboard
            group={group}
            membership={membership}
            onRefresh={fetchGroupData}
          />
        )}
      </div>
    </Layout>
  );
}
