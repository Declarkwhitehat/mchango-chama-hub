import { ReactNode, useEffect, useState } from "react";
import { PullToRefresh } from "@/components/PullToRefresh";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Home, User, Menu, ArrowLeft, Shield, Users, Heart, Info, Building2, Activity, ShieldCheck, LogOut, LayoutDashboard, Lock } from "lucide-react";
import { NotificationBell } from "@/components/NotificationBell";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { FloatingActionMenu } from "@/components/FloatingActionMenu";
import { cn } from "@/lib/utils";

interface LayoutProps {
  children: ReactNode;
  showBackButton?: boolean;
  title?: string;
}

export const Layout = ({ children, showBackButton = false, title }: LayoutProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const isHomePage = location.pathname === "/home";
  const [isAdmin, setIsAdmin] = useState(false);
  const { user, signOut, lockApp, hardLogout } = useAuth();

  useEffect(() => {
    checkAdminStatus();
  }, [user]);

  const checkAdminStatus = async () => {
    if (!user) return;

    const { data } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    setIsAdmin(!!data);
  };

  const navItems = [
    { href: "/", icon: Home, label: "Home" },
    { href: "/mchango", icon: Heart, label: "Campaigns" },
    { href: "/chama", icon: Users, label: "Chamas" },
    { href: "/welfare", icon: ShieldCheck, label: "Welfare" },
    { href: "/profile", icon: User, label: "Profile" },
  ];

  const isActiveRoute = (path: string) => {
    if (path === "/") return location.pathname === "/";
    if (path === "/home") return location.pathname === "/home";
    return location.pathname.startsWith(path);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60 safe-top">
        <div className="container flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            {showBackButton ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate(-1)}
                className="mr-2"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
            ) : null}
            <Link to="/home" className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center">
                  <span className="text-primary-foreground font-bold text-sm">C</span>
                </div>
                <span className="font-bold text-foreground hidden sm:inline">Chama & Mchango</span>
              </div>
            </Link>
          </div>

          {title && <h1 className="text-lg font-semibold text-foreground">{title}</h1>}

          <div className="flex items-center gap-1">
            {/* Notification Bell */}
            {user && <NotificationBell />}
            
            {/* Mobile Menu */}
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <nav className="flex flex-col gap-2 mt-8">
                <p className="text-xs text-muted-foreground uppercase tracking-wider px-3 mb-2">Navigation</p>
                <Link to="/">
                  <Button variant={isActiveRoute("/") ? "secondary" : "ghost"} className="w-full justify-start">
                    <Home className="mr-2 h-4 w-4" />
                    Home
                  </Button>
                </Link>
                <Link to="/home">
                  <Button variant={isActiveRoute("/home") ? "secondary" : "ghost"} className="w-full justify-start">
                    <LayoutDashboard className="mr-2 h-4 w-4" />
                    Dashboard
                  </Button>
                </Link>
                <Link to="/mchango">
                  <Button variant={isActiveRoute("/mchango") ? "secondary" : "ghost"} className="w-full justify-start">
                    <Heart className="mr-2 h-4 w-4" />
                    Browse Campaigns
                  </Button>
                </Link>
                <Link to="/chama">
                  <Button variant={isActiveRoute("/chama") ? "secondary" : "ghost"} className="w-full justify-start">
                    <Users className="mr-2 h-4 w-4" />
                    Browse Chamas
                  </Button>
                </Link>
                <Link to="/welfare">
                  <Button variant={isActiveRoute("/welfare") ? "secondary" : "ghost"} className="w-full justify-start">
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    Welfare Groups
                  </Button>
                </Link>
                <Link to="/organizations">
                  <Button variant={isActiveRoute("/organizations") ? "secondary" : "ghost"} className="w-full justify-start">
                    <Building2 className="mr-2 h-4 w-4" />
                    Organizations
                  </Button>
                </Link>
                <Link to="/activity">
                  <Button variant={isActiveRoute("/activity") ? "secondary" : "ghost"} className="w-full justify-start">
                    <Activity className="mr-2 h-4 w-4" />
                    Activity
                  </Button>
                </Link>
                
                <div className="border-t border-border my-3" />
                <p className="text-xs text-muted-foreground uppercase tracking-wider px-3 mb-2">Account</p>
                
                <Link to="/profile">
                  <Button variant={isActiveRoute("/profile") ? "secondary" : "ghost"} className="w-full justify-start">
                    <User className="mr-2 h-4 w-4" />
                    Profile
                  </Button>
                </Link>
                <Link to="/security">
                  <Button variant={isActiveRoute("/security") ? "secondary" : "ghost"} className="w-full justify-start">
                    <Shield className="mr-2 h-4 w-4" />
                    Security
                  </Button>
                </Link>
                <Link to="/about">
                  <Button variant={isActiveRoute("/about") ? "secondary" : "ghost"} className="w-full justify-start">
                    <Info className="mr-2 h-4 w-4" />
                    About Us
                  </Button>
                </Link>
                {isAdmin && (
                  <>
                    <div className="border-t border-border my-3" />
                    <p className="text-xs text-muted-foreground uppercase tracking-wider px-3 mb-2">Admin</p>
                    <Link to="/admin">
                      <Button variant={isActiveRoute("/admin") ? "secondary" : "ghost"} className="w-full justify-start">
                        <Shield className="mr-2 h-4 w-4" />
                        Admin Panel
                      </Button>
                    </Link>
                  </>
                )}
                
                <div className="border-t border-border my-3" />
                <Button 
                  variant="outline" 
                  className="w-full justify-start"
                  onClick={async () => {
                    await lockApp();
                    navigate("/auth");
                    toast.success("App locked. Use fingerprint to unlock.");
                  }}
                >
                  <Lock className="mr-2 h-4 w-4" />
                  Lock App
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full justify-start text-destructive hover:text-destructive"
                  onClick={async () => {
                    await hardLogout();
                    navigate("/auth");
                    toast.success("Signed out completely");
                  }}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Logout Completely
                </Button>
              </nav>
            </SheetContent>
          </Sheet>
          </div>
        </div>
      </header>

      {/* Breadcrumbs */}
      <Breadcrumbs />

      {/* Main Content */}
      <PullToRefresh>
        <main className="flex-1 pb-[calc(var(--bottom-nav-offset)+24px)]">
          {children}
        </main>
      </PullToRefresh>

      {/* Floating Action Menu */}
      <FloatingActionMenu />

      {/* Bottom Navigation - Always visible for authenticated users */}
      {user && (
        <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 pb-[env(safe-area-inset-bottom)]">
          <div className="container flex h-16 items-center justify-around px-2 max-w-lg mx-auto">
            {navItems.map((item) => {
              const isActive = isActiveRoute(item.href);
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={cn(
                    "flex flex-col items-center gap-0.5 px-3 py-2 rounded-lg transition-colors min-w-[60px]",
                    isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <item.icon className={cn("h-5 w-5", isActive && "text-primary")} />
                  <span className={cn("text-[10px]", isActive ? "font-medium" : "font-normal")}>
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
};
