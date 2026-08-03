import { createFileRoute, Outlet, useNavigate, Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import {
  Sidebar,
  SidebarContent,
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
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import logoUrl from "@/assets/resistance-logo.jpg";
import type { ModuleKey } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthenticatedLayout,
});

const THEME = { primary: "#0f1d18", accent: "#1e3a2e", gold: "#c5a059", bg: "#f6f7f4" };

interface NavItem {
  title: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  module: ModuleKey;
  adminOnly?: boolean;
  group: string;
}

const NAV_ITEMS: NavItem[] = [
  { title: "الرئيسية", to: "/dashboard", icon: LayoutDashboard, module: "dashboard", group: "الرئيسية" },
  { title: "رفع التقرير اليومي", to: "/reports", icon: FileText, module: "reports_entry", group: "التقارير" },
  { title: "عرض التقارير", to: "/reports/view", icon: FileText, module: "reports_view", group: "التقارير" },
  { title: "الأفراد", to: "/persons", icon: Users, module: "persons", group: "القوة البشرية" },
  { title: "رفع الخدمات", to: "/services", icon: ClipboardList, module: "services_entry", group: "الخدمات والعمليات" },
  { title: "عرض الخدمات", to: "/services/view", icon: ClipboardList, module: "services_view", group: "الخدمات والعمليات" },
  { title: "الإجازات", to: "/leaves", icon: CalendarDays, module: "leaves", group: "القوة البشرية" },
  { title: "القادة", to: "/leaders", icon: Star, module: "leaders", group: "القوة البشرية" },
  { title: "الأسلحة", to: "/weapons", icon: Shield, module: "weapons", group: "القوة البشرية" },
  { title: "الأرشيف", to: "/archive", icon: Archive, module: "archive", group: "الأرشيف والإدارة" },
  { title: "إدارة المستخدمين", to: "/users", icon: UserCog, module: "users", adminOnly: true, group: "الأرشيف والإدارة" },
  { title: "سجل العمليات", to: "/audit", icon: ScrollText, module: "audit", adminOnly: true, group: "الأرشيف والإدارة" },
];

