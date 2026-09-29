import { useState } from "react";
import { NavLink } from "react-router-dom";
import { AlertTriangle, LayoutDashboard, PanelLeftClose, PanelLeftOpen, Server, Settings, ShieldCheck } from "lucide-react";
import { cn } from "../lib/utils";
import { useOverview } from "../hooks/queries";

const NAV = [
  { to: "/", label: "Overview", icon: LayoutDashboard, id: "overview" },
  { to: "/issues", label: "Issues", icon: AlertTriangle, id: "issues" },
  { to: "/providers", label: "Providers", icon: Server, id: "providers" },
  { to: "/settings", label: "Settings", icon: Settings, id: "settings" },
];

export const Sidebar = () => {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("cg-sidebar") === "1");
  const { data } = useOverview();
  const openIssues = data?.has_data ? data.top_issues.length && Object.values(data.issue_counts).reduce((a, b) => a + b, 0) : 0;

  const toggle = () => {
    localStorage.setItem("cg-sidebar", collapsed ? "0" : "1");
    setCollapsed(!collapsed);
  };

  return (
    <aside
      data-testid="sidebar"
      className={cn(
        "sticky top-0 flex h-screen shrink-0 flex-col border-r border-border bg-card transition-[width] duration-200",
        collapsed ? "w-[88px]" : "w-[232px]",
      )}
    >
      <div className={cn("flex h-16 items-center gap-2.5 border-b border-divider", collapsed ? "justify-center px-2" : "px-5")}>
        <ShieldCheck className="h-5 w-5 shrink-0 text-primary" strokeWidth={1.75} />
        <span className={cn("font-medium", collapsed ? "text-xs" : "text-sm")}>{collapsed ? "Guard" : "API Cost Guard"}</span>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-3" aria-label="Main">
        {NAV.map(({ to, label, icon: Icon, id }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            data-testid={`nav-${id}-link`}
            className={({ isActive }) =>
              cn(
                "flex items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                collapsed ? "flex-col gap-1 px-1 py-2.5 text-xs" : "gap-3 px-3 py-2 text-sm",
                isActive && "bg-secondary font-medium text-foreground",
              )
            }
          >
            <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
            <span>{label}</span>
            {id === "issues" && openIssues > 0 && !collapsed && (
              <span data-testid="nav-issues-count" className="ml-auto font-mono text-xs text-muted-foreground">{openIssues}</span>
            )}
          </NavLink>
        ))}
      </nav>
      <button
        type="button"
        onClick={toggle}
        data-testid="sidebar-toggle-button"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className={cn(
          "m-3 flex items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
          collapsed ? "flex-col gap-1 py-2.5 text-xs" : "gap-3 px-3 py-2 text-sm",
        )}
      >
        {collapsed ? <PanelLeftOpen className="h-4 w-4" strokeWidth={1.75} /> : <PanelLeftClose className="h-4 w-4" strokeWidth={1.75} />}
        <span>{collapsed ? "Expand" : "Collapse"}</span>
      </button>
    </aside>
  );
};
