import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollText, Search } from "lucide-react";

const getAuditLogs = createServerFn({ method: "GET" })
.middleware([requireSupabaseAuth])
.handler(async ({ context }) => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // تحقق مالك
  const { data: isOwner } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", context.userId).eq("role","owner").maybeSingle();
  if (!isOwner) throw new Error("Forbidden");

  const { data: logs } = await supabaseAdmin.from("audit_log").select("id, user_id, action, entity, entity_id, details, created_at").order("created_at",{ascending:false}).limit(1000);
  const { data: profs } = await supabaseAdmin.from("profiles").select("id, full_name, email");

  return { logs: logs??[], profiles: profs??[] };
});

export const Route = createFileRoute("/_authenticated/audit")({
  component: AuditPage,
  loader: async () => {
    try { return await getAuditLogs(); }
    catch { return { logs: [], profiles: [] }; }
  },
});

function AuditPage() {
  const initial = Route.useLoaderData() as any;
  const [logs, setLogs] = useState(initial.logs);
  const [profs] = useState(initial.profiles);
  const [action, setAction] = useState("all");
  const [entity, setEntity] = useState("all");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");

  const profMap = useMemo(() => {
    const m: Record<string,any> = {}; profs.forEach((p:any)=> m[p.id]=p); return m;
  }, [profs]);

  const filtered = useMemo(() => {
    return logs.filter((r:any)=>{
      if (action!=="all" && r.action!==action) return false;
      if (entity!=="all" && r.entity!==entity) return false;
      if (dateFrom && new Date(r.created_at) < new Date(dateFrom)) return false;
      if (search){
        const p = r.user_id? profMap[r.user_id] : null;
        const txt = `${p?.full_name||''} ${p?.email||''} ${r.action} ${r.entity}`.toLowerCase();
        if (!txt.includes(search.toLowerCase())) return false;
      }
      return true;
    });
  }, [logs, action, entity, dateFrom, search, profMap]);

  const refresh = async () => {
    try {
      const data = await getAuditLogs();
      setLogs(data.logs);
    } catch {}
  };

  return (
    <div className="space-y-6" dir="rtl" onTouchStart={()=>{}} onScroll={()=>{}}>
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ScrollText className="h-6 w-6" /> سجل العمليات</h1>
          <p className="text-muted-foreground text-sm">كل حركة مسجلة بالسيرفر - لا يمكن حذفها أو التلاعب بها</p>
        </div>
        <button onClick={refresh} className="text-sm border px-3 py-1 rounded">تحديث</button>
      </div>

      <Card><CardHeader><CardTitle className="text-base">فلترة</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div><Label>بحث</Label><div className="relative"><Search className="absolute right-2 top-2.5 h-4 w-4 text-muted-foreground"/><Input className="pr-8" value={search} onChange={e=>setSearch(e.target.value)} placeholder="اسم أو عملية..." /></div></div>
          <div><Label>العملية</Label><Select value={action} onValueChange={setAction}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">الكل</SelectItem>{Array.from(new Set(logs.map((r:any)=>r.action))).map((a:any)=><SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>القسم</Label><Select value={entity} onValueChange={setEntity}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">الكل</SelectItem>{Array.from(new Set(logs.map((r:any)=>r.entity))).map((e:any)=><SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>من تاريخ</Label><Input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} /></div>
        </CardContent>
      </Card>

      <Card><CardContent className="pt-6">
        <div className="overflow-x-auto">
          <Table><TableHeader><TableRow><TableHead>الوقت</TableHead><TableHead>المستخدم</TableHead><TableHead>العملية</TableHead><TableHead>القسم</TableHead><TableHead>تفاصيل</TableHead></TableRow></TableHeader>
            <TableBody>
              {filtered.length===0 && <TableRow><TableCell colSpan={5} className="text-center py-10">لا توجد سجلات بعد - أنشئ مستخدم جديد الآن وسيظهر هنا فوراً</TableCell></TableRow>}
              {filtered.map((r:any)=>{ const p=r.user_id?profMap[r.user_id]:null; return <TableRow key={r.id}><TableCell className="text-xs" dir="ltr">{new Date(r.created_at).toLocaleString("ar-EG")}</TableCell><TableCell>{p?.full_name||p?.email||"نظام"}</TableCell><TableCell>{r.action}</TableCell><TableCell>{r.entity}</TableCell><TableCell className="text-xs truncate max-w-[200px]">{r.details? JSON.stringify(r.details).slice(0,80) : r.entity_id||"-"}</TableCell></TableRow>})}
            </TableBody>
          </Table>
        </div>
      </CardContent></Card>
    </div>
  );
    }
