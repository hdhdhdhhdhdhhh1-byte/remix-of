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
import { ScrollText } from "lucide-react";

export const Route = createFileRoute("/_authenticated/audit")({
  component: AuditPage,
});

interface AuditRow {
  id: string;
  user_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  created_at: string;
}

const ACTION_LABEL: Record<string, string> = {
  sign_in: "تسجيل دخول",
  sign_out: "تسجيل خروج",
  save: "حفظ",
  approve: "اعتماد",
  cancel_approval: "إلغاء اعتماد",
  create: "إنشاء",
  update: "تعديل",
  delete: "حذف",
};

const ENTITY_LABEL: Record<string, string> = {
  daily_reports: "التقرير اليومي",
  report_entries: "بنود التقرير",
  services: "الخدمات",
  leaves: "الإجازات",
  persons: "الأفراد",
  leaders: "القادة",
  weapons: "الأسلحة",
  users: "المستخدمين",
  auth: "المصادقة",
};

function AuditPage() {
  const { isAdmin, role, loading } = useAuth();
  const isOwner = role === "owner" || isAdmin;
  const [action, setAction] = useState<string>("all");
  const [entity, setEntity] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");

  const { data: rows = [] } = useQuery({
    queryKey: ["audit-log"],
    enabled: isOwner,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_log")
        .select("id, user_id, action, entity, entity_id, created_at")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as AuditRow[];
    },
  });

  const { data: profs = [] } = useQuery({
    queryKey: ["audit-profiles"],
    enabled: isOwner,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, full_name, email");
      return data ?? [];
    },
  });

  const profMap = useMemo(() => {
    const m: Record<string, { full_name: string | null; email: string | null }> = {};
    profs.forEach((p) => { m[p.user_id] = { full_name: p.full_name, email: p.email }; });
    return m;
  }, [profs]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (action !== "all" && r.action !== action) return false;
      if (entity !== "all" && r.entity !== entity) return false;
      if (dateFrom && r.created_at < dateFrom) return false;
      return true;
    });
  }, [rows, action, entity, dateFrom]);

  if (loading) return <div>...</div>;
  if (!isOwner) throw redirect({ to: "/dashboard" });

  const actions = Array.from(new Set(rows.map((r) => r.action)));
  const entities = Array.from(new Set(rows.map((r) => r.entity)));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
          <ScrollText className="h-6 w-6" /> سجل العمليات
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          يعرض جميع العمليات الحرجة في النظام (دخول، خروج، إنشاء، تعديل، اعتماد)
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">تصفية</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label>نوع العملية</Label>
              <Select value={action} onValueChange={setAction}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  {actions.map((a) => (
                    <SelectItem key={a} value={a}>{ACTION_LABEL[a] ?? a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>القسم</Label>
              <Select value={entity} onValueChange={setEntity}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  {entities.map((e) => (
                    <SelectItem key={e} value={e}>{ENTITY_LABEL[e] ?? e}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>من تاريخ</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>التاريخ والوقت</TableHead>
                  <TableHead>المستخدم</TableHead>
                  <TableHead>العملية</TableHead>
                  <TableHead>القسم</TableHead>
                  <TableHead>المرجع</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                    لا توجد سجلات مطابقة
                  </TableCell></TableRow>
                )}
                {filtered.map((r) => {
                  const p = r.user_id ? profMap[r.user_id] : null;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs whitespace-nowrap" dir="ltr">
                        {new Date(r.created_at).toLocaleString("ar-EG")}
                      </TableCell>
                      <TableCell className="text-sm">
                        {p?.full_name ?? p?.email ?? (r.user_id ? "—" : "نظام")}
                      </TableCell>
                      <TableCell>{ACTION_LABEL[r.action] ?? r.action}</TableCell>
                      <TableCell>{ENTITY_LABEL[r.entity] ?? r.entity}</TableCell>
                      <TableCell className="text-xs text-muted-foreground" dir="ltr">
                        {r.entity_id ?? "-"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className="text-xs text-muted-foreground mt-2">
            عرض آخر {rows.length} عملية — بعد التصفية: {filtered.length}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}