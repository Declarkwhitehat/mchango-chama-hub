import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import SavingGroupSelector from "@/components/savinggroups/SavingGroupSelector";
import QuickSummaryCards from "@/components/savinggroups/QuickSummaryCards";
import SavingsProgress from "@/components/savinggroups/SavingsProgress";
import ContributionGraph from "@/components/savinggroups/ContributionGraph";
import PersonalSavingsTable from "@/components/savinggroups/PersonalSavingsTable";

interface SavingGroup {
  id: string;
  name: string;
  manager_id: string;
  cycle_start_date: string;
  cycle_end_date: string;
  whatsapp_link: string | null;
  total_group_savings: number;
  group_profit_pool: number;
}

interface MemberData {
  id: string;
  current_savings: number;
  lifetime_deposits: number;
  is_loan_eligible: boolean;
}

interface ManagerProfile {
  full_name: string;
}

export default function SavingGroupDashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<SavingGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [memberData, setMemberData] = useState<MemberData | null>(null);
  const [managerName, setManagerName] = useState<string>("");
  const [loanPoolAvailable, setLoanPoolAvailable] = useState<number>(0);

  useEffect(() => {
    if (user) {
      loadUserGroups();
    }
  }, [user]);

  useEffect(() => {
    if (selectedGroupId) {
      loadGroupData();
    }
  }, [selectedGroupId]);

  const loadUserGroups = async () => {
    try {
      const { data, error } = await supabase
        .from("saving_group_members")
        .select(`
          group_id,
          saving_groups (
            id,
            name,
            manager_id,
            cycle_start_date,
            cycle_end_date,
            whatsapp_link,
            total_group_savings,
            group_profit_pool
          )
        `)
        .eq("user_id", user?.id)
        .eq("status", "active");

      if (error) throw error;

      const userGroups = data
        ?.map((item: any) => item.saving_groups)
        .filter(Boolean) as SavingGroup[];

      setGroups(userGroups || []);
      if (userGroups && userGroups.length > 0) {
        setSelectedGroupId(userGroups[0].id);
      }
    } catch (error: any) {
      console.error("Error loading groups:", error);
      toast.error("Failed to load saving groups");
    } finally {
      setLoading(false);
    }
  };

  const loadGroupData = async () => {
    try {
      // Load member data
      const { data: memberInfo, error: memberError } = await supabase
        .from("saving_group_members")
        .select("*")
        .eq("group_id", selectedGroupId)
        .eq("user_id", user?.id)
        .single();

      if (memberError) throw memberError;
      setMemberData(memberInfo);

      // Load manager name
      const selectedGroup = groups.find((g) => g.id === selectedGroupId);
      if (selectedGroup) {
        const { data: managerProfile, error: managerError } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", selectedGroup.manager_id)
          .single();

        if (managerError) throw managerError;
        setManagerName(managerProfile.full_name);

        // Calculate loan pool available
        const { data: loanPool, error: loanPoolError } = await supabase.rpc(
          "calculate_loan_pool_available",
          { p_group_id: selectedGroupId }
        );

        if (loanPoolError) throw loanPoolError;
        setLoanPoolAvailable(loanPool || 0);
      }
    } catch (error: any) {
      console.error("Error loading group data:", error);
      toast.error("Failed to load group data");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card className="p-8 text-center">
          <h2 className="text-2xl font-bold mb-4">No Saving Groups</h2>
          <p className="text-muted-foreground">
            You are not a member of any saving groups yet.
          </p>
        </Card>
      </div>
    );
  }

  const selectedGroup = groups.find((g) => g.id === selectedGroupId);

  if (!selectedGroup || !memberData) {
    return null;
  }

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <SavingGroupSelector
          groups={groups}
          selectedGroupId={selectedGroupId}
          onSelectGroup={setSelectedGroupId}
        />
        <div className="flex flex-col md:text-right">
          <h1 className="text-2xl font-bold">{selectedGroup.name}</h1>
          <p className="text-sm text-muted-foreground">
            Manager: {managerName}
          </p>
          <p className="text-sm text-muted-foreground">
            Cycle: {new Date(selectedGroup.cycle_start_date).toLocaleDateString()} -{" "}
            {new Date(selectedGroup.cycle_end_date).toLocaleDateString()}
          </p>
          {selectedGroup.whatsapp_link && (
            <a
              href={selectedGroup.whatsapp_link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline"
            >
              WhatsApp Group Link
            </a>
          )}
        </div>
      </div>

      {/* Quick Summary Cards */}
      <QuickSummaryCards
        currentSavings={memberData.current_savings}
        lifetimeDeposits={memberData.lifetime_deposits}
        totalGroupSavings={selectedGroup.total_group_savings}
        groupProfitPool={selectedGroup.group_profit_pool}
        loanPoolAvailable={loanPoolAvailable}
      />

      {/* Savings Progress */}
      <SavingsProgress
        memberId={memberData.id}
        groupId={selectedGroupId}
        isLoanEligible={memberData.is_loan_eligible}
      />

      {/* Contribution Graph */}
      <ContributionGraph memberId={memberData.id} groupId={selectedGroupId} />

      {/* Personal Savings Breakdown */}
      <PersonalSavingsTable memberId={memberData.id} groupId={selectedGroupId} />
    </div>
  );
}
