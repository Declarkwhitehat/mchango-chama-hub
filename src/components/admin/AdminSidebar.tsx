import { 
  LayoutDashboard, 
  FileCheck, 
  Users, 
  DollarSign, 
  TrendingUp, 
  Activity, 
  PiggyBank,
  PhoneCall,
  FileText,
  Settings,
  Search,
  Download
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function AdminSidebar() {
  const { open } = useSidebar();
  const [pendingKyc, setPendingKyc] = useState(0);
  const [pendingWithdrawals, setPendingWithdrawals] = useState(0);
  const [pendingCallbacks, setPendingCallbacks] = useState(0);

  useEffect(() => {
    fetchPendingCounts();
  }, []);

  const fetchPendingCounts = async () => {
    // Fetch pending KYC count
    const { count: kycCount } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('kyc_status', 'pending')
      .not('kyc_submitted_at', 'is', null);

    // Fetch pending withdrawals count
    const { count: withdrawalsCount } = await supabase
      .from('withdrawals')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    // Fetch pending callbacks count
    const { count: callbacksCount } = await supabase
      .from('customer_callbacks')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    setPendingKyc(kycCount || 0);
    setPendingWithdrawals(withdrawalsCount || 0);
    setPendingCallbacks(callbacksCount || 0);
  };

  const mainMenuItems = [
    { title: "Dashboard", url: "/admin", icon: LayoutDashboard },
    { 
      title: "KYC Management", 
      url: "/admin/kyc", 
      icon: FileCheck,
      badge: pendingKyc > 0 ? pendingKyc : null
    },
  ];

  const groupsItems = [
    { title: "Chama Groups", url: "/admin/chamas", icon: Activity },
    { title: "Savings Groups", url: "/admin/savings-groups", icon: PiggyBank },
    { title: "Campaigns", url: "/admin/campaigns", icon: TrendingUp },
  ];

  const financialItems = [
    { title: "Transactions", url: "/admin/transactions", icon: DollarSign },
    { 
      title: "Withdrawals", 
      url: "/admin/withdrawals", 
      icon: DollarSign,
      badge: pendingWithdrawals > 0 ? pendingWithdrawals : null
    },
  ];

  const supportItems = [
    { 
      title: "Customer Callbacks", 
      url: "/admin/callbacks", 
      icon: PhoneCall,
      badge: pendingCallbacks > 0 ? pendingCallbacks : null
    },
    { title: "Audit Logs", url: "/admin/audit", icon: FileText },
  ];

  const toolsItems = [
    { title: "Users Management", url: "/admin/users", icon: Users },
    { title: "Member Search", url: "/admin/search", icon: Search },
    { title: "Data Export", url: "/admin/export", icon: Download },
  ];

  return (
    <Sidebar collapsible="icon" className="border-r border-border">
      <SidebarContent>
        {/* Main Navigation */}
        <SidebarGroup>
          <SidebarGroupLabel>Main</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainMenuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink 
                      to={item.url} 
                      end
                      className={({ isActive }) => 
                        `flex items-center gap-3 rounded-lg px-3 py-2 transition-all hover:bg-accent/50 ${
                          isActive ? 'bg-accent text-accent-foreground font-medium' : 'text-muted-foreground'
                        }`
                      }
                    >
                      <item.icon className="h-4 w-4" />
                      {open && <span>{item.title}</span>}
                      {open && item.badge && (
                        <Badge variant="destructive" className="ml-auto">
                          {item.badge}
                        </Badge>
                      )}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Groups Management */}
        <SidebarGroup>
          <SidebarGroupLabel>Groups</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {groupsItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink 
                      to={item.url}
                      className={({ isActive }) => 
                        `flex items-center gap-3 rounded-lg px-3 py-2 transition-all hover:bg-accent/50 ${
                          isActive ? 'bg-accent text-accent-foreground font-medium' : 'text-muted-foreground'
                        }`
                      }
                    >
                      <item.icon className="h-4 w-4" />
                      {open && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Financial */}
        <SidebarGroup>
          <SidebarGroupLabel>Financial</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {financialItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink 
                      to={item.url}
                      className={({ isActive }) => 
                        `flex items-center gap-3 rounded-lg px-3 py-2 transition-all hover:bg-accent/50 ${
                          isActive ? 'bg-accent text-accent-foreground font-medium' : 'text-muted-foreground'
                        }`
                      }
                    >
                      <item.icon className="h-4 w-4" />
                      {open && <span>{item.title}</span>}
                      {open && item.badge && (
                        <Badge variant="destructive" className="ml-auto">
                          {item.badge}
                        </Badge>
                      )}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Support */}
        <SidebarGroup>
          <SidebarGroupLabel>Support</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {supportItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink 
                      to={item.url}
                      className={({ isActive }) => 
                        `flex items-center gap-3 rounded-lg px-3 py-2 transition-all hover:bg-accent/50 ${
                          isActive ? 'bg-accent text-accent-foreground font-medium' : 'text-muted-foreground'
                        }`
                      }
                    >
                      <item.icon className="h-4 w-4" />
                      {open && <span>{item.title}</span>}
                      {open && item.badge && (
                        <Badge variant="destructive" className="ml-auto">
                          {item.badge}
                        </Badge>
                      )}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Tools */}
        <SidebarGroup>
          <SidebarGroupLabel>Tools</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {toolsItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink 
                      to={item.url}
                      className={({ isActive }) => 
                        `flex items-center gap-3 rounded-lg px-3 py-2 transition-all hover:bg-accent/50 ${
                          isActive ? 'bg-accent text-accent-foreground font-medium' : 'text-muted-foreground'
                        }`
                      }
                    >
                      <item.icon className="h-4 w-4" />
                      {open && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}