import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { 
  CheckCircle2, 
  XCircle, 
  Users, 
  AlertTriangle, 
  Play,
  Loader2
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
}

export const PreStartDashboard = ({
  chamaId,
  chamaName,
  contributionAmount,
  minMembers,
  members,
  isManager,
  onStart,
  isStarting
}: PreStartDashboardProps) => {
  const approvedMembers = members.filter(m => m.approval_status === 'approved');
  const paidMembers = approvedMembers.filter(m => m.first_payment_completed);
  const unpaidMembers = approvedMembers.filter(m => !m.first_payment_completed);
  
  const canStart = paidMembers.length >= minMembers;
  const membersNeeded = minMembers - paidMembers.length;

  // Sort paid members by payment time
  const sortedPaidMembers = [...paidMembers].sort((a, b) => {
    const aTime = a.first_payment_at ? new Date(a.first_payment_at).getTime() : 0;
    const bTime = b.first_payment_at ? new Date(b.first_payment_at).getTime() : 0;
    return aTime - bTime;
  });

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600">{paidMembers.length}</div>
              <p className="text-sm text-muted-foreground">Paid & Ready</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-amber-600">{unpaidMembers.length}</div>
              <p className="text-sm text-muted-foreground">Not Paid</p>
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
            You need {membersNeeded} more member(s) to pay their first contribution before you can start.
            Current: {paidMembers.length}/{minMembers} minimum required.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert className="bg-green-50 border-green-200">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertTitle className="text-green-800">Ready to Start!</AlertTitle>
          <AlertDescription className="text-green-700">
            You have {paidMembers.length} paid members (minimum: {minMembers}). 
            {unpaidMembers.length > 0 && (
              <span className="font-semibold"> {unpaidMembers.length} member(s) will be removed for not paying.</span>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Ready Members (Paid) */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <CardTitle>Ready to Start ({paidMembers.length})</CardTitle>
          </div>
          <CardDescription>
            These members have paid and will be active when the chama starts
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sortedPaidMembers.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              No members have paid yet
            </p>
          ) : (
            <div className="space-y-3">
              {sortedPaidMembers.map((member, index) => (
                <div 
                  key={member.id} 
                  className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-100"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-green-600 text-white flex items-center justify-center font-bold text-sm">
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
                      <p className="text-xs text-muted-foreground">
                        Paid {member.first_payment_at && new Date(member.first_payment_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Position #{index + 1}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Unpaid Members (Will Be Removed) */}
      {unpaidMembers.length > 0 && (
        <Card className="border-amber-500/50">
          <CardHeader>
            <div className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-amber-600" />
              <CardTitle className="text-amber-800">Will Be Removed ({unpaidMembers.length})</CardTitle>
            </div>
            <CardDescription>
              These members have not paid and will be removed when the chama starts
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {unpaidMembers.map((member) => (
                <div 
                  key={member.id} 
                  className="flex items-center justify-between p-3 bg-amber-50 rounded-lg border border-amber-200"
                >
                  <div className="flex items-center gap-3">
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
                      <p className="text-xs text-muted-foreground">
                        Awaiting payment of KES {contributionAmount.toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Not Paid
                  </Badge>
                </div>
              ))}
            </div>
            
            <Alert className="mt-4 bg-amber-50 border-amber-200">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800">
                These members will be marked as "REMOVED - NO FIRST PAYMENT" and excluded from this cycle.
                They will be notified via SMS.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}

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
                    Start Chama
                    {unpaidMembers.length > 0 && ` (${unpaidMembers.length} will be removed)`}
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
                      Activate <strong>{paidMembers.length}</strong> paid member(s)
                    </li>
                    {unpaidMembers.length > 0 && (
                      <li className="text-amber-700">
                        Remove <strong>{unpaidMembers.length}</strong> unpaid member(s)
                      </li>
                    )}
                    <li>Create the first contribution cycle</li>
                    <li>Send SMS notifications to all members</li>
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
