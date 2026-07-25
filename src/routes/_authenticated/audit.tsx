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
import { ScrollText, Search, Eye, FileText, Shield, Users, Calendar, Trash2, Edit, CheckCircle, LogIn } from "lucide-react";

export const Route = createFileRoute("/_authenticated/audit")({
  component: AuditPage,
});

const ENTITY_ICON: Record<string, any> = {
  daily_reports: FileText, report_entries: FileText, leaves: Calendar,
  services: Shield, persons: Users, weapons: Shield, users: Users, auth: LogIn,
};
const ENTITY_LABEL: Record<string, string> = {
  daily_reports: "تقرير يومي", report_entries: "بنود تقرير", leaves: "إجازة",
  services: "خدمة", persons: "فرد", weapons: "سلاح", users: "مستخدم", auth: "دخول نظام",
};
const ACTION_LABEL: Record<string, string> = {
  create: "إنشاء", update: "تعديل", delete: "حذف", approve: "اعتماد",
  approved: "اعتماد", pending: "قيد الانتظار", rejected: "رفض", sign_in: "دخول", sign_out: "خروج",
};

export default function AuditPage() {
  const [action, setAction] = useState("all");
  const [entity, setEntity] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<any>(null);

  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey: ["audit-log"],
    queryFn: async () => {
      const { data, error } = await supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(1000);
      if (error) throw error;
      return data;
    },
  });

  const { data: profs = [] } = useQuery({
    queryKey: ["audit-profiles"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name, email");
      return data?? [];
    },
  });

  const profMap = useMemo(() => {
    const m: Record<string, any> = {};
    (profs as any[]).forEach((p: any) => { m[p.id] = p; });
    return m;
  }, [profs]);

  const filtered = useMemo(() => {
    return (rows as any[]).filter((r) => {
      if (action!== "all" && r.action!== action) return false;
      if (entity!== "all" && r.entity!== entity) return false;
      if (search) {
        const p = r.user_id? profMap[r.user_id] : null;
        const txt = `${p?.full_name || ""} ${p?.email || ""} ${r.action} ${r.entity} ${JSON.stringify(r.details || "")}`.toLowerCase();
        if (!txt.includes(search.toLowerCase())) return false;
      }
      return true;
    });
  }, [rows, action, entity, search, profMap]);

  const getActionColor = (a: string) => {
    if (a === "delete") return "bg-red-100 text-red-700 border-red-200";
    if (a === "create") return "bg-green-100 text-green-700 border-green-200";
    if (a === "approve" || a === "approved") return "bg-emerald-100 text-emerald-700 border-emerald-200";
    if (a === "update") return "bg-blue-100 text-blue-700 border-blue-200";
    if (a === "sign_in") return "bg-purple-100 text-purple-700 border-purple-200";
    return "bg-gray-100 text-gray-700 border-gray-200";
  };

  return (
    <div className="space-y-6 p-2 md:p-4" dir="rtl">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <ScrollText className="h-6 w-6" /> سجل العمليات - نظام راصد
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            كل حركة في النظام مسجلة تلقائياً - لا يمكن حذفها أو التلاعب بها | {rows.length} عملية
          </p>
        </div>
        <button onClick={() => refetch()} className="border px-4 py-2 rounded-lg text-sm bg-white hover:bg-gray-50">تحديث</button>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">فلترة ذكية</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div><Label>بحث شامل</Label><div className="relative"><Search className="absolute right-2 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pr-8" value={search} onChange={e => setSearch(e.target.value)} placeholder="اسم، عملية، تفاصيل..." /></div></div>
          <div><Label>العملية</Label><Select value={action} onValueChange={setAction}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">الكل</SelectItem>{Array.from(new Set((rows as any[]).map((r: any) => r.action))).map((a: any) => <SelectItem key={a} value={a}>{ACTION_LABEL[a]?? a}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>القسم</Label><Select value={entity} onValueChange={setEntity}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">الكل</SelectItem>{Array.from(new Set((rows as any[]).map((r: any) => r.entity))).map((e: any) => <SelectItem key={e} value={e}>{ENTITY_LABEL[e]?? e}</SelectItem>)}</SelectContent></Select></div>
          <div className="flex items-end"><div className="text-xs text-muted-foreground">عرض {filtered.length} من {rows.length}</div></div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 p-0 md:p-6">
          {isLoading? <div className="text-center py-16">جاري التحميل...</div> :
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>الوقت</TableHead><TableHead>المستخدم</TableHead><TableHead>العملية</TableHead><TableHead>القسم</TableHead><TableHead>المرجع</TableHead><TableHead>تفاصيل</TableHead></TableRow></TableHeader>
                <TableBody>
                  {filtered.map((r: any) => {
                    const p = r.user_id? profMap[r.user_id] : null;
                    const Icon = ENTITY_ICON[r.entity]?? FileText;
                    return (
                      <TableRow key={r.id} className="hover:bg-muted/50">
                        <TableCell className="text-xs whitespace-nowrap" dir="ltr">{new Date(r.created_at).toLocaleString("ar-EG")}</TableCell>
                        <TableCell className="font-medium text-sm">{p?.full_name || p?.email || (r.user_id? "مستخدم" : "نظام")}</TableCell>
                        <TableCell><span className={`px-2 py-1 rounded-full text-xs border ${getActionColor(r.action)}`}>{ACTION_LABEL[r.action]?? r.action}</span></TableCell>
                        <TableCell className="flex items-center gap-1.5 text-sm"><Icon className="h-4 w-4" />{ENTITY_LABEL[r.entity]?? r.entity}</TableCell>
                        <TableCell className="text-xs text-muted-foreground" dir="ltr">{r.entity_id?.slice(0, 8)?? "-"}</TableCell>
                        <TableCell><button onClick={() => setSelected(r)} className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs border px-2 py-1 rounded"><Eye className="h-3 w-3" />عرض</button></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          }
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-auto" dir="rtl">
          <DialogHeader><DialogTitle>تفاصيل العملية</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3 bg-muted p-3 rounded-lg">
                <div><span className="text-muted-foreground">الوقت:</span> <span dir="ltr">{new Date(selected.created_at).toLocaleString("ar-EG")}</span></div>
                <div><span className="text-muted-foreground">المستخدم:</span> {profMap[selected.user_id]?.full_name || profMap[selected.user_id]?.email || selected.user_id || "نظام"}</div>
                <div><span className="text-muted-foreground">العملية:</span> {ACTION_LABEL[selected.action]?? selected.action}</div>
                <div><span className="text-muted-foreground">القسم:</span> {ENTITY_LABEL[selected.entity]?? selected.entity}</div>
                <div className="col-span-2"><span className="text-muted-foreground">المرجع ID:</span> <span dir="ltr" className="text-xs">{selected.entity_id}</span></div>
              </div>

              <div>
                <h4 className="font-bold mb-2">البيانات الكاملة:</h4>
                <pre className="bg-black text-green-400 p-3 rounded-lg text-xs overflow-auto max-h-[40vh]" dir="ltr">
                  {JSON.stringify(selected.details, null, 2)}
                </pre>
              </div>

              {selected.entity === "daily_reports" && selected.details?.new_data && (
                <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg">
                  <h4 className="font-bold">ملخص التقرير:</h4>
                  <p>التاريخ: {selected.details.new_data.report_date}</p>
                  <p>الحالة: {selected.details.new_data.status}</p>
                  <p>التشكيل: {selected.details.new_data.formation}</p>
                </div>
              )}

              {selected.entity === "leaves" && (
                <div className="bg-orange-50 border border-orange-200 p-3 rounded-lg">
                  <h4 className="font-bold">ملخص الإجازة:</h4>
                  <p>{JSON.stringify(selected.details, null, 2).slice(0, 300)}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
                                                                                                                                                              }
