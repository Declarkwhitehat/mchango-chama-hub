import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, Users, TrendingUp, DollarSign, Calendar } from "lucide-react";
import { format } from "date-fns";

interface Member {
  id: string;
  user_id: string;
  current_savings: number;
  lifetime_deposits: number;
  is_loan_eligible: boolean;
  joined_at: string;
  is_approved: boolean;
  status: string;
  unique_member_id: string;
  profiles: {
    full_name: string;
    email: string;
    phone: string;
  };
}

interface SavingsGroupDetailCardProps {
  group: any;
  members: Member[];
}

export const SavingsGroupDetailCard = ({ group, members }: SavingsGroupDetailCardProps) => {
  const [expanded, setExpanded] = useState(false);

  const activeMembers = members.filter(m => m.status === 'active' && m.is_approved);
  const pendingMembers = members.filter(m => !m.is_approved);
  const progressPercent = group.saving_goal > 0 
    ? Math.round((Number(group.total_group_savings) / Number(group.saving_goal)) * 100)
    : 0;

  return (
    <Card className="border-2 hover:border-primary/50 transition-colors">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-3">
              <CardTitle className="text-xl">{group.name}</CardTitle>
              <Badge variant={group.status === 'active' ? 'default' : 'secondary'}>
                {group.status}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground line-clamp-2">
              {group.description}
            </p>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                Manager: {group.profiles?.full_name}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Created {format(new Date(group.created_at), "MMM d, yyyy")}
              </span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Key Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted/30 rounded-lg">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Members</p>
            <p className="text-lg font-bold">
              {activeMembers.length} / {group.max_members}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Total Savings</p>
            <p className="text-lg font-bold text-green-600">
              KES {Number(group.total_group_savings).toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Saving Goal</p>
            <p className="text-lg font-bold">
              KES {Number(group.saving_goal).toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Progress</p>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <p className="text-lg font-bold">{progressPercent}%</p>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Goal Progress</span>
            <span className="font-medium">{progressPercent}%</span>
          </div>
          <div className="h-3 bg-muted rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-green-500 to-green-600 transition-all duration-500"
              style={{ width: `${Math.min(progressPercent, 100)}%` }}
            />
          </div>
        </div>

        {/* Member List - Expanded View */}
        {expanded && (
          <div className="space-y-4 pt-4 border-t">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold flex items-center gap-2">
                <Users className="h-4 w-4" />
                Active Members ({activeMembers.length})
              </h4>
            </div>

            {activeMembers.length > 0 ? (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {activeMembers.map((member) => (
                  <div
                    key={member.id}
                    className="p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{member.profiles?.full_name}</p>
                          {member.is_loan_eligible && (
                            <Badge variant="secondary" className="text-xs">
                              Loan Eligible
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {member.unique_member_id || 'No ID'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {member.profiles?.email} • {member.profiles?.phone}
                        </p>
                      </div>
                      <div className="text-right space-y-1">
                        <div>
                          <p className="text-xs text-muted-foreground">Current Savings</p>
                          <p className="font-semibold text-green-600">
                            KES {Number(member.current_savings).toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Lifetime</p>
                          <p className="text-xs font-medium">
                            KES {Number(member.lifetime_deposits).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                      <span>Joined {format(new Date(member.joined_at), "MMM d, yyyy")}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-4">No active members</p>
            )}

            {/* Pending Members */}
            {pendingMembers.length > 0 && (
              <>
                <div className="flex items-center justify-between pt-4 border-t">
                  <h4 className="font-semibold text-orange-600">
                    Pending Approval ({pendingMembers.length})
                  </h4>
                </div>
                <div className="space-y-2">
                  {pendingMembers.map((member) => (
                    <div
                      key={member.id}
                      className="p-3 border border-orange-200 rounded-lg bg-orange-50/50"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{member.profiles?.full_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {member.profiles?.email}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-orange-600">
                          Pending
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Additional Stats */}
            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
              <div className="p-3 bg-muted/30 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Monthly Target</p>
                <p className="font-semibold flex items-center gap-1">
                  <DollarSign className="h-3 w-3" />
                  KES {Number(group.monthly_target).toLocaleString()}
                </p>
              </div>
              <div className="p-3 bg-muted/30 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Total Profits</p>
                <p className="font-semibold flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" />
                  KES {Number(group.total_profits || 0).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
