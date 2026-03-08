import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Search, Shield, ShieldOff, Loader2, ExternalLink, Key, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";

interface User {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  kyc_status: string;
  created_at: string;
}

interface UserRole {
  role: string;
}

const ADMIN_PRIVILEGE_CODE = "D3E9C0L1A3R9K";

export const UsersManagement = () => {
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [userRoles, setUserRoles] = useState<Record<string, UserRole[]>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [processing, setProcessing] = useState<string | null>(null);
  const [adminDialogOpen, setAdminDialogOpen] = useState(false);
  const [privilegeCode, setPrivilegeCode] = useState("");
  const [pendingAdminUserId, setPendingAdminUserId] = useState<string | null>(null);
  const [codeError, setCodeError] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletePrivilegeCode, setDeletePrivilegeCode] = useState("");
  const [pendingDeleteUserId, setPendingDeleteUserId] = useState<string | null>(null);
  const [deleteCodeError, setDeleteCodeError] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      // Fetch users
      const { data: usersData, error: usersError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (usersError) throw usersError;

      // Fetch user roles separately
      const { data: rolesData, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role');

      if (rolesError) throw rolesError;

      // Map roles by user_id
      const rolesMap: Record<string, UserRole[]> = {};
      rolesData?.forEach(role => {
        if (!rolesMap[role.user_id]) {
          rolesMap[role.user_id] = [];
        }
        rolesMap[role.user_id].push({ role: role.role });
      });

      setUsers(usersData || []);
      setUserRoles(rolesMap);
    } catch (error: any) {
      console.error('Error fetching users:', error);
      toast({
        title: "Error",
        description: "Failed to load users",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleMakeAdminClick = (userId: string) => {
    setPendingAdminUserId(userId);
    setPrivilegeCode("");
    setCodeError(false);
    setAdminDialogOpen(true);
  };

  const confirmGrantAdmin = async () => {
    if (privilegeCode !== ADMIN_PRIVILEGE_CODE) {
      setCodeError(true);
      toast({
        title: "Invalid Code",
        description: "The privilege code you entered is incorrect",
        variant: "destructive",
      });
      return;
    }

    if (!pendingAdminUserId) return;

    setProcessing(pendingAdminUserId);
    setAdminDialogOpen(false);

    try {
      const { error } = await supabase
        .from('user_roles')
        .insert({ user_id: pendingAdminUserId, role: 'admin' });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Admin role granted",
      });

      await fetchUsers();
    } catch (error: any) {
      console.error('Error granting admin role:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to grant admin role",
        variant: "destructive",
      });
    } finally {
      setProcessing(null);
      setPendingAdminUserId(null);
      setPrivilegeCode("");
    }
  };

  const removeAdminRole = async (userId: string) => {
    setProcessing(userId);
    try {
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId)
        .eq('role', 'admin');

      if (error) throw error;

      toast({
        title: "Success",
        description: "Admin role removed",
      });

      await fetchUsers();
    } catch (error: any) {
      console.error('Error removing admin role:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to remove admin role",
        variant: "destructive",
      });
    } finally {
      setProcessing(null);
    }
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = 
      user.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.phone.includes(searchTerm);

    const matchesStatus = 
      statusFilter === "all" || 
      user.kyc_status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const getKycBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-500">Approved</Badge>;
      case 'rejected':
        return <Badge variant="destructive">Rejected</Badge>;
      case 'pending':
      default:
        return <Badge variant="secondary">Pending</Badge>;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>User Management</CardTitle>
        <CardDescription>
          View and manage all registered users ({users.length} total)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="KYC Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Users List */}
        <div className="space-y-3">
          {filteredUsers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No users found</p>
            </div>
          ) : (
            filteredUsers.map((user) => {
              const userRolesList = userRoles[user.id] || [];
              const isAdmin = userRolesList.some(r => r.role === 'admin');
              
              return (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{user.full_name}</p>
                      {isAdmin && (
                        <Badge variant="default">
                          <Shield className="h-3 w-3 mr-1" />
                          Admin
                        </Badge>
                      )}
                      {getKycBadge(user.kyc_status)}
                    </div>
                    <p className="text-sm text-muted-foreground">{user.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {user.phone} • Joined {format(new Date(user.created_at), "MMM d, yyyy")}
                    </p>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(`/admin/user/${user.id}`)}
                    >
                      <ExternalLink className="h-4 w-4 mr-1" />
                      View Details
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => isAdmin ? removeAdminRole(user.id) : handleMakeAdminClick(user.id)}
                      disabled={processing === user.id}
                    >
                      {processing === user.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : isAdmin ? (
                        <>
                          <ShieldOff className="h-4 w-4 mr-1" />
                          Remove Admin
                        </>
                      ) : (
                        <>
                          <Shield className="h-4 w-4 mr-1" />
                          Make Admin
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </CardContent>

      {/* Admin Privilege Code Dialog */}
      <AlertDialog open={adminDialogOpen} onOpenChange={setAdminDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Admin Privilege Required
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              <p>
                To grant admin privileges, you must enter the admin privilege code.
                This is a security measure to prevent unauthorized admin creation.
              </p>
              <div className="space-y-2">
                <Input
                  type="password"
                  placeholder="Enter privilege code"
                  value={privilegeCode}
                  onChange={(e) => {
                    setPrivilegeCode(e.target.value);
                    setCodeError(false);
                  }}
                  className={codeError ? "border-destructive" : ""}
                />
                {codeError && (
                  <p className="text-sm text-destructive">Invalid privilege code</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setPrivilegeCode("");
              setCodeError(false);
              setPendingAdminUserId(null);
            }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmGrantAdmin}
              disabled={!privilegeCode}
            >
              Grant Admin Access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};
