import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import { formatKenya, formatKenyaTime } from "@/lib/kenyaTime";
import { getFirstCycleDeadline } from "@/utils/chamaDeadlines";
import { addCyclesToDeadline, frequencyLabel } from "@/utils/chamaFrequency";


import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { 
  CheckCircle2, 
  Users, 
  AlertTriangle, 
  Play,
  Loader2,
  Calendar
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Member {
  id: string;
  user_id: string;
  order_index: number | null;
  member_code: string | null;
  first_payment_completed: boolean;
  first_payment_at: string | null;
  approval_status: string;
  is_manager: boolean;
  joined_at?: string;
  profiles: {
    full_name: string;
    phone?: string;
  } | null;
}

interface PreStartDashboardProps {
  chamaId: string;
  chamaName: string;
  contributionAmount: number;
  minMembers: number;
  members: Member[];
  isManager: boolean;
  onStart: () => Promise<void>;
  isStarting: boolean;
  frequency?: string | null;
  everyNDaysCount?: number | null;
  monthlyDay?: number | null;
  monthlyDay2?: number | null;
  weeklyDay?: number | null;
  weeklyDay2?: number | null;
}

export const PreStartDashboard = ({
  chamaId,
  chamaName,
  contributionAmount,
  minMembers,
  members,
  isManager,
  onStart,
  isStarting,
  frequency,
  everyNDaysCount,
  monthlyDay,
  monthlyDay2,
  weeklyDay,
  weeklyDay2,
}: PreStartDashboardProps) => {
  // All approved members are ready to participate
  const approvedMembers = members.filter(m => m.approval_status === 'approved');
  
  const canStart = approvedMembers.length >= minMembers;
  const membersNeeded = minMembers - approvedMembers.length;

  // Schedule preview — mirrors the backend first-deadline maths exactly.
  const cycle1 = getFirstCycleDeadline(new Date(), {
    frequency,
    monthlyDay,
    monthlyDay2,
    weeklyDay,
    weeklyDay2,
  });
  const cycle2 = cycle1
    ? addCyclesToDeadline(cycle1, 1, {
        frequency: frequency || 'daily',
        everyNDaysCount,
        monthlyDay,
        monthlyDay2,
        weeklyDay,
        weeklyDay2,
      })
    : null;
  const labelFor = (d: Date | null) =>
    d ? `${formatKenya(d, { weekday: 'short', day: 'numeric', month: 'short' })}, ${formatKenyaTime(d)}` : '—';
  const cycle1Label = labelFor(cycle1);
  const cycle2Label = labelFor(cycle2);
  const scheduleSummary = frequencyLabel(frequency || '', everyNDaysCount, weeklyDay, weeklyDay2);

  const [provenUsers, setProvenUsers] = useState<Set<string>>(new Set());


  useEffect(() => {
    const loadTrack = async () => {
      const userIds = approvedMembers.map(m => m.user_id).filter(Boolean);
      if (userIds.length === 0) return;
      const { data } = await supabase
        .from('member_trust_scores')
        .select('user_id, total_chamas_completed')
        .in('user_id', userIds);
      setProvenUsers(new Set((data || []).filter(r => (r.total_chamas_completed || 0) > 0).map(r => r.user_id)));
    };
    loadTrack();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members]);

  // Sort by join date for display
  const sortedMembers = [...approvedMembers].sort((a, b) => {
    const aTime = a.joined_at ? new Date(a.joined_at).getTime() : 0;
    const bTime = b.joined_at ? new Date(b.joined_at).getTime() : 0;
    return aTime - bTime;
  });


  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-primary">{approvedMembers.length}</div>
              <p className="text-sm text-muted-foreground">Approved Members</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold">{minMembers}</div>
              <p className="text-sm text-muted-foreground">Min Required</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Status Alert */}
      {!canStart ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Cannot Start Yet</AlertTitle>
          <AlertDescription>
            You need {membersNeeded} more approved member(s) before you can start.
            Current: {approvedMembers.length}/{minMembers} minimum required.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert className="bg-green-50 border-green-200">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertTitle className="text-green-800">Ready to Start!</AlertTitle>
          <AlertDescription className="text-green-700">
            You have {approvedMembers.length} approved members (minimum: {minMembers}). 
            Start the chama to begin the contribution cycle.
          </AlertDescription>
        </Alert>
      )}

      {/* Members Ready to Participate */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <CardTitle>Members ({approvedMembers.length})</CardTitle>
          </div>
          <CardDescription>
            These members will participate when the chama starts. Payout order is set on start
            based on payment track record — members who completed a past chama come first, new
            members are shuffled fairly.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sortedMembers.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              No approved members yet
            </p>
          ) : (
            <div className="space-y-3">
              {sortedMembers.map((member, index) => (
                <div 
                  key={member.id} 
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">
                      {index + 1}
                    </div>
                    <Avatar className="h-8 w-8">
                      <AvatarFallback>
                        {member.profiles?.full_name?.charAt(0).toUpperCase() || '?'}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">
                        {member.profiles?.full_name || 'Unknown'}
                        {member.is_manager && (
                          <Badge variant="secondary" className="ml-2 text-xs">Manager</Badge>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Joined {member.joined_at ? formatDate(member.joined_at) : 'N/A'}
                      </p>
                    </div>
                  </div>
                  {provenUsers.has(member.user_id) ? (
                    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                      Proven
                    </Badge>
                  ) : (
                    <Badge variant="outline">New</Badge>
                  )}
                </div>
              ))}

            </div>
          )}
        </CardContent>
      </Card>

      {/* Schedule preview — exactly what happens if you start today */}
      <Card className="border-dashed">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            If you start today
          </CardTitle>
          <CardDescription>{scheduleSummary}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <div className="rounded-md border p-3 space-y-1">
            <p>
              <span className="text-muted-foreground">Cycle 1 closes:</span>{' '}
              <strong>{cycle1Label}</strong>
            </p>
            <p>
              <span className="text-muted-foreground">First payout:</span>{' '}
              <strong>right after cycle 1 closes</strong>
            </p>
            <p>
              <span className="text-muted-foreground">Cycle 2 closes:</span>{' '}
              <strong>{cycle2Label}</strong>
            </p>
          </div>
          <div className="text-muted-foreground space-y-1">
            <p>• Members must pay before each cycle deadline</p>
            <p>• Payout positions are assigned by payment track record (proven members first)</p>
            <p>• Members will receive SMS notifications with their contribution schedule</p>
            <p>• The first member in order receives the pooled contributions when cycle 1 closes</p>
          </div>
        </CardContent>
      </Card>


      {/* Start Button */}
      {isManager && (
        <div className="flex justify-center">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button 
                size="lg" 
                disabled={!canStart || isStarting}
                className="w-full max-w-md"
              >
                {isStarting ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Starting Chama...
                  </>
                ) : (
                  <>
                    <Play className="h-5 w-5 mr-2" />
                    Start Chama ({approvedMembers.length} members)
                  </>
                )}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Start "{chamaName}"?</AlertDialogTitle>
                <AlertDialogDescription className="space-y-2">
                  <p>This action will:</p>
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    <li className="text-green-700">
                      Activate <strong>{approvedMembers.length}</strong> member(s)
                    </li>
                    <li>
                      Start cycle 1, closing <strong>{cycle1Label}</strong> — first payout follows immediately
                    </li>
                    <li>
                      Cycle 2 will close <strong>{cycle2Label}</strong>
                    </li>
                    <li>Send SMS notifications to all members</li>
                    <li>Members will need to contribute KES {contributionAmount.toLocaleString()}</li>
                  </ul>
                  <p className="font-semibold mt-2">This action cannot be undone.</p>

                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onStart} disabled={isStarting}>
                  {isStarting ? 'Starting...' : 'Yes, Start Chama'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
};
