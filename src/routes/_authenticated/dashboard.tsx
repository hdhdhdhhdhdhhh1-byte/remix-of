import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, UserCheck, UserX, CalendarDays, Heart, Shield, Star, AlertTriangle, TrendingUp, Activity, Clock, FileText, ClipboardCheck, Crown, Siren, Eye, ChevronLeft, Timer, ShieldAlert, Award } from "lucide-react";
export const Route = createFileRoute("/_authenticated/dashboard")({ component: ExecutiveDashboard });
const THEME = { primary: "#0f1d18", accent: "#1e3a2e", gold: "#c5a059", bg: "#f6f7f4", red: "#dc2626", green: "#059669" };
export default function ExecutiveDashboard() {
  const navigate = useNavigate();
  const { data: persons = [] } = useQuery({ queryKey: ["dash-persons"], queryFn: async () => { const { data } = await supabase.from("persons").select("id, status, rank, is_leader"); return data?? []; } });
  const { data: leaves = [] } = useQuery({ queryKey: ["dash-leaves"], queryFn: async () => { const { data } = await supabase.from("leaves").select("*").eq("status","approved"); return data?? []; } });
  const { data: services = [] } = useQuery({ queryKey: ["dash-services-today"], queryFn: async () => { const today = new Date().toISOString().slice(0,10); const { data } = await supabase.from("services").select("*").gte("service_date", today).lte("service_date", today+"T23:59:59"); return data?? []; } });
  const { data: reports = [] } = useQuery({ queryKey: ["dash-reports"], queryFn: async () => { const { data } = await supabase.from("daily_reports").select("id, status, report_date").order("report_date", { ascending: false }).limit(5); return data?? []; } });
  const { data: audit = [] } = useQuery({ queryKey: ["dash-audit"], queryFn: async () => { const { data } = await supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(10); return data?? []; } });
  const { data: profiles = [] } = useQuery({ queryKey: ["dash-profiles-map"], queryFn: async () => { const { data } = await supabase.from("profiles").select("id, full_name"); return data?? []; } });
  const profMap = useMemo(() => { const m: any = {}; profiles.forEach((p: any) => m[p.id] = p.full_name); return m; }, [profiles]);
  const stats = useMemo(() => {
    const total = persons.length;
    const present = persons.filter((p: any) => p.status === "present" || p.status === "حاضر").length;
    const absent = persons.filter((p: any) => p.status === "absent" || p.status === "غياب").length;
    const sick = persons.filter((p: any) => p.status === "sick" || p.status === "مرضي").length;
    const onLeave = leaves.length;
    const leaders = persons.filter((p: any) => p.is_leader).length;
    const attendanceRate = total? Math.round((present / total) * 100) : 0;
    return { total, present, absent, sick, onLeave, leaders, todayServices: services.length, attendanceRate };
  }, [persons, leaves, services]);
  const alerts = useMemo(() => {
    const list: any[] = [];
    if (stats.absent > 3) list.push({ type: "danger", icon: UserX, title: `غياب مرتفع: ${stats.absent} أفراد`, desc: "يتجاوز الحد المسموح، يحتاج متابعة فورية", action: "/persons" });
    if (stats.sick > 0) list.push({ type: "warn", icon: Heart, title: `${stats.sick} حالة مرضية`, desc: "تابع حالتهم الصحية", action: "/persons" });
    if (reports.length > 0 && reports[0].status!== "approved") list.push({ type: "info", icon: FileText, title: "تقرير اليوم لم يعتمد بعد", desc: `حالة التقرير: ${reports[0].status}`, action: "/reports" });
    if (services.length === 0) list.push({ type: "danger", icon: ShieldAlert, title: "لم يتم رفع خدمات اليوم!", desc: "خدمات الحراسة غير جاهزة", action: "/services" });
    if (stats.attendanceRate < 80 && stats.total>0) list.push({ type: "danger", icon: Siren, title: `نسبة الحضور منخفضة ${stats.attendanceRate}%`, desc: "تدخل قيادي مطلوب", action: "/dashboard" });
    if (list.length === 0) list.push({ type: "success", icon: Award, title: "الوضع ممتاز، لا توجد تنبيهات", desc: `نسبة الحضور ${stats.attendanceRate}% - استمرارية ممتازة`, action: "" });
    return list;
  }, [stats, reports, services]);
  const todayStr = new Date().toLocaleDateString("ar-EG", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  return (
    <div className="min-h-screen bg-[#f6f7f4] p-3 md:p-4 space-y-4" dir="rtl">
      <div className="relative overflow-hidden rounded-[24px] bg-[#0f1d18] text-white p-5">
        <div className="absolute top-0 left-0 w-[300px] h-[300px] bg-[#1e3a2e] rounded-full blur-[80px] -translate-x-20 -translate-y-20 opacity-60" />
        <div className="absolute bottom-0 right-0 w-[200px] h-[200px] bg-[#c5a059] rounded-full blur-[60px] translate-x-10 translate-y-10 opacity-20" />
        <div className="relative z-10 flex flex-col md:flex-row justify-between gap-4">
          <div>
            <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center border border-white/20"><Crown className="h-5 w-5 text-[#c5a059]" /></div><div><h1 className="text-xl md:text-2xl font-black">غرفة العمليات القيادية</h1><p className="text-[11px] text-white/60 font-mono">COMMAND CENTER • RASSID V2</p></div></div>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px]"><span className="bg-white/10 px-3 py-1 rounded-full border border-white/10">{todayStr}</span><span className="bg-emerald-500/20 text-emerald-300 px-3 py-1 rounded-full flex items-center gap-1"><span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />متصل</span></div>
          </div>
          <div className="flex gap-2 self-start"><Button onClick={() => navigate({ to: "/reports" })} className="rounded-full bg-white text-black hover:bg-white/90 text-xs font-bold h-9 px-5"><FileText className="h-4 w-4 ml-1" /> التقرير اليومي</Button><Button onClick={() => navigate({ to: "/services" })} className="rounded-full bg-[#c5a059] text-black hover:bg-[#b8924e] text-xs font-black h-9 px-5"><Shield className="h-4 w-4 ml-1" /> خدمات اليوم</Button></div>
        </div>
        <div className="relative z-10 mt-5 bg-white/10 rounded-full h-2 overflow-hidden"><div className="h-full bg-gradient-to-l from-[#c5a059] to-emerald-400 rounded-full" style={{ width: `${stats.attendanceRate}%` }} /></div>
        <div className="relative z-10 mt-2 flex justify-between text-[10px] text-white/50"><span>نسبة الجاهزية</span><span className="text-white font-bold">{stats.attendanceRate}%</span></div>
      </div>
      <div className="space-y-2"><h2 className="font-black text-[13px] flex items-center gap-2"><Siren className="h-4 w-4 text-red-600" /> تنبيهات القيادة الذكية</h2><div className="grid gap-2">{alerts.slice(0,3).map((a: any, i: number) => (<div key={i} className={`rounded-2xl border-2 p-3 flex items-start gap-3 ${a.type === 'danger'? 'bg-red-50 border-red-200' : a.type === 'warn'? 'bg-amber-50 border-amber-200' : a.type === 'info'? 'bg-blue-50 border-blue-200' : 'bg-emerald-50 border-emerald-200'}`}><div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${a.type === 'danger'? 'bg-red-600 text-white' : a.type === 'warn'? 'bg-amber-500 text-white' : a.type === 'info'? 'bg-blue-600 text-white' : 'bg-emerald-600 text-white'}`}><a.icon className="h-4 w-4" /></div><div className="flex-1"><p className="font-black text-[12px]">{a.title}</p><p className="text-[11px] text-muted-foreground">{a.desc}</p></div>{a.action && <Button size="sm" variant="ghost" className="rounded-full h-7 text-[10px]" onClick={() => navigate({ to: a.action })}>عرض <ChevronLeft className="h-3 w-3" /></Button>}</div>))}</div></div>
      <div><h2 className="font-black text-[13px] flex items-center gap-2 mb-2"><Activity className="h-4 w-4" /> الموقف العام للقوة</h2><div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div onClick={() => navigate({ to: "/persons" })} className="rounded-[18px] p-3.5 bg-[#0f1d18] text-white cursor-pointer"><div className="flex justify-between"><div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center"><Users className="h-4 w-4" /></div></div><div className="mt-8"><p className="text-[11px] opacity-70">القوة الكاملة</p><p className="text-[28px] font-black leading-none">{stats.total}</p><p className="text-[10px] opacity-60">فرد</p></div></div>
        <div className="rounded-[18px] p-3.5 bg-emerald-600 text-white"><div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center"><UserCheck className="h-4 w-4" /></div><div className="mt-8"><p className="text-[11px] opacity-70">المتبقي (حاضر)</p><p className="text-[28px] font-black leading-none">{stats.present}</p><p className="text-[10px] opacity-80">{stats.attendanceRate}% جاهزية</p></div></div>
        <div className={`rounded-[18px] p-3.5 cursor-pointer ${stats.absent > 3? 'bg-red-600 text-white' : 'bg-white border-2 border-black text-black'}`}><div className="flex justify-between"><div className={`w-9 h-9 rounded-xl flex items-center justify-center ${stats.absent > 3? 'bg-white/15' : 'bg-black text-white'}`}><UserX className="h-4 w-4" /></div>{stats.absent > 3 && <span className="w-2 h-2 bg-white rounded-full animate-ping" />}</div><div className="mt-8"><p className="text-[11px] opacity-70">غياب</p><p className="text-[28px] font-black leading-none">{stats.absent}</p><p className="text-[10px] opacity-80">{stats.absent > 3? 'مرتفع!' : 'طبيعي'}</p></div></div>
        <div onClick={() => navigate({ to: "/leaves" })} className="rounded-[18px] p-3.5 bg-blue-600 text-white cursor-pointer"><div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center"><CalendarDays className="h-4 w-4" /></div><div className="mt-8"><p className="text-[11px] opacity-70">إجازات</p><p className="text-[28px] font-black leading-none">{stats.onLeave}</p><p className="text-[10px] opacity-80">مُعتمدة</p></div></div>
        <div className="rounded-[18px] p-3.5 bg-pink-600 text-white"><div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center"><Heart className="h-4 w-4" /></div><div className="mt-8"><p className="text-[11px] opacity-70">مرضى</p><p className="text-[28px] font-black leading-none">{stats.sick}</p></div></div>
        <div className="rounded-[18px] p-3.5 bg-orange-500 text-white"><div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center"><Timer className="h-4 w-4" /></div><div className="mt-8"><p className="text-[11px] opacity-70">إذن</p><p className="text-[28px] font-black leading-none">0</p></div></div>
        <div onClick={() => navigate({ to: "/weapons" })} className="rounded-[18px] p-3.5 bg-slate-800 text-white cursor-pointer"><div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center"><Shield className="h-4 w-4" /></div><div className="mt-8"><p className="text-[11px] opacity-70">الأسلحة</p><p className="text-[28px] font-black leading-none">7</p></div></div>
        <div className="rounded-[18px] p-3.5 bg-[#c5a059] text-black"><div className="w-9 h-9 rounded-xl bg-black/10 flex items-center justify-center"><Star className="h-4 w-4" /></div><div className="mt-8"><p className="text-[11px] opacity-70">القادة</p><p className="text-[28px] font-black leading-none">{stats.leaders}</p></div></div>
      </div></div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card className="rounded-[20px] border-2 border-black overflow-hidden"><CardContent className="p-0"><div className="bg-black text-white p-3 flex justify-between items-center"><span className="font-black text-xs flex items-center gap-2"><ClipboardCheck className="h-4 w-4 text-[#c5a059]" /> خدمات اليوم - {services.length} مواقع</span><Button size="sm" variant="ghost" className="h-6 text-[10px] text-white" onClick={() => navigate({ to: "/services/view" })}><Eye className="h-3 w-3 ml-1" />عرض</Button></div><div className="p-3 space-y-2">{services.length === 0? <div className="text-center py-6 text-xs">⚠️ لم يتم رفع خدمات اليوم</div> : services.slice(0,3).map((s: any) => <div key={s.id} className="flex justify-between items-center bg-gray-50 border rounded-xl px-3 py-2 text-xs"><span className="font-bold">{s.location}</span><span className="bg-black text-white px-2 py-0.5 rounded-full text-[10px]">{[s.member_1,s.member_2,s.member_3,s.member_4,s.member_5,s.member_6].filter(Boolean).length} أفراد</span></div>)}</div></CardContent></Card>
        <Card className="rounded-[20px] border-2 overflow-hidden"><CardContent className="p-0"><div className="bg-white border-b-2 p-3 flex justify-between items-center"><span className="font-black text-xs flex items-center gap-2"><Clock className="h-4 w-4" /> آخر العمليات المباشرة</span><span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full animate-pulse">مباشر</span></div><div className="p-2 space-y-1 max-h-[160px] overflow-auto">{audit.map((a: any) => (<div key={a.id} className="flex gap-2 items-center text-[11px] border-b last:border-0 py-2 px-2"><div className="w-6 h-6 rounded-full bg-black text-white flex items-center justify-center text-[9px] font-bold shrink-0">{(profMap[a.user_id]||"ن")[0]}</div><div className="flex-1 min-w-0"><span className="font-bold" dir="auto">{profMap[a.user_id]||"نظام"}</span> <span className="text-muted-foreground">{a.action==='create'?'رفع':a.action}</span></div><span className="text-[9px] text-muted-foreground">{new Date(a.created_at).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}</span></div>))}</div></CardContent></Card>
      </div>
    </div>
  );
}
