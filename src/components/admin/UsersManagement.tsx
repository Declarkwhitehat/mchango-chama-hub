import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Search, Shield, ShieldOff, Loader2, ExternalLink, Key, Trash2, RotateCcw, AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format, differenceInDays } from "date-fns";

interface User {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  kyc_status: string;
  created_at: string;
  deleted_at: string | null;
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
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [pendingDeleteUser, setPendingDeleteUser] = useState<User | null>(null);
  const [deleteCodeError, setDeleteCodeError] = useState(false);
  const [deleteNameError, setDeleteNameError] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [restorePrivilegeCode, setRestorePrivilegeCode] = useState("");
  const [pendingRestoreUser, setPendingRestoreUser] = useState<User | null>(null);
  const [restoreCodeError, setRestoreCodeError] = useState(false);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const { data: usersData, error: usersError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (usersError) throw usersError;

      const { data: rolesData, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role');

      if (rolesError) throw rolesError;

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

  const handleDeleteClick = (user: User) => {
    setPendingDeleteUser(user);
    setDeletePrivilegeCode("");
    setDeleteConfirmName("");
    setDeleteCodeError(false);
    setDeleteNameError(false);
    setDeleteDialogOpen(true);
  };

  const confirmDeleteUser = async () => {
    if (!pendingDeleteUser) return;
    setDeleting(true);
    try {
      const response = await supabase.functions.invoke('admin-delete-user', {
        body: { 
          user_id: pendingDeleteUser.id, 
          privilege_code: deletePrivilegeCode,
          confirm_name: deleteConfirmName,
        },
      });

      if (response.error) throw new Error(response.error.message || 'Failed to delete user');
      if (response.data?.error) throw new Error(response.data.error);

      toast({ title: "Success", description: response.data?.message || "User account deleted" });
      setDeleteDialogOpen(false);
      await fetchUsers();
    } catch (error: any) {
      console.error('Error deleting user:', error);
      if (error.message?.includes('privilege code')) {
        setDeleteCodeError(true);
      } else if (error.message?.includes('Name confirmation')) {
        setDeleteNameError(true);
      }
      toast({
        title: "Error",
        description: error.message || "Failed to delete user",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleRestoreClick = (user: User) => {
    setPendingRestoreUser(user);
    setRestorePrivilegeCode("");
    setRestoreCodeError(false);
    setRestoreDialogOpen(true);
  };

  const confirmRestoreUser = async () => {
    if (!pendingRestoreUser) return;
    setRestoring(true);
    try {
      const response = await supabase.functions.invoke('admin-delete-user', {
        body: { 
          user_id: pendingRestoreUser.id, 
          privilege_code: restorePrivilegeCode,
          action: 'restore',
        },
      });

      if (response.error) throw new Error(response.error.message || 'Failed to restore user');
      if (response.data?.error) throw new Error(response.data.error);

      toast({ title: "Success", description: "User account restored successfully" });
      setRestoreDialogOpen(false);
      await fetchUsers();
    } catch (error: any) {
      console.error('Error restoring user:', error);
      if (error.message?.includes('privilege code')) {
        setRestoreCodeError(true);
      }
      toast({
        title: "Error",
        description: error.message || "Failed to restore user",
        variant: "destructive",
      });
    } finally {
      setRestoring(false);
    }
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = 
      user.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.phone.includes(searchTerm);

    const isDeleted = !!user.deleted_at;
    
    let matchesStatus = true;
    if (statusFilter === "all") {
      matchesStatus = true;
    } else if (statusFilter === "deleted") {
      matchesStatus = isDeleted;
    } else {
      matchesStatus = !isDeleted && user.kyc_status === statusFilter;
    }

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

  const getDaysRemaining = (deletedAt: string) => {
    const daysSinceDeleted = differenceInDays(new Date(), new Date(deletedAt));
    return Math.max(0, 45 - daysSinceDeleted);
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

  const activeUsers = users.filter(u => !u.deleted_at);
  const deletedUsers = users.filter(u => !!u.deleted_at);

  return (
    <Card>
      <CardHeader>
        <CardTitle>User Management</CardTitle>
        <CardDescription>
          View and manage all registered users ({activeUsers.length} active, {deletedUsers.length} deleted)
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
              <SelectItem value="deleted">Deleted</SelectItem>
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
              const isDeleted = !!user.deleted_at;
              const daysRemaining = isDeleted ? getDaysRemaining(user.deleted_at!) : 0;
              
              return (
                <div
                  key={user.id}
                  className={`flex items-center justify-between p-4 border rounded-lg ${isDeleted ? 'opacity-70 border-destructive/30 bg-destructive/5' : ''}`}
                >
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={`font-medium ${isDeleted ? 'line-through' : ''}`}>{user.full_name}</p>
                      {isDeleted && (
                        <Badge variant="destructive" className="flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Deleted ({daysRemaining}d remaining)
                        </Badge>
                      )}
                      {isAdmin && !isDeleted && (
                        <Badge variant="default">
                          <Shield className="h-3 w-3 mr-1" />
                          Admin
                        </Badge>
                      )}
                      {!isDeleted && getKycBadge(user.kyc_status)}
                    </div>
                    <p className="text-sm text-muted-foreground">{user.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {user.phone} • Joined {format(new Date(user.created_at), "MMM d, yyyy")}
                      {isDeleted && user.deleted_at && (
                        <> • Deleted {format(new Date(user.deleted_at), "MMM d, yyyy")}</>
                      )}
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
                    {isDeleted ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRestoreClick(user)}
                        disabled={restoring}
                      >
                        <RotateCcw className="h-4 w-4 mr-1" />
                        Restore
                      </Button>
                    ) : (
                      <>
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
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDeleteClick(user)}
                          disabled={deleting}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Delete
                        </Button>
                      </>
                    )}
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

      {/* Delete User Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Delete User Account
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              <p>
                This will delete the user's account. The account will remain visible 
                in the admin dashboard for <strong>45 days</strong> before permanent removal. 
                You can restore it during that period.
              </p>
              <div className="space-y-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Type the user's full name to confirm:</p>
                  <p className="text-sm text-muted-foreground font-mono bg-muted px-2 py-1 rounded">
                    {pendingDeleteUser?.full_name}
                  </p>
                  <Input
                    placeholder="Type full name exactly as shown above"
                    value={deleteConfirmName}
                    onChange={(e) => {
                      setDeleteConfirmName(e.target.value);
                      setDeleteNameError(false);
                    }}
                    className={deleteNameError ? "border-destructive" : ""}
                  />
                  {deleteNameError && (
                    <p className="text-sm text-destructive">Name does not match</p>
                  )}
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium">Enter privilege code:</p>
                  <Input
                    type="password"
                    placeholder="Enter privilege code"
                    value={deletePrivilegeCode}
                    onChange={(e) => {
                      setDeletePrivilegeCode(e.target.value);
                      setDeleteCodeError(false);
                    }}
                    className={deleteCodeError ? "border-destructive" : ""}
                  />
                  {deleteCodeError && (
                    <p className="text-sm text-destructive">Invalid privilege code</p>
                  )}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setDeletePrivilegeCode("");
              setDeleteConfirmName("");
              setDeleteCodeError(false);
              setDeleteNameError(false);
              setPendingDeleteUser(null);
            }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteUser}
              disabled={!deletePrivilegeCode || !deleteConfirmName || deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Delete User
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Restore User Dialog */}
      <AlertDialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5" />
              Restore User Account
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              <p>
                Restore <strong>{pendingRestoreUser?.full_name}</strong>'s account? 
                They will be able to log in again.
              </p>
              <div className="space-y-2">
                <Input
                  type="password"
                  placeholder="Enter privilege code"
                  value={restorePrivilegeCode}
                  onChange={(e) => {
                    setRestorePrivilegeCode(e.target.value);
                    setRestoreCodeError(false);
                  }}
                  className={restoreCodeError ? "border-destructive" : ""}
                />
                {restoreCodeError && (
                  <p className="text-sm text-destructive">Invalid privilege code</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRestoreUser}
              disabled={!restorePrivilegeCode || restoring}
            >
              {restoring ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Restore Account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};
