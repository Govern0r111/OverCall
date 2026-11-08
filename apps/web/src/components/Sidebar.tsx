import { useState } from "react";
import {
  AlertTriangle,
  FileText,
  LayoutDashboard,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Server,
  Settings,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { authClient } from "../auth/authClient";
import { useOverview } from "../hooks/queries";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { SheetContent, SheetDescription, SheetTitle } from "./ui/sheet";

const NAV = [
  { to: "/app", label: "Overview", icon: LayoutDashboard, id: "overview" },
  { to: "/app/issues", label: "Issues", icon: AlertTriangle, id: "issues" },
  { to: "/app/logs", label: "Logs", icon: FileText, id: "logs" },
  { to: "/app/providers", label: "Providers", icon: Server, id: "providers" },
  { to: "/app/settings", label: "Settings", icon: Settings, id: "settings" },
  { to: "/app/profile", label: "Profile", icon: UserRound, id: "profile" },
];

interface SidebarContentProps {
  collapsed: boolean;
  onClose: () => void;
  onToggle: () => void;
  showCollapse: boolean;
}

const SidebarContent = ({ collapsed, onClose, onToggle, showCollapse }: SidebarContentProps) => {
  const navigate = useNavigate();
  const { data } = useOverview();
  const openIssues = data?.has_data ? Object.values(data.issue_counts).reduce((a, b) => a + b, 0) : 0;

  return (
    <>
      <Link
        to="/app"
        aria-label={collapsed ? "Overcall overview" : undefined}
        onClick={onClose}
        className={cn(
          "flex h-16 shrink-0 items-center gap-3 border-b border-divider transition-colors hover:bg-accent/50",
          collapsed ? "justify-center px-2" : "px-5",
        )}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ShieldCheck aria-hidden="true" className="h-5 w-5" strokeWidth={1.75} />
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold tracking-tight">Overcall</span>
            <span className="block text-xs text-muted-foreground">API spend monitor</span>
          </div>
        )}
      </Link>
      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-3" aria-label="Workspace">
        {NAV.map(({ to, label, icon: Icon, id }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/app"}
            data-testid={`nav-${id}-link`}
            onClick={onClose}
            className={({ isActive }) =>
              cn(
                "group relative flex min-h-10 items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                "gap-3 px-3 py-2 text-sm",
                collapsed && "md:flex-col md:gap-1 md:px-1 md:py-2.5 md:text-xs",
                isActive && "bg-primary/10 font-medium text-primary",
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  aria-hidden="true"
                  className={cn("h-4 w-4 shrink-0 stroke-[1.75]", isActive && "text-primary")}
                  strokeWidth={1.75}
                />
                <span>{label}</span>
                {id === "issues" && openIssues > 0 && !collapsed && (
                  <span
                    data-testid="nav-issues-count"
                    className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-background px-1.5 font-mono text-xs tabular-nums text-muted-foreground"
                  >
                    {openIssues > 99 ? "99+" : openIssues}
                  </span>
                )}
                {id === "issues" && openIssues > 0 && collapsed && (
                  <span
                    data-testid="nav-issues-count"
                    className="absolute right-1.5 top-1.5 hidden h-4 min-w-4 items-center justify-center rounded-full border border-border bg-card px-1 font-mono text-[10px] tabular-nums text-muted-foreground md:inline-flex"
                  >
                    {openIssues > 99 ? "99+" : openIssues}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="shrink-0 border-t border-divider p-3">
        <Button
          type="button"
          variant="ghost"
          onClick={async () => {
            try {
              await authClient.logout();
              onClose();
              navigate("/login", { replace: true });
            } catch {
              toast.error("Couldn't log out. Please try again.");
            }
          }}
          className={cn("mb-1 w-full justify-start gap-3 text-muted-foreground", collapsed && "md:justify-center md:px-0")}
        >
          <LogOut aria-hidden="true" className="h-4 w-4 shrink-0" strokeWidth={1.75} />
          <span className={collapsed ? "md:sr-only" : undefined}>Log out</span>
        </Button>
        {showCollapse && (
          <Button
            type="button"
            variant="ghost"
            onClick={onToggle}
            data-testid="sidebar-toggle-button"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            aria-controls="sidebar-navigation-desktop"
            className={cn(
              "w-full justify-start gap-3 text-muted-foreground",
              collapsed && "md:flex-col md:gap-1 md:px-0 md:py-2.5 md:text-xs",
            )}
          >
            {collapsed
              ? <PanelLeftOpen aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
              : <PanelLeftClose aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />}
            <span>{collapsed ? "Expand" : "Collapse"}</span>
          </Button>
        )}
      </div>
    </>
  );
};

export const Sidebar = ({ onClose }: { onClose: () => void }) => {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("cg-sidebar") === "1");

  const toggle = () => {
    localStorage.setItem("cg-sidebar", collapsed ? "0" : "1");
    setCollapsed(!collapsed);
  };

  return (
    <>
      <aside
        data-testid="sidebar"
        id="sidebar-navigation-desktop"
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-divider bg-background md:flex",
          "transition-[width] duration-200 motion-reduce:transition-none",
          collapsed ? "w-[88px]" : "w-60",
        )}
        aria-label="Application navigation"
      >
        <SidebarContent collapsed={collapsed} onClose={onClose} onToggle={toggle} showCollapse />
      </aside>
      <SheetContent
        data-testid="sidebar-mobile"
        side="left"
        className="flex h-dvh w-72 max-w-[90vw] flex-col gap-0 overflow-y-auto overscroll-contain p-0 md:hidden"
      >
        <SheetTitle className="sr-only">Navigation menu</SheetTitle>
        <SheetDescription className="sr-only">Choose a page in your Overcall workspace.</SheetDescription>
        <SidebarContent collapsed={false} onClose={onClose} onToggle={toggle} showCollapse={false} />
      </SheetContent>
    </>
  );
};
