import { Link, useLocation } from "react-router-dom";
import { ChevronRight, Home } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

interface BreadcrumbConfig {
  label: string;
  href?: string;
}

const routeLabels: Record<string, string> = {
  home: "Dashboard",
  mchango: "Campaigns",
  chama: "Chamas",
  organizations: "Organizations",
  profile: "Profile",
  activity: "Activity",
  create: "Create",
  about: "About Us",
  explore: "Explore",
  admin: "Admin",
};

export const Breadcrumbs = () => {
  const location = useLocation();
  const pathSegments = location.pathname.split("/").filter(Boolean);

  // Don't show breadcrumbs on home or root
  if (pathSegments.length === 0 || (pathSegments.length === 1 && pathSegments[0] === "home")) {
    return null;
  }

  const breadcrumbs: BreadcrumbConfig[] = [
    { label: "Home", href: "/home" },
  ];

  let currentPath = "";
  pathSegments.forEach((segment, index) => {
    currentPath += `/${segment}`;
    const isLast = index === pathSegments.length - 1;
    
    // Get human-readable label
    let label = routeLabels[segment] || segment.replace(/-/g, " ");
    
    // Capitalize first letter of each word if not in routeLabels
    if (!routeLabels[segment]) {
      label = label
        .split(" ")
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
    }

    breadcrumbs.push({
      label,
      href: isLast ? undefined : currentPath,
    });
  });

  return (
    <Breadcrumb className="px-4 py-2 bg-muted/30">
      <BreadcrumbList>
        {breadcrumbs.map((crumb, index) => (
          <BreadcrumbItem key={index}>
            {index > 0 && <BreadcrumbSeparator />}
            {crumb.href ? (
              <BreadcrumbLink asChild>
                <Link to={crumb.href} className="flex items-center gap-1 text-sm hover:text-primary transition-colors">
                  {index === 0 && <Home className="h-3.5 w-3.5" />}
                  <span className="hidden sm:inline">{crumb.label}</span>
                </Link>
              </BreadcrumbLink>
            ) : (
              <BreadcrumbPage className="text-sm font-medium truncate max-w-[150px] sm:max-w-none">
                {crumb.label}
              </BreadcrumbPage>
            )}
          </BreadcrumbItem>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
};
