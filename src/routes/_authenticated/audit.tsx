import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollText, Search, Eye, FileText, Users, Shield, Calendar, Clock, LogIn, LogOut } from "lucide-react";

export const Route = createFileRoute("/_authenticated/audit")({ component: AuditPage });

const ENTITY_LABEL: Record<string, string> = {
  daily_reports: "تقرير يومي", leaves: "إجازة", services: "خدمة حراسة",
  persons: "فرد", weapons: "سلاح", users: "مستخدم", auth: "نظام دخول",
};
const ACTION_LABEL: Record<string, string> = {
  create: "رفع", update: "تعديل", delete: "حذف", approve: "اعتماد", sign_in: "دخول للنظام", sign_out: "خروج من النظام",
};

// مكون يعرض الخدمة بشكل جميل
function ServiceView({ id }: { id: string }) {
  const { data } = useQuery({
    queryKey: ["service-view", id],
    queryFn: async () => {
      const { data } = await supabase.from("services").select("*").eq("id", id).maybeSingle();
      if (!data) return null;
      // جيب أسماء الأفراد
      const memberIds = [data.member_1, data.member_2, data.member_3, data.member_4, data.member_5, data.member_6].filter(Boolean);
      let members: any[] = [];
      if (memberIds.length > 0) {
        const { data: persons } = await supabase.from("persons").select("id, full_name, rank").in("id", memberIds);
        members = persons?? [];
      }
      return {...data, members };
    },
  });
  if (!data) return <div className="text-center py-4">جاري تحميل نموذج الخدمة...</div>;
  return (
    <div className="border rounded-xl p-4 bg-white space-y-3">
      <div className="flex justify-between items-center border-b pb-2">
        <h3 className="font-bold text-lg flex items-center gap-2"><Shield className="h-5 w-5" /> نموذج خدمة حراسة</h3>
        <span className="text-xs bg-gray-100 px-2 py-1 rounded">{new Date(data.service_date).toLocaleDateString("ar-EG")}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div><span className="text-muted-foreground">الموقع:</span> <span className="font-bold">{data.location || "—"}</span></div>
        <div><span className="text-muted-foreground">التاريخ:</span> {new Date(data.service_date).toLocaleDateString("ar-EG")}</div>
      </div>
      <div>
        <Label className="text-xs">طاقم الحراسة:</Label>
        <div className="grid grid-cols-1 gap-1 mt-1">
          {data.members?.length > 0? data.members.map((m: any) => (
            <div key={m.id} className="bg-gray-50 border px-3 py-1.5 rounded text-sm flex justify-between">
              <span>{m.full_name}</span><span className="text-xs text-muted-foreground">{m.rank}</span>
            </div>
          )) : <div className="text-xs text-muted-foreground">لا يوجد أفراد مسجلين</div>}
        </div>
      </div>
      {data.notes && <div className="bg-yellow-50 border border-yellow-200 p-2 rounded text-sm"><b>ملاحظات:</b> {data.notes}</div>}
    </div>
  );
}

function ReportView({ id }: { id: string }) {
  const { data } = useQuery({
    queryKey: ["report-view", id],
    queryFn: async () => {
      const { data: report } = await supabase.from("daily_reports").select("*").eq("id", id).maybeSingle();
      const { data: entries } = await supabase.from("report_entries").select("*").eq("report_id", id);
      return { report, entries };
    },
  });
  if (!data?.report) return <div className="text-center py-4">جاري تحميل التقرير...</div>;
  return (
    <div className="border rounded-xl p-4 bg-white space-y-3">
      <div className="flex justify-between border-b pb-2">
        <h3 className="font-bold flex items-center gap-2"><FileText className="h-5 w-5" /> التقرير اليومي</h3>
        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">{data.report.status}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>التاريخ: {new Date(data.report.report_date).toLocaleDateString("ar-EG")}</div>
        <div>التشكيل: {data.report.formation || "—"}</div>
      </div>
      <div className="text-sm">
        <b>البنود ({data.entries?.length || 0}):</b>
        <div className="mt-1 space-y-1 max-h-40 overflow-auto">
          {data.entries?.map((e: any, i: number) => <div key={i} className="bg-gray-50 border px-2 py-1 rounded text-xs">{e.content || e.description || JSON.stringify(e).slice(0,80)}</div>)}
        </div>
      </div>
    </div>
  );
}

