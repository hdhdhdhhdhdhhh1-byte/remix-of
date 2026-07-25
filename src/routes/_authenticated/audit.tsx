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
