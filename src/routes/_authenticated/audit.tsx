import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollText, Search, Eye, FileText, Shield, Clock, Users, Activity, AlertTriangle, Crown, LogIn, LogOut } from "lucide-react";

export const Route = createFileRoute("/_authenticated/audit")({ component: AuditPage });

const ENTITY_LABEL: Record<string, string> = { daily_reports: "تقرير", leaves: "إجازة", services: "خدمة", persons: "فرد", weapons: "سلاح", users: "مستخدم", auth: "دخول", audit_log: "سجل" };
const ACTION_LABEL: Record<string, string> = { create: "رفع", update: "تعديل", delete: "حذف", approve: "اعتماد", sign_in: "دخول", sign_out: "خروج" };

function ServiceView({ id }: { id: string }) {
  const { data } = useQuery({
    queryKey: ["service-view", id],
    queryFn: async () => {
      const { data } = await supabase.from("services").select("*").eq("id", id).maybeSingle();
      if (!data) return null;
      const memberIds = [data.member_1, data.member_2, data.member_3, data.member_4, data.member_5, data.member_6].filter(Boolean);
      let members: any[] = [];
      if (memberIds.length > 0) {
        const { data: persons } = await supabase.from("persons").select("id, full_name, rank").in("id", memberIds);
        members = persons?? [];
      }
      return {...data, members };
    },
  });
  if (!data) return <div className="text-center py-6">جاري التحميل...</div>;
  return (
    <div className="border-2 rounded-xl p-4 bg-white space-y-3">
      <div className="flex justify-between border-b-2 border-dashed pb-2"><h3 className="font-black flex gap-2"><Shield className="h-5 w-5" /> أمر خدمة</h3><span className="text-xs font-mono bg-black text-white px-2 py-1 rounded">{new Date(data.service_date).toLocaleDateString("ar-EG")}</span></div>
      <div className="text-sm">الموقع: <b>{data.location}</b></div>
      <div className="grid gap-1">{data.members.map((m: any) => <div key={m.id} className="bg-gray-50 border px-3 py-2 rounded-lg flex justify-between"><span dir="auto">{m.full_name}</span><span className="text-xs">{m.rank}</span></div>)}</div>
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
  if (!data?.report) return <div className="text-center py-6">جاري التحميل...</div>;
  return <div className="border-2 rounded-xl p-4 bg-white"><h3 className="font-black flex gap-2"><FileText className="h-5 w-5" /> تقرير يومي</h3><div className="text-sm mt-2">التشكيل: {data.report.formation} | البنود: {data.entries?.length}</div></div>;
}

export default function AuditPage() {
  const [action, setAction] = useState("all");
  const [entity, setEntity] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<any>(null);

  const { data: rows = [], refetch } = useQuery({
    queryKey: ["audit-log"],
    queryFn: async () => {
      const { data } = await supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(1000);
      return data?? [];
    },
  });

  // الحل الجذري: نجيب البروفايلات فقط للي موجودين في السجل، مو أول 100 عشوائي
  const userIds = useMemo(() => [...new Set((rows as any[]).map(r => r.user_id).filter(Boolean))], [rows]);

  const { data: profs = [] } = useQuery({
    queryKey: ["audit-profiles", userIds.join(",")],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name, email").in("id", userIds);
      return data?? [];
    },
  });

  const profMap = useMemo(() => {
    const m: Record<string, any> = {};
    (profs as any[]).forEach((p: any) => { m[p.id] = p; });
    return m;
  }, [profs]);

  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0,10);
    const todayRows = (rows as any[]).filter((r: any) => r.created_at.slice(0,10) === today);
    const deletes = (rows as any[]).filter((r: any) => r.action === 'delete').length;
    const userCounts: Record<string, number> = {};
    todayRows.forEach((r: any) => { if(r.user_id) userCounts[r.user_id] = (userCounts[r.user_id]||0)+1; });
    const topUserId = Object.keys(userCounts).sort((a,b)=>userCounts[b]-userCounts[a])[0];
    return { todayCount: todayRows.length, deletes, topUser: topUserId? profMap[topUserId]?.full_name || profMap[topUserId]?.email : "-", topCount: userCounts[topUserId]||0 };
  }, [rows, profMap]);

  const filtered = useMemo(() => {
    return (rows as any[]).filter((r) => {
      if (action!== "all" && r.action!== action) return false;
      if (entity!== "all" && r.entity!== entity) return false;
      if (search) {
        const p = r.user_id? profMap[r.user_id] : null;
        const txt = `${p?.full_name||""} ${p?.email||""} ${r.action} ${r.entity}`.toLowerCase();
        if (!txt.includes(search.toLowerCase())) return false;
      }
      return true;
    });
  }, [rows, action, entity, search, profMap]);

  return (
    <div className="space-y-4 p-2" dir="rtl">
      <h1 className="text-2xl font-black flex items-center gap-2"><ScrollText className="h-6 w-6" /> مركز الرصد - راصد</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="border-2 border-black"><CardContent className="pt-4 flex justify-between items-center"><div><p className="text-xs">عمليات اليوم</p><p className="text-3xl font-black">{stats.todayCount}</p></div><Activity className="h-8 w-8" /></CardContent></Card>
        <Card className="border-2"><CardContent className="pt-4 flex justify-between items-center"><div><p className="text-xs">أنشط مستخدم</p><p className="text-base font-bold flex gap-1" dir="auto"><Crown className="h-4 w-4 text-yellow-500" />{stats.topUser}</p><p className="text-xs">{stats.topCount} عملية</p></div><Users className="h-8 w-8" /></CardContent></Card>
        <Card className={`border-2 ${stats.deletes > 5? 'border-red-500 bg-red-50' : ''}`}><CardContent className="pt-4 flex justify-between items-center"><div><p className="text-xs">حذف</p><p className="text-3xl font-black">{stats.deletes}</p></div><AlertTriangle className="h-8 w-8" /></CardContent></Card>
      </div>

      <Card><CardContent className="pt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div><Label>بحث</Label><div className="relative"><Search className="absolute right-2 top-2.5 h-4 w-4" /><Input className="pr-8" value={search} onChange={e=>setSearch(e.target.value)} placeholder="شفيق، براف، Brav..." /></div></div>
        <div><Label>العملية</Label><Select value={action} onValueChange={setAction}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">الكل</SelectItem><SelectItem value="create">رفع</SelectItem><SelectItem value="approve">اعتماد</SelectItem><SelectItem value="delete">حذف</SelectItem><SelectItem value="sign_in">دخول</SelectItem><SelectItem value="sign_out">خروج</SelectItem></SelectContent></Select></div>
        <div><Label>القسم</Label><Select value={entity} onValueChange={setEntity}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">الكل</SelectItem><SelectItem value="daily_reports">تقارير</SelectItem><SelectItem value="services">خدمات</SelectItem><SelectItem value="leaves">إجازات</SelectItem><SelectItem value="auth">دخول</SelectItem></SelectContent></Select></div>
      </CardContent></Card>

      <Card><CardContent className="p-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>الوقت</TableHead><TableHead>المستخدم</TableHead><TableHead>العملية</TableHead><TableHead>القسم</TableHead><TableHead>النموذج</TableHead></TableRow></TableHeader><TableBody>
        {filtered.map((r: any) => {
          const p = r.user_id? profMap[r.user_id] : null;
          const displayName = p?.full_name || p?.email || r.details?.email || "نظام";
          return (
            <TableRow key={r.id} className={r.action==='delete'?'bg-red-50/50':''}>
              <TableCell className="text-xs whitespace-nowrap" dir="ltr">{new Date(r.created_at).toLocaleString("ar-EG")}</TableCell>
              <TableCell className="font-bold text-sm" dir="auto">{displayName}</TableCell>
              <TableCell><span className={`text-xs px-2 py-1 rounded-full border font-bold ${r.action==='delete'?'bg-red-600 text-white':'bg-white'}`}>{ACTION_LABEL[r.action]??r.action}{r.details?.duration_text? ` (${r.details.duration_text})`:''}</span></TableCell>
              <TableCell className="text-sm">{ENTITY_LABEL[r.entity]??r.entity}</TableCell>
              <TableCell><button onClick={()=>setSelected(r)} className="bg-black text-white px-3 py-1 rounded-full text-xs flex gap-1 items-center"><Eye className="h-3 w-3" />عرض</button></TableCell>
            </TableRow>
          );
        })}
      </TableBody></Table></div></CardContent></Card>

      <Dialog open={!!selected} onOpenChange={()=>setSelected(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-auto bg-[#f8f8f5]" dir="rtl">
          <DialogHeader><DialogTitle className="font-black">سجل العملية</DialogTitle></DialogHeader>
          {selected && <div className="space-y-3">
            <div className="bg-white border-2 border-black p-3 rounded-xl grid grid-cols-2 gap-2 text-sm">
              <div><Clock className="h-4 w-4 inline ml-1" /> {new Date(selected.created_at).toLocaleString("ar-EG")}</div>
              <div dir="auto"><Users className="h-4 w-4 inline ml-1" /> {profMap[selected.user_id]?.full_name || profMap[selected.user_id]?.email || selected.details?.email || "نظام"}</div>
              {selected.details?.duration_text && <div className="col-span-2 bg-black text-white p-2 rounded text-center">مدة البقاء: {selected.details.duration_text}</div>}
            </div>
            {selected.entity==="services" && <ServiceView id={selected.entity_id} />}
            {selected.entity==="daily_reports" && <ReportView id={selected.entity_id} />}
            {selected.entity==="auth" && <div className="bg-white border-2 p-6 rounded-xl text-center"><LogIn className="h-10 w-10 mx-auto mb-2" /><p className="font-black">{selected.action==="sign_in"?"تسجيل دخول":"تسجيل خروج"}</p><p dir="auto" className="text-sm">{selected.details?.email}</p></div>}
          </div>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
