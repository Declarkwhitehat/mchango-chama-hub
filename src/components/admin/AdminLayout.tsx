import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar } from "./AdminSidebar";
import { AdminBreadcrumbs } from "./AdminBreadcrumbs";
import { AdminGlobalSearch } from "./AdminGlobalSearch";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { LogOut, User, Bell, RefreshCw } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface AdminLayoutProps {
  children: React.ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [totalPending, setTotalPending] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    fetchPendingCounts();
  }, []);

  const fetchPendingCounts = async () => {
    const [kycResult, withdrawalsResult, callbacksResult] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('kyc_status', 'pending').not('kyc_submitted_at', 'is', null),
      supabase.from('withdrawals').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('customer_callbacks').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    ]);

    const total = (kycResult.count || 0) + (withdrawalsResult.count || 0) + (callbacksResult.count || 0);
    setTotalPending(total);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    // Trigger a page reload for data refresh
    window.location.reload();
  };

  const getPageTitle = () => {
    const path = location.pathname;
    if (path === "/admin") return "Dashboard";
    if (path.includes("/kyc")) return "KYC Management";
    if (path.includes("/users")) return "Users";
    if (path.includes("/user/")) return "User Details";
    if (path.includes("/transactions")) return "Transactions";
    if (path.includes("/withdrawals")) return "Withdrawals";
    if (path.includes("/chamas")) return "Chama Groups";
    if (path.includes("/campaigns")) return "Campaigns";
    if (path.includes("/callbacks")) return "Customer Callbacks";
    if (path.includes("/audit")) return "Audit Logs";
    if (path.includes("/search")) return "Member Search";
    if (path.includes("/export")) return "Data Export";
    if (path.includes("/payment-config")) return "Payment Config";
    return "Admin";
  };

  return (
    <SidebarProvider defaultOpen={true}>
      <div className="min-h-screen flex w-full bg-background">
        <AdminSidebar />
        
        <div className="flex-1 flex flex-col w-full min-w-0">
          {/* Header */}
          <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="flex h-14 items-center gap-4 px-4 lg:px-6">
              <SidebarTrigger />
              
              {/* Page Title - Hidden on mobile */}
              <h1 className="text-lg font-semibold hidden md:block">{getPageTitle()}</h1>
              
              <div className="flex-1" />
              
              {/* Global Search */}
              <AdminGlobalSearch />
              
              {/* Refresh Button */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                  >
                    <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Refresh data</TooltipContent>
              </Tooltip>
              
              {/* Notifications Bell */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="relative">
                    <Bell className="h-4 w-4" />
                    {totalPending > 0 && (
                      <Badge 
                        variant="destructive" 
                        className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
                      >
                        {totalPending > 9 ? "9+" : totalPending}
                      </Badge>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72">
                  <DropdownMenuLabel>Pending Actions</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate("/admin/kyc")} className="cursor-pointer">
                    <div className="flex flex-col gap-1">
                      <span className="font-medium">KYC Submissions</span>
                      <span className="text-xs text-muted-foreground">Review pending identity verifications</span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/admin/withdrawals")} className="cursor-pointer">
                    <div className="flex flex-col gap-1">
                      <span className="font-medium">Withdrawals</span>
                      <span className="text-xs text-muted-foreground">Process pending withdrawal requests</span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/admin/callbacks")} className="cursor-pointer">
                    <div className="flex flex-col gap-1">
                      <span className="font-medium">Customer Callbacks</span>
                      <span className="text-xs text-muted-foreground">Respond to customer inquiries</span>
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              
              {/* Theme Toggle */}
              <ThemeToggle />
              
              {/* Profile Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-full">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                        {profile?.full_name?.charAt(0) || "A"}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">
                        {profile?.full_name || "Admin"}
                      </p>
                      <p className="text-xs leading-none text-muted-foreground">
                        {profile?.email}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate("/profile")} className="cursor-pointer">
                    <User className="mr-2 h-4 w-4" />
                    Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer">
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          {/* Breadcrumbs */}
          <AdminBreadcrumbs />

          {/* Main Content */}
          <main className="flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