function AuthenticatedLayout() {
  const { session, loading, isAdmin, can, signOut, user, role, fullName } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const { data: health } = useQuery({
    queryKey: ["system-health"],
    queryFn: async () => {
      const checks: {name:string, ok:boolean}[] = [];
      try { const { error } = await supabase.from("persons").select("id").limit(1); checks.push({ name: "الأفراد", ok:!error }); } catch { checks.push({ name: "الأفراد", ok: false }); }
      try { const { error } = await supabase.from("daily_reports").select("id").limit(1); checks.push({ name: "التقارير", ok:!error }); } catch { checks.push({ name: "التقارير", ok: false }); }
      try { const { error } = await supabase.from("services").select("id").limit(1); checks.push({ name: "الخدمات", ok:!error }); } catch { checks.push({ name: "الخدمات", ok: false }); }
      try { const { error } = await supabase.from("leaves").select("id").limit(1); checks.push({ name: "الإجازات", ok:!error }); } catch { checks.push({ name: "الإجازات", ok: false }); }
      return checks;
    },
    refetchInterval: 30000,
  });

  const healthOk = useMemo(() => health? health.every(h => h.ok) : true, [health]);

  useEffect(() => {
    if (!loading &&!session) navigate({ to: "/auth", replace: true });
  }, [session, loading, navigate]);

  if (loading ||!session) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><div className="animate-pulse">جارٍ التحميل...</div></div>;
  }

  const visibleItems = NAV_ITEMS.filter((it) => {
    if (it.adminOnly) return isAdmin;
    if (it.module === "dashboard") return true;
    return can(it.module, "view");
  });

  const groups = Array.from(new Set(visibleItems.map(i => i.group)));

  const handleSignOut = async () => { await signOut(); navigate({ to: "/auth", replace: true }); };
  const handleRefresh = async () => {
    setRefreshing(true);
    try { await queryClient.invalidateQueries(); toast.success("تم تحديث النظام"); } catch { toast.error("تعذر التحديث"); }
    finally { setRefreshing(false); }
  };
  const showHealth = () => {
    if (!health) return toast.info("جاري الفحص...");
    const txt = health.map(h => `${h.ok? '✅' : '❌'} ${h.name}`).join("\n");
    if (healthOk) toast.success(`جميع الأنظمة شغالة\n${txt}`);
    else toast.error(`يوجد خلل\n${txt}`);
  };

  return (
    <SidebarProvider defaultOpen={false}>
      <div className="min-h-screen flex w-full" style={{ backgroundColor: THEME.bg }}>
        <AppSidebar items={visibleItems} groups={groups} onSignOut={handleSignOut} email={user?.email?? ""} role={role} fullName={fullName} healthOk={healthOk} onHealthClick={showHealth} />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 border-b bg-white flex items-center px-4 gap-3 sticky top-0 z-10 shadow-sm">
            <SidebarTrigger />
            <div className="text-sm font-bold truncate" style={{ color: THEME.primary }}>أهلاً {fullName || user?.email?.split("@")[0] || "بك"}</div>
            <div className="flex-1" />
            <Button variant="ghost" size="icon" onClick={handleRefresh} disabled={refreshing}><RefreshCw className={`h-4 w-4 ${refreshing? "animate-spin" : ""}`} /></Button>
          </header>
          <main className="flex-1 p-4 md:p-6 overflow-x-hidden"><Outlet /></main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function AppSidebar({ items, groups, onSignOut, email, role, fullName, healthOk, onHealthClick }: any) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { setOpen, setOpenMobile, isMobile } = useSidebar();
  useEffect(() => {
    if (isMobile) setOpenMobile(false);
    else setOpen(false);
  }, [pathname, isMobile, setOpen, setOpenMobile]);

  return (
    <Sidebar collapsible="icon" side="right">
      <div className="flex flex-col h-full" style={{ backgroundColor: THEME.primary }}>
        <SidebarHeader className="border-b border-white/10 p-0" style={{ backgroundColor: THEME.primary }}>
          <div className="flex items-center gap-3 p-3">
            <img src={logoUrl} alt="شعار" className="h-10 w-10 rounded-full object-cover flex-shrink-0" />
            <div className="min-w-0 group-data-[collapsible=icon]:hidden">
              <div className="font-bold text-sm text-white truncate">نظام البطارية</div>
              <div className="text-xs text-white/70 truncate">أهلاً {fullName || "shafiqalwatiry"}</div>
              <div className="text-[10px] text-white/40 truncate">{role?? "قائد النظام"}</div>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent className="px-2 py-3" style={{ backgroundColor: THEME.primary }}>
          {groups.map((g: string) => (
            <div key={g} className="mb-2">
              <SidebarGroupLabel className="text-[11px] text-white/40 font-bold px-2 mt-2">{g}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.filter((it: NavItem) => it.group === g).map((it: NavItem) => {
                    const active = pathname === it.to || pathname.startsWith(it.to + "/");
                    return (
                      <SidebarMenuItem key={it.to}>
                        <SidebarMenuButton asChild isActive={active} tooltip={it.title} className={active? "bg-white text-black font-bold" : "text-white/70 hover:text-white hover:bg-white/10"}>
                          <Link to={it.to}><it.icon className="h-4 w-4" /><span>{it.title}</span></Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </div>
          ))}
        </SidebarContent>
        <SidebarFooter className="border-t border-white/10 p-3 space-y-3" style={{ backgroundColor: THEME.primary }}>
          <button onClick={onHealthClick} className="w-full p-3 rounded-xl flex items-center gap-2 text-right group-data-[collapsible=icon]:hidden" style={{ backgroundColor: THEME.accent }}>
            {healthOk? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <AlertTriangle className="w-4 h-4 text-red-400" />}
            <div className="flex-1 min-w-0"><div className="text-xs font-bold text-white">حالة النظام</div><div className="text-[10px] text-white/50 truncate">{healthOk? "جميع الأنظمة شغالة" : "يوجد خلل - اضغط للتفاصيل"}</div></div>
            <div className={`w-2 h-2 rounded-full ${healthOk? "bg-green-500 animate-pulse" : "bg-red-500 animate-pulse"}`} />
          </button>
          <div className="space-y-2">
            <div className="text-xs text-white/30 truncate group-data-[collapsible=icon]:hidden">{email}</div>
            <Button variant="ghost" size="sm" className="w-full justify-start text-white/60 hover:text-white hover:bg-red-500/20" onClick={onSignOut}><LogOut className="h-4 w-4 ml-2" /><span className="group-data-[collapsible=icon]:hidden">تسجيل خروج</span></Button>
          </div>
        </SidebarFooter>
      </div>
    </Sidebar>
  );
}
