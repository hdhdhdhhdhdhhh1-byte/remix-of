import { createFileRoute, Outlet, Link, useRouterState } from "@tanstack/react-router";
import { FilePlus2, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/reports")({
  component: ReportsLayout,
});

function ReportsLayout() {
  const { can, isAdmin } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const canEntry = isAdmin || can("reports_entry", "view");
  const canView = isAdmin || can("reports_view", "view");
  const tabs = [
    { to: "/reports", label: "رفع التقرير", icon: FilePlus2, exact: true, show: canEntry },
    { to: "/reports/view", label: "عرض التقارير", icon: Eye, exact: false, show: canView },
  ].filter((t) => t.show);
  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b print:hidden">
        {tabs.map((t) => {
          const active = t.exact ? pathname === t.to : pathname.startsWith(t.to);
          return (
            <Link
              key={t.to}
              to={t.to}
              className={cn(
                "inline-flex items-center gap-2 px-4 py-2 border-b-2 text-sm font-medium transition-colors",
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </Link>
          );
        })}
      </div>
      <Outlet />
    </div>
  );
}
