import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Plus, X, Heart, Users, Building2, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

const actions = [
  {
    label: "New Campaign",
    icon: Heart,
    href: "/mchango/create",
    color: "bg-pink-500 hover:bg-pink-600",
  },
  {
    label: "New Chama",
    icon: Users,
    href: "/chama/create",
    color: "bg-blue-500 hover:bg-blue-600",
  },
  {
    label: "Register Org",
    icon: Building2,
    href: "/organizations/create",
    color: "bg-amber-500 hover:bg-amber-600",
  },
  {
    label: "New Welfare",
    icon: Shield,
    href: "/welfare/create",
    color: "bg-emerald-500 hover:bg-emerald-600",
  },
];

export const FloatingActionMenu = () => {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile } = useAuth();

  const hiddenPaths = ["/admin", "/auth", "/create", "/login", "/register"];
  const shouldHide = hiddenPaths.some(path => location.pathname.includes(path));
  
  if (!user || profile?.kyc_status !== "approved" || shouldHide) {
    return null;
  }

  const handleAction = (href: string) => {
    setIsOpen(false);
    navigate(href);
  };

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-40 backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* FAB - sits in the floating dock via CSS variable spacing */}
      <div className="fixed bottom-[calc(var(--bottom-nav-offset)+16px)] left-4 z-50 flex flex-col-reverse items-start gap-3">
        {/* Action Buttons */}
        {isOpen && (
          <div className="flex flex-col-reverse gap-2 mb-2 animate-in fade-in slide-in-from-bottom-4 duration-200">
            {actions.map((action) => (
              <button
                key={action.href}
                onClick={() => handleAction(action.href)}
                className={cn(
                  "flex items-center gap-3 px-4 py-2.5 rounded-full text-white shadow-lg transition-all",
                  "hover:scale-105 active:scale-95",
                  action.color
                )}
              >
                <action.icon className="h-4 w-4" />
                <span className="text-sm font-medium whitespace-nowrap">{action.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Main FAB Button */}
        <Button
          size="icon"
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "h-12 w-12 rounded-full shadow-xl transition-all duration-300",
            "bg-gradient-to-br from-primary to-primary-glow hover:from-primary/90 hover:to-primary-glow/90",
            isOpen && "rotate-45"
          )}
        >
          {isOpen ? (
            <X className="h-5 w-5" />
          ) : (
            <Plus className="h-5 w-5" />
          )}
        </Button>
      </div>
    </>
  );
};
