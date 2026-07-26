import { createFileRoute, Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  LayoutDashboard, Users, Crown, CalendarDays, ClipboardList,
  Shield, FileText, Archive, History, Settings,
  LogOut, Menu, X, ChevronDown, Siren, Award, Activity, Bell
} from "lucide-react";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated")({
  component: ExecutiveLayout,
});

const THEME = {
  primary: "#0f1d18",
  accent: "#1e3a2e",
  gold: "#c5a059",
};

function ExecutiveLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    "العمليات": true,
    "القوة البشرية": true,
    "التسليح والخدمات": true,
    "الإدارة والرقابة": true,
  });

  const { data: persons = [] } = useQuery({
    queryKey: ["nav-persons"],
    queryFn: async () => { const { data } = await supabase.from("persons").select("id, status"); return data?? []; },
  });
  const { data: leaves = [] } = useQuery({
    queryKey: ["nav-leaves"],
    queryFn: async () => { const { data } = await supabase.from("leaves").select("id").eq("status", "pending"); return data?? []; },
  });
  const { data: reports = [] } = useQuery({
    queryKey: ["nav-reports"],
    queryFn: async () => { const { data } = await supabase.from("daily_reports").select("id").eq("status", "pending"); return data?? []; },
  });
  const { data: profile } = useQuery({
    queryKey: ["nav-profile"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      return data;
    },
  });

  const stats = useMemo(() => ({
    absent: persons.filter((p: any) => p.status === 'absent').length,
    pendingLeaves: leaves.length,
    pendingReports: reports.length,
  }), [persons, leaves, reports]);

  const navSections = [
    { title: "العمليات", items: [
      { label: "لوحة القيادة", icon: LayoutDashboard, path: "/dashboard" },
      { label: "التقارير اليومية", icon: FileText, path: "/reports", badge: stats.pendingReports },
      { label: "الأرشيف", icon: Archive, path: "/archive" },
    ]},
    { title: "القوة البشرية", items: [
      { label: "الأفراد", icon: Users, path: "/persons", badge: stats.absent },
      { label: "القيادة", icon: Crown, path: "/leaders" },
      { label: "الإجازات", icon: CalendarDays, path: "/leaves", badge: stats.pendingLeaves },
    ]},
    { title: "التسليح والخدمات", items: [
      { label: "الخدمات", icon: ClipboardList, path: "/services" },
      { label: "الأسلحة", icon: Shield, path: "/weapons" },
    ]},
    { title: "الإدارة والرقابة", items: [
      { label: "المستخدمون", icon: Settings, path: "/users" },
      { label: "سجل العمليات", icon: History, path: "/audit" },
      { label: "التقارير التحليلية", icon: Activity, path: "/reports" },
    ]},
  ];

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + "/");
  const toggleSection = (title: string) => setOpenSections(prev => ({...prev, [title]:!prev[title]}));

  return (
    <div className="min-h-screen flex bg-[#f6f7f4] text-right" dir="rtl">
      {sidebarOpen && <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />}
      <aside className={`fixed lg:static inset-y-0 right-0 z-50 w-[300px] flex flex-col transform transition-transform duration-300 ${sidebarOpen? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}`} style={{ backgroundColor: THEME.primary }}>
        <div className="p-5 border-b border-white/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: THEME.gold }}><Siren className="w-6 h-6 text-black" /></div>
              <div><h1 className="font-bold text-lg leading-none text-white">غرفة العمليات</h1><p className="text-xs text-white/60 mt-1">النظام التنفيذي</p></div>
            </div>
            <Button variant="ghost" size="icon" className="lg:hidden text-white" onClick={() => setSidebarOpen(false)}><X className="w-5 h-5" /></Button>
          </div>
          <div className="mt-5 p-3 rounded-xl flex items-center gap-3" style={{ backgroundColor: THEME.accent }}>
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center font-bold text-white">{profile?.full_name?.charAt(0) || 'ش'}</div>
            <div className="flex-1 min-w-0"><p className="text-sm font-bold truncate text-white">أهلاً {profile?.full_name || 'shafiqalwatiry'}</p><p className="text-xs text-white/60 truncate">{profile?.role || 'قائد النظام'}</p></div>
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {navSections.map((section) => (
            <div key={section.title}>
              <button onClick={() => toggleSection(section.title)} className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold text-white/40 hover:text-white/70">{section.title}<ChevronDown className={`w-4 h-4 transition-transform ${openSections[section.title]? 'rotate-0' : '-rotate-90'}`} /></button>
              {openSections[section.title] && (
                <div className="mt-1 space-y-1">
                  {section.items.map((item) => {
                    const active = isActive(item.path);
                    return (
                      <button key={item.path} onClick={() => { navigate({ to: item.path }); setSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${active? 'bg-white text-black font-bold shadow-lg' : 'text-white/70 hover:text-white hover:bg-white/10'}`}>
                        <item.icon className="w-5 h-5" /><span className="flex-1 text-right">{item.label}</span>
                        {item.badge!== undefined && item.badge > 0 && <span className={`min-w-[22px] h-[22px] px-1.5 rounded-full text-xs font-bold flex items-center justify-center ${active? 'bg-red-600 text-white' : 'bg-[#c5a059] text-black'}`}>{item.badge}</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="p-3 border-t border-white/10 space-y-2">
          <div className="p-3 rounded-xl" style={{ backgroundColor: THEME.accent }}><div className="flex items-center gap-2 text-xs text-white/80"><Award className="w-4 h-4" style={{ color: THEME.gold }} /><span>حالة النظام</span><span className="mr-auto w-2 h-2 bg-green-500 rounded-full animate-pulse" /></div><p className="text-xs text-white/50 mt-1">جميع الأنظمة تعمل بكفاءة</p></div>
          <button onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/auth" }); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-white/60 hover:text-white hover:bg-red-500/20"><LogOut className="w-5 h-5" /><span>تسجيل خروج</span></button>
        </div>
      </aside>
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-[64px] bg-white border-b flex items-center justify-between px-4 lg:px-6 sticky top-0 z-30">
          <div className="flex items-center gap-3"><Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(true)}><Menu className="w-6 h-6" /></Button><div className="hidden lg:block"><h2 className="font-bold text-[#0f1d18]">نظام إدارة القوة البشرية</h2><p className="text-xs text-gray-500">مرحباً بك في غرفة العمليات التنفيذية</p></div></div>
          <div className="flex items-center gap-2"><div className="hidden md:flex items-center gap-2 text-xs bg-[#f6f7f4] px-3 py-1.5 rounded-full"><div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />متصل</div><Button variant="ghost" size="icon"><Bell className="w-5 h-5" /></Button></div>
        </header>
        <main className="flex-1 p-4 lg:p-6 overflow-auto"><Outlet /></main>
      </div>
    </div>
  );
}
