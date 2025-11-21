import { NavLink as RouterNavLink, NavLinkProps } from "react-router-dom";
import { cn } from "@/lib/utils";

interface CustomNavLinkProps extends NavLinkProps {
  activeClassName?: string;
}

export function NavLink({ className, activeClassName, ...props }: CustomNavLinkProps) {
  return (
    <RouterNavLink
      {...props}
      className={({ isActive }) => 
        cn(
          typeof className === 'function' ? className({ isActive } as any) : className,
          isActive && activeClassName
        )
      }
    />
  );
}