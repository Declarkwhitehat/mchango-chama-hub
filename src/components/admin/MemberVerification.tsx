import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AlertCircle, CheckCircle, Loader2 } from "lucide-react";

interface MemberRequiringVerification {
  id: string;
  member_code: string;
  missed_payments_count: number;
  next_cycle_credit: number;
  chama: {
    name: string;
  };
  profiles: {
    full_name: string;
    phone: string;
  };
}

export function MemberVerification() {
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<MemberRequiringVerification[]>([]);
  const [processing, setProcessing] = useState<string | null>(null);

  const loadMembers = async () => {
    try {
      const { data, error } = await supabase
        .from('chama_members')
        .select(`
          id,
          member_code,
          missed_payments_count,
          next_cycle_credit,
          requires_admin_verification,
          chama:chama_id(name),
          profiles:user_id(full_name, phone)
        `)
        .eq('requires_admin_verification', true)
        .eq('status', 'active')
        .order('missed_payments_count', { ascending: false });

      if (error) throw error;

      setMembers(data || []);
    } catch (error: any) {
      console.error('Error loading members:', error);
      toast.error('Failed to load members requiring verification');
    } finally {
      setLoading(false);
    }
  };

  const approveVerification = async (memberId: string) => {
    try {
      setProcessing(memberId);

      const { error } = await supabase
        .from('chama_members')
        .update({
          requires_admin_verification: false,
          missed_payments_count: 0
        })
        .eq('id', memberId);

      if (error) throw error;

      toast.success('Member verification approved');
      loadMembers();
    } catch (error: any) {
      console.error('Error approving verification:', error);
      toast.error('Failed to approve verification');
    } finally {
      setProcessing(null);
    }
  };

  useEffect(() => {
    loadMembers();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-orange-500" />
          Members Requiring Payout Verification
        </CardTitle>
        <CardDescription>
          Members who missed payments need admin approval before their next payout
        </CardDescription>
      </CardHeader>
      <CardContent>
        {members.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <CheckCircle className="h-12 w-12 mx-auto mb-2 text-green-500" />
            <p>No members requiring verification</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Chama</TableHead>
                <TableHead>Member Code</TableHead>
                <TableHead>Missed Payments</TableHead>
                <TableHead>Next Cycle Credit</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{member.profiles?.full_name}</div>
                      <div className="text-xs text-muted-foreground">{member.profiles?.phone}</div>
                    </div>
                  </TableCell>
                  <TableCell>{member.chama?.name}</TableCell>
                  <TableCell>
                    <code className="text-xs">{member.member_code}</code>
                  </TableCell>
                  <TableCell>
                    <Badge variant="destructive">
                      {member.missed_payments_count} missed
                    </Badge>
                  </TableCell>
                  <TableCell>
                    KES {member.next_cycle_credit.toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      onClick={() => approveVerification(member.id)}
                      disabled={processing === member.id}
                    >
                      {processing === member.id ? (
                        <>
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          Approving...
                        </>
                      ) : (
                        <>
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Approve Payout
                        </>
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}