function LeaveView({ id }: { id: string }) {
  const { data } = useQuery({
    queryKey: ["leave-view", id],
    queryFn: async () => {
      const { data } = await supabase.from("leaves").select("*, persons(full_name, rank)").eq("id", id).maybeSingle();
      return data;
    },
  });
  if (!data) return <div className="text-center py-4">جاري تحميل الإجازة...</div>;
  return (
    <div className="border rounded-xl p-4 bg-white space-y-2 text-sm">
      <h3 className="font-bold flex items-center gap-2"><Calendar className="h-5 w-5" /> نموذج إجازة</h3>
      <div>الفرد: <b>{(data as any).persons?.full_name} - {(data as any).persons?.rank}</b></div>
      <div>من: {new Date(data.start_date).toLocaleDateString("ar-EG")} إلى: {new Date(data.end_date).toLocaleDateString("ar-EG")}</div>
      <div>السبب: {data.reason || data.leave_type || "—"}</div>
      <div>الحالة: <span className="px-2 py-1 rounded bg-orange-100">{data.status}</span></div>
    </div>
  );
}

export default function AuditPage() {
  const [action, setAction] = useState("all");
  const [entity, setEntity] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<any>(null);

  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey: ["audit-log"],
    queryFn: async () => {
      const { data } = await supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(500);
      return data?? [];
    },
  });

  const { data: profs = [] } = useQuery({
    queryKey: ["audit-profiles"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name, email");
      return data?? [];
    },
  });

  const profMap = useMemo(() => { const m: Record<string, any> = {}; (profs as any[]).forEach((p: any) => m[p.id] = p); return m; }, [profs]);

  // حساب مدة الجلسة (دخول وخروج)
  const enrichedRows = useMemo(() => {
    return (rows as any[]).map((r) => {
      let sessionDuration = null;
      if (r.action === "sign_out" && r.details?.session_start) {
        const diff = new Date(r.created_at).getTime() - new Date(r.details.session_start).getTime();
        const mins = Math.round(diff / 60000);
        sessionDuration = mins < 60? `${mins} دقيقة` : `${Math.floor(mins/60)} ساعة و ${mins%60} دقيقة`;
      }
      return {...r, sessionDuration };
    });
  }, [rows]);

  const filtered = useMemo(() => {
    return enrichedRows.filter((r) => {
      if (action!== "all" && r.action!== action) return false;
      if (entity!== "all" && r.entity!== entity) return false;
      if (search) {
        const p = r.user_id? profMap[r.user_id] : null;
        const txt = `${p?.full_name || ""} ${r.action} ${r.entity}`.toLowerCase();
        if (!txt.includes(search.toLowerCase())) return false;
      }
      return true;
    });
  }, [enrichedRows, action, entity, search, profMap]);

  return (
    <div className="space-y-4 p-2" dir="rtl">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold flex items-center gap-2"><ScrollText className="h-5 w-5" /> سجل العمليات الذكي</h1>
        <button onClick={() => refetch()} className="border bg-white px-3 py-1.5 rounded-lg text-sm">تحديث</button>
      </div>

      <Card><CardContent className="pt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div><Label>بحث</Label><div className="relative"><Search className="absolute right-2 top-2.5 h-4 w-4" /><Input className="pr-8" value={search} onChange={e => setSearch(e.target.value)} placeholder="اسم أو عملية..." /></div></div>
        <div><Label>العملية</Label><Select value={action} onValueChange={setAction}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">الكل</SelectItem><SelectItem value="create">رفع / إنشاء</SelectItem><SelectItem value="approve">اعتماد</SelectItem><SelectItem value="delete">حذف</SelectItem><SelectItem value="sign_in">دخول</SelectItem><SelectItem value="sign_out">خروج</SelectItem></SelectContent></Select></div>
        <div><Label>القسم</Label><Select value={entity} onValueChange={setEntity}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">الكل</SelectItem><SelectItem value="daily_reports">تقارير</SelectItem><SelectItem value="services">خدمات</SelectItem><SelectItem value="leaves">إجازات</SelectItem><SelectItem value="users">مستخدمين</SelectItem></SelectContent></Select></div>
      </CardContent></Card>

      <Card><CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table><TableHeader><TableRow><TableHead>الوقت</TableHead><TableHead>المستخدم</TableHead><TableHead>العملية</TableHead><TableHead>القسم</TableHead><TableHead>عرض</TableHead></TableRow></TableHeader>
            <TableBody>
              {filtered.map((r: any) => {
                const p = r.user_id? profMap[r.user_id] : null;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs whitespace-nowrap" dir="ltr">{new Date(r.created_at).toLocaleString("ar-EG")}</TableCell>
                    <TableCell className="text-sm font-medium">{p?.full_name || p?.email || "نظام"}</TableCell>
                    <TableCell>
                      <span className="text-xs px-2 py-1 rounded-full border bg-white flex items-center gap-1 w-fit">
                        {r.action === "sign_in" && <LogIn className="h-3 w-3" />}
                        {r.action === "sign_out" && <LogOut className="h-3 w-3" />}
                        {ACTION_LABEL[r.action]?? r.action}
                        {r.sessionDuration && <span className="text-[10px] text-muted-foreground">({r.sessionDuration})</span>}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">{ENTITY_LABEL[r.entity]?? r.entity}</TableCell>
                    <TableCell><button onClick={() => setSelected(r)} className="text-blue-600 border px-2 py-1 rounded text-xs flex items-center gap-1"><Eye className="h-3 w-3" />عرض النموذج</button></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent></Card>

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-auto bg-gray-50" dir="rtl">
          <DialogHeader><DialogTitle>تفاصيل العملية - {ENTITY_LABEL[selected?.entity]?? selected?.entity}</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="bg-white border p-3 rounded-lg grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-2"><Clock className="h-4 w-4" /> {new Date(selected.created_at).toLocaleString("ar-EG")}</div>
                <div><Users className="h-4 w-4 inline ml-1" /> {profMap[selected.user_id]?.full_name || "نظام"}</div>
                <div>العملية: <b>{ACTION_LABEL[selected.action]?? selected.action}</b></div>
                <div>القسم: <b>{ENTITY_LABEL[selected.entity]?? selected.entity}</b></div>
                {selected.sessionDuration && <div className="col-span-2 bg-purple-50 border border-purple-200 p-2 rounded">مدة الجلسة: <b>{selected.sessionDuration}</b> (من {new Date(selected.details.session_start).toLocaleTimeString("ar-EG")} حتى {new Date(selected.created_at).toLocaleTimeString("ar-EG")})</div>}
              </div>

              {/* هنا السحر - نعرض النموذج الحقيقي */}
              {selected.entity === "services" && <ServiceView id={selected.entity_id} />}
              {selected.entity === "daily_reports" && <ReportView id={selected.entity_id} />}
              {selected.entity === "leaves" && <LeaveView id={selected.entity_id} />}

              {/* للعمليات اللي مالها نموذج - نعرض فقط الوقت والتاريخ */}
              {!["services", "daily_reports", "leaves"].includes(selected.entity) && (
                <div className="bg-white border p-4 rounded-xl text-center text-sm text-muted-foreground">
                  <p>العملية: {selected.action}</p>
                  <p>التاريخ: {new Date(selected.created_at).toLocaleDateString("ar-EG")}</p>
                  <p>الساعة: {new Date(selected.created_at).toLocaleTimeString("ar-EG")}</p>
                  <p className="mt-2 text-xs">المرجع: {selected.entity_id}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
          }

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollText, Search, Eye, FileText, Users, Shield, Calendar, Clock, LogIn, LogOut, Activity, AlertTriangle, Crown } from "lucide-react";

export const Route = createFileRoute("/_authenticated/audit")({ component: AuditPage });

const ENTITY_LABEL: Record<string, string> = { daily_reports: "تقرير", leaves: "إجازة", services: "خدمة", persons: "فرد", weapons: "سلاح", users: "مستخدم", auth: "دخول" };
const ACTION_LABEL: Record<string, string> = { create: "رفع", update: "تعديل", delete: "حذف", approve: "اعتماد", sign_in: "دخول", sign_out: "خروج" };

function ServiceView({ id }: { id: string }) {
  const { data } = useQuery({ queryKey: ["service-view", id], queryFn: async () => {
    const { data } = await supabase.from("services").select("*").eq("id", id).maybeSingle();
    if (!data) return null;
    const memberIds = [data.member_1, data.member_2, data.member_3, data.member_4, data.member_5, data.member_6].filter(Boolean);
    let members: any[] = [];
    if (memberIds.length > 0) {
      const { data: persons } = await supabase.from("persons").select("id, full_name, rank").in("id", memberIds);
      members = persons?? [];
    }
    return {...data, members };
  }});
  if (!data) return <div className="text-center py-6">جاري التحميل...</div>;
  return (
    <div className="border-2 rounded-xl p-4 bg-gradient-to-br from-white to-slate-50 space-y-3">
      <div className="flex justify-between border-b-2 border-dashed pb-2"><h3 className="font-black flex gap-2"><Shield className="h-5 w-5" /> أمر خدمة حراسة</h3><span className="text-xs font-mono bg-black text-white px-2 py-1 rounded">{new Date(data.service_date).toLocaleDateString("ar-EG")}</span></div>
      <div className="grid grid-cols-2 gap-2 text-sm"><div>الموقع: <b className="text-base">{data.location}</b></div><div>التاريخ: {new Date(data.service_date).toLocaleDateString("ar-EG")}</div></div>
      <div><Label className="text-xs font-bold">الطاقم:</Label><div className="grid gap-1 mt-1">{data.members.map((m: any) => <div key={m.id} className="bg-white border-2 px-3 py-2 rounded-lg flex justify-between font-medium"><span>{m.full_name}</span><span className="text-xs bg-slate-100 px-2 py-0.5 rounded">{m.rank}</span></div>)}</div></div>
    </div>
  );
}
function ReportView({ id }: { id: string }) {
  const { data } = useQuery({ queryKey: ["report-view", id], queryFn: async () => {
    const { data: report } = await supabase.from("daily_reports").select("*").eq("id", id).maybeSingle();
    const { data: entries } = await supabase.from("report_entries").select("*").eq("report_id", id);
    return { report, entries };
  }});
  if (!data?.report) return <div className="text-center py-6">جاري التحميل...</div>;
  return (
    <div className="border-2 rounded-xl p-4 bg-white"><div className="flex justify-between border-b pb-2"><h3 className="font-black flex gap-2"><FileText className="h-5 w-5" /> تقرير يومي</h3><span className="text-xs bg-blue-600 text-white px-2 py-1 rounded">{data.report.status}</span></div><div className="text-sm mt-2">التشكيل: {data.report.formation} | البنود: {data.entries?.length}</div></div>
  );
}

export default function AuditPage() {
  const [action, setAction] = useState("all");
  const [entity, setEntity] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<any>(null);

  const { data: rows = [], isLoading, refetch } = useQuery({ queryKey: ["audit-log"], queryFn: async () => { const { data } = await supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(1000); return data?? []; }});
  const { data: profs = [] } = useQuery({ queryKey: ["audit-profiles"], queryFn: async () => { const { data } = await supabase.from("profiles").select("id, full_name, email").limit(100); return data?? []; }});
  const profMap = useMemo(() => { const m: Record<string, any> = {}; (profs as any[]).forEach((p: any) => m[p.id] = p); return m; }, [profs]);

  // إبداع: إحصائيات
  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0,10);
    const todayRows = (rows as any[]).filter((r: any) => r.created_at.slice(0,10) === today);
    const deletes = (rows as any[]).filter((r: any) => r.action === 'delete').length;
    const userCounts: Record<string, number> = {};
    todayRows.forEach((r: any) => { if(r.user_id) userCounts[r.user_id] = (userCounts[r.user_id]||0)+1; });
    const topUserId = Object.keys(userCounts).sort((a,b)=>userCounts[b]-userCounts[a])[0];
    return { todayCount: todayRows.length, deletes, topUser: topUserId? profMap[topUserId]?.full_name : "-", topCount: userCounts[topUserId]||0 };
  }, [rows, profMap]);

  const filtered = useMemo(() => {
    return (rows as any[]).filter((r) => {
      if (action!== "all" && r.action!== action) return false;
      if (entity!== "all" && r.entity!== entity) return false;
      if (search) { const p = r.user_id? profMap[r.user_id] : null; const txt = `${p?.full_name||""} ${r.action} ${r.entity}`.toLowerCase(); if (!txt.includes(search.toLowerCase())) return false; }
      return true;
    });
  }, [rows, action, entity, search, profMap]);

  return (
    <div className="space-y-4 p-2" dir="rtl">
      <h1 className="text-3xl font-black flex items-center gap-2"><ScrollText className="h-7 w-7" /> مركز الرصد - راصد</h1>

      {/* لوحة القيادة الإبداعية */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="border-2 border-black"><CardContent className="pt-4 flex justify-between items-center"><div><p className="text-xs text-muted-foreground">عمليات اليوم</p><p className="text-3xl font-black">{stats.todayCount}</p></div><Activity className="h-8 w-8" /></CardContent></Card>
        <Card className="border-2"><CardContent className="pt-4 flex justify-between items-center"><div><p className="text-xs text-muted-foreground">أنشط مستخدم اليوم</p><p className="text-lg font-bold flex gap-1"><Crown className="h-4 w-4 text-yellow-500" />{stats.topUser}</p><p className="text-xs">{stats.topCount} عملية</p></div><Users className="h-8 w-8" /></CardContent></Card>
        <Card className={`border-2 ${stats.deletes > 5? 'border-red-500 bg-red-50' : ''}`}><CardContent className="pt-4 flex justify-between items-center"><div><p className="text-xs">عمليات حذف (تنبيه)</p><p className="text-3xl font-black">{stats.deletes}</p></div><AlertTriangle className={`h-8 w-8 ${stats.deletes > 5? 'text-red-500' : ''}`} /></CardContent></Card>
      </div>

      <Card><CardContent className="pt-4 grid grid-cols-3 gap-3">
        <div><Label>بحث</Label><div className="relative"><Search className="absolute right-2 top-2.5 h-4 w-4" /><Input className="pr-8" value={search} onChange={e=>setSearch(e.target.value)} /></div></div>
        <div><Label>العملية</Label><Select value={action} onValueChange={setAction}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">الكل</SelectItem><SelectItem value="create">رفع</SelectItem><SelectItem value="approve">اعتماد</SelectItem><SelectItem value="delete">حذف</SelectItem><SelectItem value="sign_in">دخول</SelectItem><SelectItem value="sign_out">خروج</SelectItem></SelectContent></Select></div>
        <div><Label>القسم</Label><Select value={entity} onValueChange={setEntity}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">الكل</SelectItem><SelectItem value="daily_reports">تقارير</SelectItem><SelectItem value="services">خدمات</SelectItem><SelectItem value="leaves">إجازات</SelectItem></SelectContent></Select></div>
      </CardContent></Card>

      <Card><CardContent className="p-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>الوقت</TableHead><TableHead>المستخدم</TableHead><TableHead>العملية</TableHead><TableHead>القسم</TableHead><TableHead>النموذج</TableHead></TableRow></TableHeader><TableBody>
        {filtered.map((r: any) => { const p = r.user_id? profMap[r.user_id] : null; return <TableRow key={r.id} className={r.action==='delete'?'bg-red-50/50':''}><TableCell className="text-xs" dir="ltr">{new Date(r.created_at).toLocaleString("ar-EG")}</TableCell><TableCell className="font-bold text-sm">{p?.full_name||p?.email||"نظام"}</TableCell><TableCell><span className={`text-xs px-2 py-1 rounded-full border-2 font-bold ${r.action==='delete'?'bg-red-600 text-white border-red-700': r.action==='create'?'bg-green-100 border-green-300':'bg-white'}`}>{ACTION_LABEL[r.action]??r.action} {r.details?.duration_text? `(${r.details.duration_text})`:''}</span></TableCell><TableCell className="text-sm">{ENTITY_LABEL[r.entity]??r.entity}</TableCell><TableCell><button onClick={()=>setSelected(r)} className="bg-black text-white px-3 py-1 rounded-full text-xs flex gap-1"><Eye className="h-3 w-3" />عرض</button></TableCell></TableRow> })}
      </TableBody></Table></div></CardContent></Card>

      <Dialog open={!!selected} onOpenChange={()=>setSelected(null)}><DialogContent className="max-w-3xl max-h-[90vh] overflow-auto bg-[#f8f8f5]" dir="rtl"><DialogHeader><DialogTitle className="font-black">سجل العملية</DialogTitle></DialogHeader>
        {selected && <div className="space-y-3">
          <div className="bg-white border-2 border-black p-3 rounded-xl grid grid-cols-2 gap-2 text-sm font-mono"><div><Clock className="h-4 w-4 inline"/> {new Date(selected.created_at).toLocaleString("ar-EG")}</div><div><Users className="h-4 w-4 inline"/> {profMap[selected.user_id]?.full_name||"نظام"}</div>{selected.details?.duration_text && <div className="col-span-2 bg-black text-white p-2 rounded text-center">مدة البقاء في النظام: {selected.details.duration_text}</div>}</div>
          {selected.entity==="services" && <ServiceView id={selected.entity_id} />}
          {selected.entity==="daily_reports" && <ReportView id={selected.entity_id} />}
          {selected.entity==="auth" && <div className="bg-white border-2 p-6 rounded-xl text-center"><LogIn className="h-10 w-10 mx-auto mb-2" /><p className="font-black text-lg">{selected.action==="sign_in"?"تسجيل دخول":"تسجيل خروج"}</p><p className="text-sm text-muted-foreground">{selected.details?.email}</p><p className="text-xs mt-2">من: {selected.details?.user_agent?.slice(0,60)}</p></div>}
          {!["services","daily_reports","auth"].includes(selected.entity) && <div className="bg-white border p-4 rounded-xl text-center text-sm">التاريخ: {new Date(selected.created_at).toLocaleDateString("ar-EG")} - الساعة: {new Date(selected.created_at).toLocaleTimeString("ar-EG")}</div>}
        </div>}
      </DialogContent></Dialog>
    </div>
  );
                                                                                             }
