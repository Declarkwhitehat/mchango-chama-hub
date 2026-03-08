import { 
  LayoutDashboard, 
  FileCheck, 
  Users, 
  DollarSign, 
  TrendingUp, 
  Activity, 
  PhoneCall,
  FileText,
  Search,
  Download,
  Settings,
  Home,
  ChevronLeft,
  Shield,
  Building2,
  Landmark,
  BadgeCheck,
  ShieldAlert,
  CheckCircle
} from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface MenuItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number | null;
}

export function AdminSidebar() {
  const { open } = useSidebar();
  const navigate = useNavigate();
  const [pendingKyc, setPendingKyc] = useState(0);
  const [pendingWithdrawals, setPendingWithdrawals] = useState(0);
  const [pendingCallbacks, setPendingCallbacks] = useState(0);
  const [pendingVerifications, setPendingVerifications] = useState(0);
  const [pendingPayoutApprovals, setPendingPayoutApprovals] = useState(0);
  const [pendingExecChanges, setPendingExecChanges] = useState(0);

  useEffect(() => {
    fetchPendingCounts();
  }, []);

  const fetchPendingCounts = async () => {
    const { count: kycCount } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('kyc_status', 'pending')
      .not('kyc_submitted_at', 'is', null);

    const { count: withdrawalsCount } = await supabase
      .from('withdrawals')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    const { count: callbacksCount } = await supabase
      .from('customer_callbacks')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    const { count: verificationsCount } = await supabase
      .from('verification_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    const { count: payoutApprovalsCount } = await supabase
      .from('payout_approval_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    setPendingKyc(kycCount || 0);
    setPendingWithdrawals(withdrawalsCount || 0);
    setPendingCallbacks(callbacksCount || 0);
    setPendingVerifications(verificationsCount || 0);
    setPendingPayoutApprovals(payoutApprovalsCount || 0);
  };

  const mainMenuItems: MenuItem[] = [
    { title: "Dashboard", url: "/admin", icon: LayoutDashboard },
  ];

  const usersKycItems: MenuItem[] = [
    { 
      title: "KYC Management", 
      url: "/admin/kyc", 
      icon: FileCheck,
      badge: pendingKyc > 0 ? pendingKyc : null
    },
    { title: "Users Management", url: "/admin/users", icon: Users },
    { title: "Member Search", url: "/admin/search", icon: Search },
  ];

  const groupsItems: MenuItem[] = [
    { title: "Chama Groups", url: "/admin/chamas", icon: Activity },
    { title: "Campaigns", url: "/admin/campaigns", icon: TrendingUp },
    { title: "Organizations", url: "/admin/organizations", icon: Building2 },
    { title: "Welfare Groups", url: "/admin/welfares", icon: Shield },
    { 
      title: "Verification Requests", 
      url: "/admin/verification-requests", 
      icon: BadgeCheck,
      badge: pendingVerifications > 0 ? pendingVerifications : null
    },
  ];

  const financialItems: MenuItem[] = [
    { title: "Revenue", url: "/admin/revenue", icon: TrendingUp },
    { title: "Transactions", url: "/admin/transactions", icon: DollarSign },
    { 
      title: "Withdrawals", 
      url: "/admin/withdrawals", 
      icon: DollarSign,
      badge: pendingWithdrawals > 0 ? pendingWithdrawals : null
    },
    {
      title: "Payout Approvals",
      url: "/admin/payout-approvals",
      icon: CheckCircle,
      badge: pendingPayoutApprovals > 0 ? pendingPayoutApprovals : null
    },
    { title: "Commission Analytics", url: "/admin/commission-analytics", icon: TrendingUp },
    { title: "Financial Ledger", url: "/admin/ledger", icon: Landmark },
    { title: "Payment Config", url: "/admin/payment-config", icon: Settings },
    { title: "Payment Search", url: "/admin/payment-search", icon: Search },
  ];

  const supportItems: MenuItem[] = [
    { 
      title: "Customer Callbacks", 
      url: "/admin/callbacks", 
      icon: PhoneCall,
      badge: pendingCallbacks > 0 ? pendingCallbacks : null
    },
  ];

  const securityItems: MenuItem[] = [
    { title: "Fraud & Risk", url: "/admin/fraud-monitoring", icon: ShieldAlert },
    { title: "Fraud Config", url: "/admin/fraud-config", icon: Settings },
  ];

  const systemItems: MenuItem[] = [
    { title: "Audit Logs", url: "/admin/audit", icon: FileText },
    { title: "Data Export", url: "/admin/export", icon: Download },
  ];

  const renderMenuItem = (item: MenuItem) => {
    const content = (
      <NavLink 
        to={item.url} 
        end={item.url === "/admin"}
        className={({ isActive }) => 
          `flex items-center gap-3 rounded-lg px-3 py-2 transition-all hover:bg-accent/50 relative ${
            isActive 
              ? 'bg-accent text-accent-foreground font-medium before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-6 before:w-1 before:bg-primary before:rounded-r' 
              : 'text-muted-foreground'
          }`
        }
      >
        <item.icon className="h-4 w-4 flex-shrink-0" />
        {open && <span className="truncate">{item.title}</span>}
        {item.badge && item.badge > 0 && (
          open ? (
            <Badge variant="destructive" className="ml-auto">
              {item.badge}
            </Badge>
          ) : (
            <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-destructive" />
          )
        )}
      </NavLink>
    );

    if (!open) {
      return (
        <Tooltip key={item.title}>
          <TooltipTrigger asChild>
            <SidebarMenuButton asChild>
              {content}
            </SidebarMenuButton>
          </TooltipTrigger>
          <TooltipContent side="right" className="flex items-center gap-2">
            {item.title}
            {item.badge && item.badge > 0 && (
              <Badge variant="destructive" className="text-xs">
                {item.badge}
              </Badge>
            )}
          </TooltipContent>
        </Tooltip>
      );
    }

    return (
      <SidebarMenuButton asChild key={item.title}>
        {content}
      </SidebarMenuButton>
    );
  };

  const renderMenuGroup = (label: string, items: MenuItem[]) => (
    <SidebarGroup>
      <SidebarGroupLabel className={!open ? "sr-only" : ""}>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              {renderMenuItem(item)}
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );

  return (
    <Sidebar collapsible="icon" className="border-r border-border">
      {/* Sidebar Header with Branding */}
      <SidebarHeader className="border-b border-border p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Shield className="h-4 w-4" />
          </div>
          {open && (
            <div className="flex flex-col">
              <span className="font-semibold text-sm">Admin Panel</span>
              <span className="text-xs text-muted-foreground">Mchango Platform</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="pt-2">
        {renderMenuGroup("Main", mainMenuItems)}
        {renderMenuGroup("Users & KYC", usersKycItems)}
        {renderMenuGroup("Groups", groupsItems)}
        {renderMenuGroup("Financial", financialItems)}
        {renderMenuGroup("Security", securityItems)}
        {renderMenuGroup("Support", supportItems)}
        {renderMenuGroup("System", systemItems)}
      </SidebarContent>

      {/* Sidebar Footer with Back to App */}
      <SidebarFooter className="border-t border-border p-3">
        {open ? (
          <Button 
            variant="outline" 
            className="w-full justify-start gap-2"
            onClick={() => navigate('/home')}
          >
            <ChevronLeft className="h-4 w-4" />
            Back to App
          </Button>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="outline" 
                size="icon"
                className="w-full"
                onClick={() => navigate('/home')}
              >
                <Home className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Back to App</TooltipContent>
          </Tooltip>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
