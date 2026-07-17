import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { toast } from "sonner";
import { FORMATIONS } from "@/lib/constants";

export const Route = createFileRoute("/_authenticated/persons")({
  component: PersonsPage,
});

interface Person {
  id: string;
  military_number: string | null;
  full_name: string;
  military_rank: string | null;
  formation: string | null;
  squad: string | null;
  phone: string | null;
  active: boolean;
  notes: string | null;
}

function PersonsPage() {
  const { can, isAdmin } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterFormation, setFilterFormation] = useState<string>("all");
  const [openDialog, setOpenDialog] = useState(false);
  const [editing, setEditing] = useState<Person | null>(null);
  const canEdit = isAdmin || can("persons", "edit");

  const { data: persons = [], isLoading } = useQuery({
    queryKey: ["persons"],
    queryFn: async () => {
      const { data, error } = await supabase.from("persons").select("*").order("full_name");
      if (error) throw error;
      return data as Person[];
    },
  });

  // Compute current status from latest approved daily report
  const { data: currentStatusMap = {} } = useQuery({
    queryKey: ["persons-current-status"],
    queryFn: async () => {
      const { data: rpt } = await supabase
        .from("daily_reports")
        .select("id")
        .not("approved_at", "is", null)
        .order("report_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!rpt) return {} as Record<string, string>;
      const { data: entries } = await supabase
        .from("report_entries")
        .select("person_id, status")
        .eq("report_id", rpt.id);
      const map: Record<string, string> = {};
      (entries ?? []).forEach((e) => { map[e.person_id] = e.status; });
      return map;
    },
  });

  const STATUS_LABEL_MAP: Record<string, string> = {
    present: "موجود", absent: "غياب", leave: "إجازة", sick: "مريض",
    permit: "إذن", mission: "مأمورية", course: "دورة", other: "أخرى",
  };

  const filtered = persons.filter((p) => {
    if (filterFormation !== "all" && p.formation !== filterFormation) return false;
    if (!search) return true;
    return p.full_name.includes(search)
      || (p.military_number ?? "").includes(search)
      || (p.military_rank ?? "").includes(search);
  });

  const upsertMut = useMutation({
    mutationFn: async (p: Partial<Person>) => {
      const payload = {
        military_number: p.military_number || null,
        full_name: p.full_name!,
        military_rank: p.military_rank || null,
        formation: p.formation || null,
        squad: p.formation || null, // keep squad in sync for legacy queries
        phone: p.phone || null,
        notes: p.notes || null,
        active: p.active ?? true,
      };
      if (p.id) {
        const { error } = await supabase.from("persons").update(payload).eq("id", p.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("persons").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["persons"] });
      qc.invalidateQueries({ queryKey: ["persons-active"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      setOpenDialog(false); setEditing(null);
      toast.success("تم الحفظ");
    },
    onError: (e: Error) => toast.error("خطأ: " + e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("persons").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["persons"] });
      qc.invalidateQueries({ queryKey: ["persons-active"] });
      toast.success("تم الحذف");
    },
    onError: (e: Error) => toast.error("خطأ: " + e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">الأفراد</h1>
          <p className="text-muted-foreground text-sm mt-1">إدارة أفراد البطارية</p>
        </div>
        {canEdit && (
          <Dialog open={openDialog} onOpenChange={(v) => { setOpenDialog(v); if (!v) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button onClick={() => setEditing(null)}>
                <Plus className="h-4 w-4 ml-1" /> إضافة فرد
              </Button>
            </DialogTrigger>
            <PersonForm key={editing?.id ?? "new"} initial={editing} onSubmit={(p) => upsertMut.mutate(p)} submitting={upsertMut.isPending} />
          </Dialog>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 flex-wrap">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input placeholder="بحث بالاسم أو الرقم العسكري أو الرتبة..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
            <Select value={filterFormation} onValueChange={setFilterFormation}>
              <SelectTrigger className="w-40"><SelectValue placeholder="التشكيل" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل التشكيلات</SelectItem>
                {FORMATIONS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="animate-pulse text-muted-foreground">جارٍ التحميل...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">لا توجد نتائج</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الرقم العسكري</TableHead>
                    <TableHead>الاسم</TableHead>
                    <TableHead>الرتبة</TableHead>
                    <TableHead>التشكيل</TableHead>
                    <TableHead>الحالة الحالية</TableHead>
                    {canEdit && <TableHead className="text-left">إجراءات</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((p) => {
                    const status = currentStatusMap[p.id] ?? "present";
                    const label = STATUS_LABEL_MAP[status] ?? status;
                    const color = status === "present"
                      ? "text-emerald-600"
                      : status === "leave" ? "text-blue-600"
                      : status === "sick" ? "text-pink-600"
                      : status === "permit" ? "text-amber-600"
                      : "text-red-600";
                    return (
                    <TableRow key={p.id}>
                      <TableCell>{p.military_number ?? "-"}</TableCell>
                      <TableCell className="font-medium">{p.full_name}</TableCell>
                      <TableCell>{p.military_rank ?? "-"}</TableCell>
                      <TableCell>{p.formation ?? "-"}</TableCell>
                      <TableCell>
                        <span className={color + " text-sm font-medium"}>
                          {label}
                        </span>
                      </TableCell>
                      {canEdit && (
                        <TableCell>
                          <div className="flex gap-2">
                            <Button size="sm" variant="ghost" onClick={() => { setEditing(p); setOpenDialog(true); }}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => { if (confirm("حذف؟")) deleteMut.mutate(p.id); }}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PersonForm({ initial, onSubmit, submitting }: {
  initial: Person | null;
  onSubmit: (p: Partial<Person>) => void;
  submitting: boolean;
}) {
  const [military_number, setMilNum] = useState(initial?.military_number ?? "");
  const [full_name, setFullName] = useState(initial?.full_name ?? "");
  const [military_rank, setRank] = useState(initial?.military_rank ?? "");
  const [formation, setFormation] = useState(initial?.formation ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [active, setActive] = useState(initial?.active ?? true);
  const [notes, setNotes] = useState(initial?.notes ?? "");

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>{initial ? "تعديل فرد" : "إضافة فرد"}</DialogTitle></DialogHeader>
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>الرقم العسكري *</Label>
            <Input value={military_number} onChange={(e) => setMilNum(e.target.value)} dir="ltr" className="text-right" />
          </div>
          <div>
            <Label>التشكيل *</Label>
            <Select value={formation || "none"} onValueChange={(v) => setFormation(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="اختر التشكيل" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">-</SelectItem>
                {FORMATIONS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label>الاسم الكامل *</Label>
          <Input value={full_name} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>الرتبة</Label>
            <Input value={military_rank} onChange={(e) => setRank(e.target.value)} placeholder="مثل: عريف" />
          </div>
          <div>
            <Label>الهاتف</Label>
            <Input value={phone} dir="ltr" onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>
        <div>
          <Label>الحالة</Label>
          <Select value={active ? "yes" : "no"} onValueChange={(v) => setActive(v === "yes")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="yes">نشط</SelectItem>
              <SelectItem value="no">غير نشط</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>ملاحظات</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>
      </div>
      <DialogFooter>
        <Button
          onClick={() =>
            onSubmit({
              id: initial?.id,
              military_number: military_number || null,
              full_name,
              military_rank: military_rank || null,
              formation: formation || null,
              phone: phone || null,
              notes: notes || null,
              active,
            })
          }
          disabled={!full_name || !military_number || !formation || submitting}
        >
          {submitting ? "جارٍ الحفظ..." : "حفظ"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
