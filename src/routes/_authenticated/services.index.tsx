import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Save, CheckCircle2, Printer, FileDown, Image as ImageIcon, Share2, Trash2, Eye, Pencil, Plus } from "lucide-react";
import { SERVICE_LOCATIONS, type ServiceLocation } from "@/lib/constants";
import { exportElementAsImage, exportElementAsPDF, printElement, shareElementAsImage } from "@/lib/export";

export const Route = createFileRoute("/_authenticated/services/")({
  component: ServicesPage,
});

interface Person { id: string; full_name: string; military_rank: string | null; formation: string | null; military_number: string | null; }
interface ServiceRow {
  id: string;
  service_date: string;
  location: string;
  member_1: string | null; member_2: string | null; member_3: string | null;
  member_4: string | null; member_5: string | null; member_6: string | null;
  recipient: string | null;
  notes: string | null;
  approved_at: string | null;
  archived: boolean;
  created_by: string | null;
  created_at: string;
}

const EMPTY_FORM = {
  service_date: new Date().toISOString().slice(0, 10),
  location: "التبة" as ServiceLocation,
  members: [null, null, null, null, null, null] as (string | null)[],
  recipient: "",
  notes: "",
};

function ServicesPage() {
  const { can, isAdmin, user } = useAuth();
  const canEdit = isAdmin || can("services_entry", "edit") || can("services_entry", "add");
  const canApprove = isAdmin || can("services_entry", "approve");
  const canDelete = isAdmin || can("services_entry", "delete");
  const qc = useQueryClient();

  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<ServiceRow | null>(null);
  const [viewing, setViewing] = useState<ServiceRow | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data: persons = [] } = useQuery({
    queryKey: ["persons-service-pool"],
    queryFn: async () => {
      // Per spec: قوائم الخدمات تعرض ف١ و ف٢ فقط (ولا تعرض ق س أو ق ك)
      const { data, error } = await supabase
        .from("persons")
        .select("id, full_name, military_rank, formation, military_number")
        .eq("active", true)
        .in("formation", ["ف١", "ف٢"])
        .order("full_name");
      if (error) throw error;
      return data as Person[];
    },
  });

  const { data: services = [], isLoading } = useQuery({
    queryKey: ["services"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("*")
        .order("service_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ServiceRow[];
    },
  });

  const personById = (id: string | null) => persons.find((p) => p.id === id);

  const openNew = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setOpenForm(true);
  };
  const openEdit = (s: ServiceRow) => {
    setEditing(s);
    setForm({
      service_date: s.service_date,
      location: s.location as ServiceLocation,
      members: [s.member_1, s.member_2, s.member_3, s.member_4, s.member_5, s.member_6],
      recipient: s.recipient ?? "",
      notes: s.notes ?? "",
    });
    setOpenForm(true);
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = {
        service_date: form.service_date,
        location: form.location,
        member_1: form.members[0], member_2: form.members[1], member_3: form.members[2],
        member_4: form.members[3], member_5: form.members[4], member_6: form.members[5],
        recipient: form.recipient || null,
        notes: form.notes || null,
      };
      if (editing) {
        const { error } = await supabase.from("services").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("services").insert({ ...payload, created_by: user?.id });
        if (error) throw error;
      }
      await supabase.from("audit_log").insert({
        user_id: user?.id, action: editing ? "update" : "create",
        entity: "services", entity_id: editing?.id ?? null, payload,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["services"] });
      setOpenForm(false); setEditing(null); setForm(EMPTY_FORM);
      toast.success("تم الحفظ");
    },
    onError: (e: Error) => toast.error("خطأ: " + e.message),
  });

  const approveMut = useMutation({
    mutationFn: async (s: ServiceRow) => {
      const { error } = await supabase
  .from("services")
  .update({
    approved_at: new Date().toISOString(),
    approved_by: user?.id ?? null,
  })
  .eq("id", s.id);
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["services"] }); toast.success("تم الاعتماد"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("services").delete().eq("id", id);
      if (error) throw error;
      await supabase.from("audit_log").insert({ user_id: user?.id, action: "delete", entity: "services", entity_id: id });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["services"] }); toast.success("تم الحذف"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">الخدمات</h1>
          <p className="text-muted-foreground text-sm mt-1">إدارة خدمات المواقع (4 مواقع × 6 أفراد)</p>
        </div>
        {canEdit && (
          <Button onClick={openNew}><Plus className="h-4 w-4 ml-1" /> خدمة جديدة</Button>
        )}
      </div>

      <Card>
        <CardHeader><CardTitle>سجل الخدمات</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="animate-pulse text-muted-foreground">جارٍ التحميل...</div>
          ) : services.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">لا توجد خدمات مسجّلة</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>التاريخ</TableHead>
                    <TableHead>الموقع</TableHead>
                    <TableHead>عدد الأفراد</TableHead>
                    <TableHead>المستلم</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead className="text-left">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {services.map((s) => {
                    const count = [s.member_1, s.member_2, s.member_3, s.member_4, s.member_5, s.member_6].filter(Boolean).length;
                    return (
                      <TableRow key={s.id}>
                        <TableCell>{s.service_date}</TableCell>
                        <TableCell className="font-medium">{s.location}</TableCell>
                        <TableCell>{count} / 6</TableCell>
                        <TableCell>{s.recipient ?? "-"}</TableCell>
                        <TableCell>
                          {s.approved_at
                            ? <span className="text-emerald-600 text-sm">معتمد</span>
                            : <span className="text-amber-600 text-sm">مسودة</span>}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" onClick={() => setViewing(s)}><Eye className="h-4 w-4" /></Button>
                            {canEdit && !s.approved_at && (
                              <Button size="sm" variant="ghost" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button>
                            )}
                            {canApprove && !s.approved_at && (
                              <Button size="sm" variant="ghost" onClick={() => approveMut.mutate(s)}>
                                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                              </Button>
                            )}
                            {canDelete && (
                              <Button size="sm" variant="ghost" onClick={() => { if (confirm("حذف؟")) deleteMut.mutate(s.id); }}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Form Dialog */}
      <Dialog open={openForm} onOpenChange={(v) => { setOpenForm(v); if (!v) { setEditing(null); setForm(EMPTY_FORM); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? "تعديل خدمة" : "خدمة جديدة"}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>التاريخ</Label>
                <Input type="date" value={form.service_date} onChange={(e) => setForm({ ...form, service_date: e.target.value })} />
              </div>
              <div>
                <Label>الموقع *</Label>
                <Select value={form.location} onValueChange={(v) => setForm({ ...form, location: v as ServiceLocation })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SERVICE_LOCATIONS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="mb-2 block">أفراد الخدمة (6 أفراد)</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {form.members.map((m, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-6">{i + 1}.</span>
                    <Select
                      value={m ?? "none"}
                      onValueChange={(v) => {
                        const arr = [...form.members]; arr[i] = v === "none" ? null : v;
                        setForm({ ...form, members: arr });
                      }}
                    >
                      <SelectTrigger className="flex-1"><SelectValue placeholder="اختر فرداً" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">-</SelectItem>
                        {persons.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.military_rank ? `${p.military_rank} / ` : ""}{p.full_name}{p.formation ? ` (${p.formation})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <Label>المستلم</Label>
              <Input value={form.recipient} onChange={(e) => setForm({ ...form, recipient: e.target.value })} placeholder="اسم المستلم" />
            </div>
            <div>
              <Label>ملاحظات</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
              <Save className="h-4 w-4 ml-1" /> حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View/Export Dialog */}
      <Dialog open={!!viewing} onOpenChange={(v) => !v && setViewing(null)}>
        {viewing && <ServiceView service={viewing} personById={personById} />}
      </Dialog>
    </div>
  );
}

function ServiceView({ service, personById }: { service: ServiceRow; personById: (id: string | null) => Person | undefined }) {
  const ref = useRef<HTMLDivElement>(null);
  const members = [service.member_1, service.member_2, service.member_3, service.member_4, service.member_5, service.member_6];
  const filename = `خدمة-${service.location}-${service.service_date}`;

  return (
    <DialogContent className="max-w-3xl">
      <DialogHeader><DialogTitle>عرض الخدمة</DialogTitle></DialogHeader>
      <div className="flex gap-2 flex-wrap mb-2">
        <Button size="sm" variant="outline" onClick={() => ref.current && printElement(ref.current)}>
          <Printer className="h-4 w-4 ml-1" /> طباعة
        </Button>
        <Button size="sm" variant="outline" onClick={() => ref.current && exportElementAsPDF(ref.current, filename)}>
          <FileDown className="h-4 w-4 ml-1" /> PDF
        </Button>
        <Button size="sm" variant="outline" onClick={() => ref.current && exportElementAsImage(ref.current, filename)}>
          <ImageIcon className="h-4 w-4 ml-1" /> صورة
        </Button>
        <Button size="sm" variant="outline" onClick={() => ref.current && shareElementAsImage(ref.current, filename, "خدمة")}>
          <Share2 className="h-4 w-4 ml-1" /> مشاركة
        </Button>
      </div>
      <div ref={ref} className="p-4 bg-white text-black rounded border">
        <div className="text-center border-b pb-2 mb-3">
          <h2 className="text-xl font-bold">نظام إدارة البطارية</h2>
          <div className="text-sm">جدول خدمة موقع</div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm mb-3">
          <div><strong>التاريخ:</strong> {service.service_date}</div>
          <div><strong>الموقع:</strong> {service.location}</div>
        </div>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="border p-2 bg-gray-100 w-12">#</th>
              <th className="border p-2 bg-gray-100">الرقم العسكري</th>
              <th className="border p-2 bg-gray-100">الرتبة</th>
              <th className="border p-2 bg-gray-100">الاسم</th>
              <th className="border p-2 bg-gray-100">التشكيل</th>
            </tr>
          </thead>
          <tbody>
            {members.map((mid, i) => {
              const p = personById(mid);
              return (
                <tr key={i}>
                  <td className="border p-2 text-center">{i + 1}</td>
                  <td className="border p-2">{p?.military_number ?? "-"}</td>
                  <td className="border p-2">{p?.military_rank ?? "-"}</td>
                  <td className="border p-2">{p?.full_name ?? "-"}</td>
                  <td className="border p-2">{p?.formation ?? "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div><strong>المستلم:</strong> {service.recipient ?? "-"}</div>
          <div><strong>الحالة:</strong> {service.approved_at ? "معتمد" : "مسودة"}</div>
        </div>
        {service.notes && <div className="mt-2 text-sm"><strong>ملاحظات:</strong> {service.notes}</div>}
      </div>
    </DialogContent>
  );
}
