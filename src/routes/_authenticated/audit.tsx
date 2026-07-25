import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollText, Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/audit")({
  component: AuditPage,
});

export default function AuditPage() {
  const [action, setAction] = useState("all");
  const [entity, setEntity] = useState("all");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");

  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey: ["audit-log"],
    queryFn: async () => {
      const { data, error } = await supabase.from("audit_log")
       .select("id, user_id, action, entity, entity_id, details, created_at")
       .order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return data;
    },
  });

  const { data: profs = [] } = useQuery({
    queryKey: ["audit-profiles"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name, email");
      return data??[];
    },
  });

  const profMap = useMemo(() => {
    const m: Record<string, any> = {};
    profs.forEach((p: any) => { m[p.id] = p; });
    return m;
  }, [profs]);

  const filtered = useMemo(() => {
    return (rows as any[]).filter((r) => {
      if (action!== "all" && r.action!== action) return false;
      if (entity!== "all" && r.entity!== entity) return false;
      if (dateFrom && new Date(r.created_at) < new Date(dateFrom)) return false;
      if (search) {
        const p = r.user_id? profMap[r.user_id] : null;
        const txt = `${p?.full_name||''} ${p?.email||''} ${r.action} ${r.entity} ${JSON.stringify(r.details||'')}`.toLowerCase();
        if (!txt.includes(search.toLowerCase())) return false;
      }
      return true;
    });
  }, [rows, action, entity, dateFrom, search, profMap]);

  return (
    <div className="space-y-6 p-4" dir="rtl">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ScrollText className="h-6 w-6" /> سجل العمليات</h1>
          <p className="text-muted-foreground text-sm">كل حركة مسجلة - {rows.length} عملية</p>
        </div>
        <button onClick={() => refetch()} className="border px-4 py-2 rounded-lg text-sm bg-white">تحديث</button>
      </div>

      <Card>
        <CardHeader><CardTitle>فلترة</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div><Label>بحث</Label><div className="relative"><Search className="absolute right-2 top-2.5 h-4 w-4" /><Input className="pr-8" value={search} onChange={e=>setSearch(e.target.value)} placeholder="اسم أو عملية..." /></div></div>
          <div><Label>العملية</Label><Select value={action} onValueChange={setAction}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">الكل</SelectItem>{Array.from(new Set((rows as any[]).map((r:any)=>r.action))).map((a:any)=><SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>القسم</Label><Select value={entity} onValueChange={setEntity}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">الكل</SelectItem>{Array.from(new Set((rows as any[]).map((r:any)=>r.entity))).map((e:any)=><SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>من تاريخ</Label><Input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {isLoading? <div className="text-center py-10">جاري التحميل...</div> :
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>الوقت</TableHead><TableHead>المستخدم</TableHead><TableHead>العملية</TableHead><TableHead>القسم</TableHead><TableHead>تفاصيل</TableHead></TableRow></TableHeader>
              <TableBody>
                {filtered.length===0 && <TableRow><TableCell colSpan={5} className="text-center py-10">لا توجد سجلات مطابقة</TableCell></TableRow>}
                {filtered.map((r:any)=>{ const p = r.user_id?profMap[r.user_id]:null; return <TableRow key={r.id}><TableCell className="text-xs" dir="ltr">{new Date(r.created_at).toLocaleString("ar-EG")}</TableCell><TableCell>{p?.full_name||p?.email||"نظام"}</TableCell><TableCell><span className={`px-2 py-1 rounded text-xs ${r.action==='delete'?'bg-red-100 text-red-700': r.action==='create'?'bg-green-100 text-green-700':'bg-blue-100 text-blue-700'}`}>{r.action}</span></TableCell><TableCell>{r.entity}</TableCell><TableCell className="text-xs">{r.details? JSON.stringify(r.details).slice(0,100): r.entity_id||"-"}</TableCell></TableRow>})}
              </TableBody>
            </Table>
          </div>
          }
        </CardContent>
      </Card>
    </div>
  );
  }
