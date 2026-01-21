import { Link, useLocation } from "react-router-dom";
import { ChevronRight, Home } from "lucide-react";
import { Fragment } from "react";

const adminRouteLabels: Record<string, string> = {
  admin: "Admin",
  kyc: "KYC Management",
  users: "Users",
  user: "User Detail",
  transactions: "Transactions",
  withdrawals: "Withdrawals",
  chamas: "Chama Groups",
  campaigns: "Campaigns",
  callbacks: "Customer Callbacks",
  audit: "Audit Logs",
  search: "Member Search",
  export: "Data Export",
  "payment-config": "Payment Config",
};

interface BreadcrumbItem {
  label: string;
  href?: string;
}

export const AdminBreadcrumbs = () => {
  const location = useLocation();
  const pathSegments = location.pathname.split("/").filter(Boolean);

  // Only show for admin routes
  if (!pathSegments.includes("admin")) {
    return null;
  }

  // Don't show breadcrumbs on main admin dashboard
  if (pathSegments.length === 1 && pathSegments[0] === "admin") {
    return null;
  }

  const breadcrumbs: BreadcrumbItem[] = [
    { label: "Dashboard", href: "/admin" },
  ];

  let currentPath = "/admin";
  
  // Skip the first 'admin' segment since we already added Dashboard
  pathSegments.slice(1).forEach((segment, index) => {
    currentPath += `/${segment}`;
    const isLast = index === pathSegments.length - 2;
    
    // Get human-readable label
    let label = adminRouteLabels[segment] || segment.replace(/-/g, " ");
    
    // Capitalize first letter of each word if not in routeLabels
    if (!adminRouteLabels[segment]) {
      // Check if it's a UUID (for detail pages)
      if (segment.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        label = "Details";
      } else {
        label = label
          .split(" ")
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" ");
      }
    }

    breadcrumbs.push({
      label,
      href: isLast ? undefined : currentPath,
    });
  });

  return (
    <nav aria-label="Breadcrumb" className="px-6 py-3 bg-muted/30 border-b border-border">
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
        {breadcrumbs.map((crumb, index) => (
          <Fragment key={index}>
            {index > 0 && (
              <li role="presentation" aria-hidden="true">
                <ChevronRight className="h-3.5 w-3.5" />
              </li>
            )}
            <li className="inline-flex items-center">
              {crumb.href ? (
                <Link 
                  to={crumb.href} 
                  className="flex items-center gap-1.5 hover:text-foreground transition-colors"
                >
                  {index === 0 && <Home className="h-3.5 w-3.5" />}
                  <span className="hidden sm:inline">{crumb.label}</span>
                  {index === 0 && <span className="sm:hidden">Home</span>}
                </Link>
              ) : (
                <span className="font-medium text-foreground truncate max-w-[200px]">
                  {crumb.label}
                </span>
              )}
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  );
};
