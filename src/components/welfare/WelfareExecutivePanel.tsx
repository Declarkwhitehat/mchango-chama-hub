import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Crown, BookOpen, Landmark, UserCheck } from "lucide-react";

interface Props {
  members: any[];
  welfareId: string;
  isChairman: boolean;
  onRoleAssigned: () => void;
}

export const WelfareExecutivePanel = ({ members, welfareId, isChairman, onRoleAssigned }: Props) => {
  const [assigning, setAssigning] = useState(false);

  const chairman = members.find((m: any) => m.role === 'chairman');
  const secretary = members.find((m: any) => m.role === 'secretary');
  const treasurer = members.find((m: any) => m.role === 'treasurer');
  const regularMembers = members.filter((m: any) => m.role === 'member');

  const assignRole = async (memberId: string, role: string) => {
    setAssigning(true);
    try {
      const { data, error } = await supabase.functions.invoke('welfare-members', {
        method: 'PUT',
        body: { member_id: memberId, role },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Role assigned: ${role}`);
      onRoleAssigned();
    } catch (error: any) {
      toast.error(error.message || "Failed to assign role");
    } finally {
      setAssigning(false);
    }
  };

  const roleCard = (title: string, icon: React.ReactNode, member: any, roleKey: string) => (
    <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-full bg-primary/10">{icon}</div>
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase">{title}</p>
          {member ? (
            <p className="font-medium text-sm">{member.profiles?.full_name || 'Unknown'}</p>
          ) : (
            <p className="text-sm text-muted-foreground italic">Not assigned</p>
          )}
        </div>
      </div>
      {!member && isChairman && regularMembers.length > 0 && (
        <Select onValueChange={(val) => assignRole(val, roleKey)} disabled={assigning}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Assign" />
          </SelectTrigger>
          <SelectContent>
            {regularMembers.map((m: any) => (
              <SelectItem key={m.id} value={m.id}>{m.profiles?.full_name || m.member_code}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <UserCheck className="h-4 w-4" />
          Executive Panel
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {roleCard("Chairman", <Crown className="h-4 w-4 text-primary" />, chairman, "chairman")}
        {roleCard("Secretary", <BookOpen className="h-4 w-4 text-primary" />, secretary, "secretary")}
        {roleCard("Treasurer", <Landmark className="h-4 w-4 text-primary" />, treasurer, "treasurer")}
      </CardContent>
    </Card>
  );
};
