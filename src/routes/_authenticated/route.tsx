import { createFileRoute, Outlet, useNavigate, Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard,
  FileText,
  Users,
  ClipboardList,
  CalendarDays,
  Star,
  Shield,
  Archive,
  UserCog,
  LogOut,
  ScrollText,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import logoUrl from "@/assets/resistance-logo.jpg";
import type { ModuleKey } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthenticatedLayout,
});

interface NavItem {
  title: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  module: ModuleKey;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { title: "الرئيسية", to: "/dashboard", icon: LayoutDashboard, module: "dashboard" },
  { title: "رفع التقرير اليومي", to: "/reports", icon: FileText, module: "reports_entry" },
  { title: "عرض التقارير", to: "/reports/view", icon: FileText, module: "reports_view" },
  { title: "الأفراد", to: "/persons", icon: Users, module: "persons" },
  { title: "رفع الخدمات", to: "/services", icon: ClipboardList, module: "services_entry" },
  { title: "عرض الخدمات", to: "/services/view", icon: ClipboardList, module: "services_view" },
  { title: "الإجازات", to: "/leaves", icon: CalendarDays, module: "leaves" },
  { title: "القادة", to: "/leaders", icon: Star, module: "leaders" },
  { title: "الأسلحة", to: "/weapons", icon: Shield, module: "weapons" },
  { title: "الأرشيف", to: "/archive", icon: Archive, module: "archive" },
  { title: "إدارة المستخدمين", to: "/users", icon: UserCog, module: "users", adminOnly: true },
  { title: "سجل العمليات", to: "/audit", icon: ScrollText, module: "audit", adminOnly: true },
];

function AuthenticatedLayout() {
  const { session, loading, isAdmin, can, signOut, user, role, fullName } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!loading && !session) {
      navigate({ to: "/auth", replace: true });
    }
  }, [session, loading, navigate]);

  if (loading || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">جارٍ التحميل...</div>
      </div>
    );
  }

  const visibleItems = NAV_ITEMS.filter((it) => {
    if (it.adminOnly) return isAdmin;
    if (it.module === "dashboard") return true;
    return can(it.module, "view");
  });

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/auth", replace: true });
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries();
      toast.success("تم تحديث النظام");
    } catch {
      toast.error("تعذر التحديث");
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <SidebarProvider defaultOpen={false}>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar items={visibleItems} onSignOut={handleSignOut} email={user?.email ?? ""} role={role} />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 border-b bg-card flex items-center px-4 gap-3 sticky top-0 z-10">
            <SidebarTrigger />
            <div className="text-sm font-medium truncate">
              أهلاً {fullName || user?.email?.split("@")[0] || "بك"}
            </div>
            <div className="flex-1" />
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefresh}
              disabled={refreshing}
              title="تحديث النظام"
              aria-label="تحديث النظام"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
          </header>
          <main className="flex-1 p-4 md:p-6 overflow-x-hidden">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function AppSidebar({
  items,
  onSignOut,
  email,
  role,
}: {
  items: NavItem[];
  onSignOut: () => void;
  email: string;
  role: string | null;
}) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { setOpen, setOpenMobile, isMobile } = useSidebar();

  // Auto-hide sidebar on route change
  useEffect(() => {
    if (isMobile) setOpenMobile(false);
    else setOpen(false);
  }, [pathname, isMobile, setOpen, setOpenMobile]);

  return (
    <Sidebar collapsible="icon" side="right">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 p-2">
          <img src={logoUrl} alt="شعار" className="h-10 w-10 rounded-full object-cover flex-shrink-0" />
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <div className="font-bold text-sm text-sidebar-foreground truncate">نظام البطارية</div>
            <div className="text-xs text-sidebar-foreground/70 truncate">{role ?? ""}</div>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>الأقسام</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((it) => {
                const active = pathname === it.to || pathname.startsWith(it.to + "/");
                return (
                  <SidebarMenuItem key={it.to}>
                    <SidebarMenuButton asChild isActive={active} tooltip={it.title}>
                      <Link to={it.to}>
                        <it.icon className="h-4 w-4" />
                        <span>{it.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <div className="p-2 space-y-2">
          <div className="text-xs text-sidebar-foreground/70 truncate group-data-[collapsible=icon]:hidden">
            {email}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent"
            onClick={onSignOut}
          >
            <LogOut className="h-4 w-4 ml-2" />
            <span className="group-data-[collapsible=icon]:hidden">تسجيل الخروج</span>
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
