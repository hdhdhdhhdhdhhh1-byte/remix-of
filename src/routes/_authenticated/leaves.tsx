import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, FileText, CheckCircle2, Trash2, Printer } from "lucide-react";
import { printElement } from "@/lib/export";

export const Route = createFileRoute("/_authenticated/leaves")({
  component: LeavesPage,
});

interface Person {
  id: string;
  full_name: string;
  military_rank: string | null;
  squad: string | null;
  military_number?: string | null;
  formation?: string | null;
}

const LEAVE_TYPES = ["اعتيادية", "عارضة", "مرضية", "بدون راتب", "طارئة"];

function LeavesPage() {
  const { can, isAdmin } = useAuth();
  const canEdit = isAdmin || can("leaves", "edit");
  const canApprove = isAdmin || can("leaves", "approve");
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [previewLeave, setPreviewLeave] = useState<LeaveRow | null>(null);

  const { data: persons = [] } = useQuery({
    queryKey: ["persons-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("persons")
        .select("id,full_name,military_rank,squad,military_number,formation")
        .eq("active", true);
      if (error) throw error;
      return (data ?? []) as Person[];
    },
  });

  const { data: leaves = [] } = useQuery({
    queryKey: ["leaves"],
    queryFn: async () => {
      const { data: leaveData, error } = await supabase.from("leaves").select("*").order("start_date", { ascending: false });
      if (error) throw error;

      // FIX: كان data -> الصح leaveData
      const personIds = (leaveData ?? [])
        .map((x: { person_id: string | null }) => x.person_id)
        .filter((id): id is string => !!id);

      let personsMap: Record<string, Person> = {};

      if (personIds.length) {
        const { data: personsData } = await supabase
          .from("persons")
          .select("id,full_name,military_rank,squad,military_number,formation")
          .in("id", personIds);

        (personsData ?? []).forEach((p) => {
          personsMap[p.id] = p as Person;
        });
      }

      return (leaveData ?? []).map((item) => ({
        ...item,
        persons: item.person_id ? personsMap[item.person_id] ?? null : null,
      })) as LeaveRow[];
    },
  });

  const insertMut = useMutation({
    mutationFn: async (v: {
      person_id: string;
      start_date: string;
      end_date: string;
      leave_type: string;
      reason: string;
    }) => {
      const { error } = await supabase.from("leaves").insert({
        person_id: v.person_id,
        start_date: v.start_date,
        end_date: v.end_date,
        leave_type: v.leave_type,
        reason: v.reason || null,
        status: "pending",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leaves"] });
      setOpen(false);
      toast.success("تمت إضافة الإجازة");
    },
    onError: (e: Error) => {
      toast.error("خطأ: " + e.message);
    },
  });

  const setStatusMut = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "approved" | "rejected" | "pending" }) => {
      const { data: userData } = await supabase.auth.getUser();

      // FIX: أضفنا approved_at للنوع عشان TS ما يعترض، حتى لو العمود مش موجود في الداتا بيس
      const updateData: {
        status: "approved" | "rejected" | "pending";
        approved_by?: string | null;
        approved_at?: string | null;
      } = {
        status,
      };

      if (status === "approved") {
        updateData.approved_by = userData.user?.id ?? null;
        updateData.approved_at = new Date().toISOString();
      }

      const { error } = await supabase.from("leaves").update(updateData).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leaves"] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("leaves").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leaves"] });
      toast.success("تم الحذف");
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">الإجازات</h1>
          <p className="text-muted-foreground text-sm mt-1">إدارة إجازات الأفراد</p>
        </div>

        {canEdit && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 ml-1" />
                إجازة جديدة
              </Button>
            </DialogTrigger>
            <LeaveForm persons={persons} onSubmit={(v) => insertMut.mutate(v)} submitting={insertMut.isPending} />
          </Dialog>
        )}
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الفرد</TableHead>
                  <TableHead>النوع</TableHead>
                  <TableHead>من</TableHead>
                  <TableHead>إلى</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leaves.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>{l.persons?.full_name ?? "-"}</TableCell>
                    <TableCell>{l.leave_type}</TableCell>
                    <TableCell>{l.start_date}</TableCell>
                    <TableCell>{l.end_date}</TableCell>
                    <TableCell>
                      <span className={statusColor(l.status)}>{statusAr(l.status)}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setPreviewLeave(l)}>
                          <FileText className="h-4 w-4" />
                        </Button>
                        {canApprove && l.status === "pending" && (
                          <Button size="sm" variant="ghost" onClick={() => setStatusMut.mutate({ id: l.id, status: "approved" })}>
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          </Button>
                        )}
                        {canEdit && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              if (confirm("حذف؟")) deleteMut.mutate(l.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {leaves.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      لا توجد إجازات
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      <Dialog open={!!previewLeave} onOpenChange={(v) => !v && setPreviewLeave(null)}>
        {previewLeave && <LeavePreview leave={previewLeave} />}
      </Dialog>
    </div>
  );
}

type LeaveRow = {
  id: string;
  person_id: string | null;
  leave_type: string;
  start_date: string;
  end_date: string;
  status: "pending" | "approved" | "rejected";
  reason: string | null;
  persons: {
    full_name: string;
    military_rank: string | null;
    squad: string | null;
    military_number: string | null;
    formation: string | null;
  } | null;
};

function statusAr(s: LeaveRow["status"]) {
  return { pending: "قيد الاعتماد", approved: "معتمدة", rejected: "مرفوضة" }[s] ?? s;
}

function statusColor(s: LeaveRow["status"]) {
  return { pending: "text-amber-600", approved: "text-emerald-600", rejected: "text-red-600" }[s] ?? "";
}

function LeaveForm({
  persons,
  onSubmit,
  submitting,
}: {
  persons: Person[];
  onSubmit: (v: { person_id: string; start_date: string; end_date: string; leave_type: string; reason: string }) => void;
  submitting: boolean;
}) {
  const [person_id, setPersonId] = useState("");
  const [start_date, setStart] = useState(new Date().toISOString().slice(0, 10));
  const [end_date, setEnd] = useState(new Date().toISOString().slice(0, 10));
  const [leave_type, setType] = useState("اعتيادية");
  const [reason, setReason] = useState("");

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>إجازة جديدة</DialogTitle>
      </DialogHeader>
      <div className="grid gap-3">
        <div>
          <Label>الفرد *</Label>
          <Select value={person_id} onValueChange={setPersonId}>
            <SelectTrigger>
              <SelectValue placeholder="اختر" />
            </SelectTrigger>
            <SelectContent>
              {persons.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>نوع الإجازة</Label>
          <Select value={leave_type} onValueChange={setType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LEAVE_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>من</Label>
            <Input type="date" value={start_date} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <Label>إلى</Label>
            <Input type="date" value={end_date} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        <div>
          <Label>ملاحظات</Label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
      </div>
      <DialogFooter>
        <Button
          disabled={!person_id || submitting}
          onClick={() => {
            onSubmit({ person_id, start_date, end_date, leave_type, reason });
          }}
        >
          حفظ
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function LeavePreview({ leave }: { leave: LeaveRow }) {
  const printRef = useRef<HTMLDivElement>(null);
  const days = Math.ceil((new Date(leave.end_date).getTime() - new Date(leave.start_date).getTime()) / 86400000) + 1;

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>تصريح إجازة</DialogTitle>
      </DialogHeader>
      <div ref={printRef}>
        <h2>{leave.persons?.full_name ?? "-"}</h2>
        <p>النوع: {leave.leave_type}</p>
        <p>
          من {leave.start_date} إلى {leave.end_date}
        </p>
        <p>المدة: {days} يوم</p>
        <p>ملاحظات: {leave.reason ?? "-"}</p>
      </div>
      <Button
        onClick={() => {
          if (printRef.current) printElement(printRef.current);
        }}
      >
        <Printer className="h-4 w-4 ml-1" />
        طباعة
      </Button>
    </DialogContent>
  );
}

