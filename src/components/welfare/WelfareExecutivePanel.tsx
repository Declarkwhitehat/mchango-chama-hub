import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Crown, BookOpen, Landmark, UserCheck, UserMinus, Loader2, ChevronDown } from "lucide-react";

interface Props {
  members: any[];
  welfareId: string;
  isChairman: boolean;
  isAdmin?: boolean;
  onRoleAssigned: () => void;
}

export const WelfareExecutivePanel = ({ members, welfareId, isChairman, isAdmin = false, onRoleAssigned }: Props) => {
  const [assigning, setAssigning] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const chairman = members.find((m: any) => m.role === 'chairman');
  const secretary = members.find((m: any) => m.role === 'secretary');
  const treasurer = members.find((m: any) => m.role === 'treasurer');
  const regularMembers = members.filter((m: any) => m.role === 'member');
  const canManage = isChairman || isAdmin;
  // For admin, all non-target members are assignable; for chairman, only regular members
  const assignableMembers = isAdmin ? members : regularMembers;

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

  const removeMember = async (memberId: string) => {
    setRemovingId(memberId);
    try {
      const { data, error } = await supabase.functions.invoke(`welfare-members?member_id=${memberId}`, { method: 'DELETE' });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Member removed");
      onRoleAssigned();
    } catch (error: any) {
      toast.error(error.message || "Failed to remove member");
    } finally {
      setRemovingId(null);
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
      <div className="flex items-center gap-2">
        {/* Replace role - admin can replace any, chairman can replace secretary/treasurer */}
        {canManage && assignableMembers.length > 0 && (
          <Select onValueChange={(val) => assignRole(val, roleKey)} disabled={assigning}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder={member ? "Replace" : "Assign"} />
            </SelectTrigger>
            <SelectContent>
              {assignableMembers
                .filter((m: any) => m.id !== member?.id)
                .map((m: any) => (
                  <SelectItem key={m.id} value={m.id}>{m.profiles?.full_name || m.member_code}</SelectItem>
                ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  );

  return (
    <Card>
      <Collapsible>
        <CollapsibleTrigger className="flex items-center justify-between w-full p-4 hover:bg-muted/50 transition-colors rounded-t-lg">
          <div className="flex items-center gap-2 text-base font-semibold">
            <UserCheck className="h-4 w-4" />
            Executive Panel
            {isAdmin && <Badge variant="outline" className="text-xs">Admin Mode</Badge>}
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 [[data-state=open]_&]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent>
        {roleCard("Chairman", <Crown className="h-4 w-4 text-primary" />, chairman, "chairman")}
        {roleCard("Secretary", <BookOpen className="h-4 w-4 text-primary" />, secretary, "secretary")}
        {roleCard("Treasurer", <Landmark className="h-4 w-4 text-primary" />, treasurer, "treasurer")}

        {/* Admin member management */}
        {canManage && members.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <p className="text-sm font-medium text-muted-foreground mb-3">All Members</p>
            <div className="space-y-2">
              {members.map((member: any) => (
                <div key={member.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                  <div>
                    <p className="font-medium text-sm">{member.profiles?.full_name || 'Unknown'}</p>
                    <Badge variant="outline" className="capitalize text-xs">{member.role}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Role change dropdown */}
                    <Select
                      onValueChange={(val) => assignRole(member.id, val)}
                      disabled={assigning}
                    >
                      <SelectTrigger className="w-[110px] h-8 text-xs">
                        <SelectValue placeholder="Change role" />
                      </SelectTrigger>
                      <SelectContent>
                        {(isAdmin ? ['chairman', 'secretary', 'treasurer', 'member'] : ['secretary', 'treasurer', 'member'])
                          .filter(r => r !== member.role)
                          .map(r => (
                            <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    {/* Remove button - admin can remove anyone, chairman can't remove self */}
                    {(isAdmin || (isChairman && member.role !== 'chairman')) && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                            <UserMinus className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove Member?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Remove {member.profiles?.full_name || 'this member'} ({member.role}) from the welfare group?
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => removeMember(member.id)}
                              disabled={removingId === member.id}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              {removingId === member.id ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                              Remove
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
