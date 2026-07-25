import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollText, Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/audit")({
  component: AuditPage,
});

interface AuditRow {
  id: string;
  user_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  details: any;
  created_at: string;
}

const ACTION_LABEL: Record<string, string> = {
  sign_in: "تسجيل دخول", sign_out: "تسجيل خروج",
  create: "إنشاء", update: "تعديل", delete: "حذف",
  save: "حفظ", approve: "اعتماد", cancel_approval: "إلغاء اعتماد",
};
const ENTITY_LABEL: Record<string, string> = {
  daily_reports: "التقرير اليومي", services: "الخدمات", leaves: "الإجازات",
  persons: "الأفراد", weapons: "الأسلحة", users: "المستخدمين", auth: "المصادقة",
};

function AuditPage() {
  const { role, loading } = useAuth();
  const isOwner = role === "owner";
  const [action, setAction] = useState("all");
  const [entity, setEntity] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [search, setSearch] = useState("");

  const { data: rows = [] } = useQuery({
    queryKey: ["audit-log"],
    enabled: isOwner,
    queryFn: async () => {
      const { data, error } = await supabase.from("audit_log")
       .select("id, user_id, action, entity, entity_id, details, created_at")
       .order("created_at", { ascending: false }).limit(1000);
      if (error) throw error;
      return data as AuditRow[];
    },
  });

  const { data: profs = [] } = useQuery({
    queryKey: ["audit-profiles"],
    enabled: isOwner,
    queryFn: async () => {
      // هنا كان الخطأ - عمودك اسمه id مش user_id
      const { data } = await supabase.from("profiles").select("id, full_name, email");
      return (data?? []) as any[];
    },
  });

  const profMap = useMemo(() => {
    const m: Record<string, any> = {};
    profs.forEach((p: any) => { m[p.id] = p; });
    return m;
  }, [profs]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (action!== "all" && r.action!== action) return false;
      if (entity!== "all" && r.entity!== entity) return false;
      if (dateFrom && new Date(r.created_at) < new Date(dateFrom)) return false;
      if (search) {
        const p = r.user_id? profMap[r.user_id] : null;
        const name = p?.full_name || p?.email || "";
        if (!name.includes(search) &&!r.action.includes(search) &&!r.entity.includes(search)) return false;
      }
      return true;
    });
  }, [rows, action, entity, dateFrom, search, profMap]);

  if (loading) return <div className="p-6">جاري التحميل...</div>;
  if (!isOwner) throw redirect({ to: "/dashboard" });

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><ScrollText className="h-6 w-6" /> سجل العمليات - نظام راصد</h1>
        <p className="text-muted-foreground text-sm mt-1">كل حركة في النظام مسجلة: من، متى، ماذا فعل، وبالتفصيل</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">فلترة متقدمة</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div><Label>بحث بالاسم</Label><div className="relative"><Search className="absolute right-2 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pr-8" placeholder="اسم المستخدم..." value={search} onChange={e=>setSearch(e.target.value)} /></div></div>
          <div><Label>نوع العملية</Label><Select value={action} onValueChange={setAction}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">الكل</SelectItem>{Array.from(new Set(rows.map(r=>r.action))).map(a=><SelectItem key={a} value={a}>{ACTION_LABEL[a]??a}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>القسم</Label><Select value={entity} onValueChange={setEntity}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">الكل</SelectItem>{Array.from(new Set(rows.map(r=>r.entity))).map(e=><SelectItem key={e} value={e}>{ENTITY_LABEL[e]??e}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>من تاريخ</Label><Input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>التاريخ</TableHead><TableHead>المستخدم</TableHead><TableHead>العملية</TableHead><TableHead>القسم</TableHead><TableHead>التفاصيل</TableHead></TableRow></TableHeader>
              <TableBody>
                {filtered.length===0 && <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">لا توجد سجلات - سيبدأ التسجيل من الآن بعد الإصلاح</TableCell></TableRow>}
                {filtered.map(r=>{
                  const p = r.user_id? profMap[r.user_id] : null;
                  return <TableRow key={r.id}><TableCell className="text-xs" dir="ltr">{new Date(r.created_at).toLocaleString("ar-EG")}</TableCell><TableCell>{p?.full_name?? p?.email?? "نظام"}</TableCell><TableCell><span className={`px-2 py-1 rounded text-xs ${r.action==='delete'?'bg-red-100 text-red-700': r.action==='create'?'bg-green-100 text-green-700':'bg-blue-100 text-blue-700'}`}>{ACTION_LABEL[r.action]??r.action}</span></TableCell><TableCell>{ENTITY_LABEL[r.entity]??r.entity}</TableCell><TableCell className="text-xs max-w-[200px] truncate">{r.details? JSON.stringify(r.details) : r.entity_id?? "-"}</TableCell></TableRow>
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
                                                                                                                                                                                                                                                                      }
