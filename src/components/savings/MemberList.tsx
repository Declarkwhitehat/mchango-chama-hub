import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Check, X, Loader2 } from "lucide-react";
import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface MemberListProps {
  members: any[];
  groupId: string;
  onRefresh: () => void;
}

export default function MemberList({
  members,
  groupId,
  onRefresh,
}: MemberListProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState<string | null>(null);

  const handleApprove = async (memberId: string) => {
    setLoading(memberId);
    try {
      const { error } = await supabase
        .from("saving_group_members")
        .update({ status: "active" })
        .eq("id", memberId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Member approved successfully",
      });

      onRefresh();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(null);
    }
  };

  const handleReject = async (memberId: string) => {
    setLoading(memberId);
    try {
      const { error } = await supabase
        .from("saving_group_members")
        .delete()
        .eq("id", memberId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Member rejected",
      });

      onRefresh();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(null);
    }
  };

  const pendingMembers = members.filter((m) => m.status === "pending");
  const activeMembers = members.filter((m) => m.status === "active");

  return (
    <div className="space-y-6">
      {/* Pending Members */}
      {pendingMembers.length > 0 && (
        <Card className="p-6">
          <h3 className="text-xl font-bold mb-4">
            Pending Approvals ({pendingMembers.length})
          </h3>
          <div className="space-y-3">
            {pendingMembers.map((member) => (
              <div
                key={member.id}
                className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 p-4 bg-muted rounded-lg"
              >
                <div>
                  <p className="font-semibold">{member.profiles?.full_name}</p>
                  <p className="text-sm text-muted-foreground">
                    {member.profiles?.email}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleApprove(member.id)}
                    disabled={loading === member.id}
                  >
                    {loading === member.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Check className="mr-1 h-4 w-4" />
                        Approve
                      </>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleReject(member.id)}
                    disabled={loading === member.id}
                  >
                    <X className="mr-1 h-4 w-4" />
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Active Members */}
      <Card className="p-6">
        <h3 className="text-xl font-bold mb-4">
          Active Members ({activeMembers.length})
        </h3>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Savings</TableHead>
                <TableHead>Loan Eligible</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeMembers.map((member) => (
                <TableRow key={member.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{member.profiles?.full_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {member.profiles?.phone}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <p className="font-semibold">
                      KES {member.current_savings.toLocaleString()}
                    </p>
                  </TableCell>
                  <TableCell>
                    {member.is_loan_eligible ? (
                      <Badge variant="default">Eligible</Badge>
                    ) : (
                      <Badge variant="secondary">Not Eligible</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="default">Active</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
