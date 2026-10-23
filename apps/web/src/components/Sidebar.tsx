import { useState } from "react";
import { NavLink } from "react-router-dom";
import { AlertTriangle, FileText, LayoutDashboard, LogOut, PanelLeftClose, PanelLeftOpen, Server, Settings, ShieldCheck, X } from "lucide-react";
import { cn } from "../lib/utils";
import { useOverview } from "../hooks/queries";
import { authClient } from "../auth/authClient";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

const NAV = [
  { to: "/app", label: "Overview", icon: LayoutDashboard, id: "overview" },
  { to: "/app/issues", label: "Issues", icon: AlertTriangle, id: "issues" },
  { to: "/app/logs", label: "Logs", icon: FileText, id: "logs" },
  { to: "/app/providers", label: "Providers", icon: Server, id: "providers" },
  { to: "/app/settings", label: "Settings", icon: Settings, id: "settings" },
];

export const Sidebar = ({ mobileOpen, onClose }: { mobileOpen: boolean; onClose: () => void }) => {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("cg-sidebar") === "1");
  const { data } = useOverview();
  const openIssues = data?.has_data ? Object.values(data.issue_counts).reduce((a, b) => a + b, 0) : 0;

  const toggle = () => {
    localStorage.setItem("cg-sidebar", collapsed ? "0" : "1");
    setCollapsed(!collapsed);
  };

  return (
    <>
      {mobileOpen && <button type="button" aria-label="Close navigation menu" onClick={onClose} className="fixed inset-0 z-40 bg-black/40 md:hidden" />}
      <aside
      data-testid="sidebar"
      id="sidebar-navigation"
      className={cn(
        "fixed inset-y-0 left-0 z-50 flex h-screen w-64 shrink-0 flex-col border-r border-border bg-card transition-transform duration-200 md:sticky md:top-0 md:z-auto md:translate-x-0 md:transition-[width]",
        mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        collapsed ? "md:w-[88px]" : "md:w-[232px]",
      )}
      aria-label="Application navigation"
    >
      <div className={cn("flex h-16 items-center gap-2.5 border-b border-divider", collapsed ? "justify-center px-2" : "px-5")}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-primary/[0.06]">
          <ShieldCheck className="h-4.5 w-4.5 text-primary" strokeWidth={1.75} />
        </div>
        {(!collapsed || mobileOpen) && (
          <div className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold tracking-tight">Overcall</span>
            <span className="block text-xs text-muted-foreground">API spend monitor</span>
          </div>
        )}
        <button type="button" onClick={onClose} aria-label="Close navigation menu" className="ml-auto rounded p-2 text-muted-foreground hover:bg-accent md:hidden"><X className="h-4 w-4" /></button>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-3" aria-label="Main">
        {NAV.map(({ to, label, icon: Icon, id }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/app"}
            data-testid={`nav-${id}-link`}
            onClick={onClose}
            className={({ isActive }) =>
              cn(
                "group relative flex items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                "gap-3 px-3 py-2 text-sm md:gap-3 md:px-3 md:py-2 md:text-sm",
                collapsed && "md:flex-col md:gap-1 md:px-1 md:py-2.5 md:text-xs",
                isActive && "bg-secondary font-medium text-foreground",
              )
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={cn(
                    "absolute left-0 top-1/2 h-5 -translate-y-1/2 rounded-r-full bg-primary transition-all duration-200",
                    isActive ? "w-0.5 opacity-100" : "w-0 opacity-0",
                  )}
                />
                <Icon
                  className="h-4 w-4 shrink-0 stroke-[1.75] transition-colors group-hover:text-foreground"
                  strokeWidth={1.75}
                />
                <span>{label}</span>
                {id === "issues" && openIssues > 0 && !collapsed && (
                  <span
                    data-testid="nav-issues-count"
                    className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-border px-1.5 font-mono text-xs text-muted-foreground"
                  >
                    {openIssues > 99 ? "99+" : openIssues}
                  </span>
                )}
                {id === "issues" && openIssues > 0 && collapsed && (
                  <span
                    data-testid="nav-issues-count"
                    className="absolute right-1.5 top-1.5 hidden h-4 min-w-4 items-center justify-center rounded-full border border-border bg-card px-1 font-mono text-[10px] text-muted-foreground md:inline-flex"
                  >
                    {openIssues > 99 ? "99+" : openIssues}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-divider p-3">
        {(!collapsed || mobileOpen) && (
          <button
            type="button"
            onClick={async () => {
              try {
                await authClient.logout();
                onClose();
                navigate("/login", { replace: true });
              } catch {
                toast.error("Couldn't log out. Please try again.");
              }
            }}
            className="mb-1 flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <LogOut className="h-4 w-4" strokeWidth={1.75} />
            <span>Log out</span>
          </button>
        )}
        <button
          type="button"
          onClick={toggle}
          data-testid="sidebar-toggle-button"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "flex w-full items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
            collapsed ? "flex-col gap-1 py-2.5 text-xs" : "gap-3 px-3 py-2 text-sm",
          )}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" strokeWidth={1.75} /> : <PanelLeftClose className="h-4 w-4" strokeWidth={1.75} />}
          <span>{collapsed ? "Expand" : "Collapse"}</span>
        </button>
      </div>
      </aside>
    </>
  );
};
