import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search, User, DollarSign, Users, TrendingUp, FileCheck, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

interface QuickAction {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  url: string;
}

const quickActions: QuickAction[] = [
  { title: "Member Search", description: "Find members by code, phone, or email", icon: Search, url: "/admin/search" },
  { title: "KYC Management", description: "Review pending KYC submissions", icon: FileCheck, url: "/admin/kyc" },
  { title: "Users", description: "View and manage all users", icon: User, url: "/admin/users" },
  { title: "Transactions", description: "View all platform transactions", icon: DollarSign, url: "/admin/transactions" },
  { title: "Chama Groups", description: "Manage chama groups", icon: Users, url: "/admin/chamas" },
  { title: "Campaigns", description: "View mchango campaigns", icon: TrendingUp, url: "/admin/campaigns" },
];

export function AdminGlobalSearch() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  // Keyboard shortcut (Cmd/Ctrl + K)
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const handleSelect = useCallback((url: string) => {
    setOpen(false);
    navigate(url);
  }, [navigate]);

  return (
    <>
      <Button
        variant="outline"
        className="relative h-9 w-full justify-start text-sm text-muted-foreground sm:pr-12 md:w-40 lg:w-64"
        onClick={() => setOpen(true)}
      >
        <Search className="mr-2 h-4 w-4" />
        <span className="hidden lg:inline-flex">Search...</span>
        <span className="inline-flex lg:hidden">Search</span>
        <kbd className="pointer-events-none absolute right-1.5 top-1.5 hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Type a command or search..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Quick Navigation">
            {quickActions.map((action) => (
              <CommandItem
                key={action.url}
                value={action.title}
                onSelect={() => handleSelect(action.url)}
                className="cursor-pointer"
              >
                <action.icon className="mr-2 h-4 w-4" />
                <div className="flex flex-col">
                  <span>{action.title}</span>
                  <span className="text-xs text-muted-foreground">{action.description}</span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
