import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, FileText, CheckCircle2, Trash2, Printer, FileDown } from "lucide-react";
import { exportElementAsPDF, printElement } from "@/lib/export";
import logoUrl from "@/assets/resistance-logo.jpg";

export const Route = createFileRoute("/_authenticated/leaves")({
  component: LeavesPage,
});

interface Person { id: string; full_name: string; military_rank: string | null; squad: string | null; military_number?: string | null; formation?: string | null; }


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
      const { data } = await supabase.from("persons").select("id, full_name, military_rank, squad, military_number, formation").eq("active", true);
      return (data ?? []) as Person[];
    },
  });


  const { data: leaves = [] } = useQuery({
    queryKey: ["leaves"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leaves")
        .select("*, persons(full_name, military_rank, squad, military_number, formation)")
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data as LeaveRow[];
    },
  });

  const insertMut = useMutation({
    mutationFn: async (v: {
      person_id: string; start_date: string; end_date: string; leave_type: string; reason: string;
    }) => {
      const { error } = await supabase.from("leaves").insert(v);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leaves"] });
      setOpen(false);
      toast.success("تمت إضافة الإجازة");
    },
    onError: (e: Error) => toast.error("خطأ: " + e.message),
  });

  const setStatusMut = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "approved" | "rejected" | "pending" }) => {
      const { data: user } = await supabase.auth.getUser();
      const patch: { status: typeof status; approved_by?: string | null; approved_at?: string | null } = { status };
      if (status === "approved") {
        patch.approved_by = user.user?.id ?? null;
        patch.approved_at = new Date().toISOString();
      }
      const { error } = await supabase.from("leaves").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leaves"] }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("leaves").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leaves"] }); toast.success("تم الحذف"); },
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
              <Button><Plus className="h-4 w-4 ml-1" /> إجازة جديدة</Button>
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
                  <TableHead className="text-left">إجراءات</TableHead>
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
                          <Button size="sm" variant="ghost" onClick={() => { if (confirm("حذف؟")) deleteMut.mutate(l.id); }}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {leaves.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">لا توجد إجازات</TableCell></TableRow>
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
  id: string; person_id: string | null; leave_type: string; start_date: string; end_date: string;
  status: "pending" | "approved" | "rejected";
  reason: string | null;
  persons: { full_name: string; military_rank: string | null; squad: string | null; military_number: string | null; formation: string | null } | null;
};


function statusAr(s: LeaveRow["status"]) {
  return { pending: "قيد الاعتماد", approved: "معتمدة", rejected: "مرفوضة" }[s] ?? s;
}
function statusColor(s: LeaveRow["status"]) {
  return { pending: "text-amber-600", approved: "text-emerald-600", rejected: "text-red-600" }[s] ?? "";
}

function LeaveForm({
  persons, onSubmit, submitting,
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
      <DialogHeader><DialogTitle>إجازة جديدة</DialogTitle></DialogHeader>
      <div className="grid gap-3">
        <div>
          <Label>الفرد *</Label>
          <Select value={person_id} onValueChange={setPersonId}>
            <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
            <SelectContent>
              {persons.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>نوع الإجازة</Label>
          <Select value={leave_type} onValueChange={setType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {LEAVE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
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
          onClick={() => onSubmit({ person_id, start_date, end_date, leave_type, reason })}
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
  const today = new Date();
  const arToday = `${today.getDate()} / ${today.getMonth() + 1} / ${today.getFullYear()}`;
  const permitNo = leave.id.slice(0, 6).toUpperCase();
  const unit = leave.persons?.formation ?? leave.persons?.squad ?? "-";

  return (
    <DialogContent className="max-w-4xl">
      <DialogHeader>
        <DialogTitle className="flex items-center justify-between">
          <span>تصريح إجازة</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => printRef.current && printElement(printRef.current)}>
              <Printer className="h-4 w-4 ml-1" /> طباعة
            </Button>
            <Button size="sm" variant="outline" onClick={() => printRef.current && exportElementAsPDF(printRef.current, `تصريح-إجازة-${permitNo}`)}>
              <FileDown className="h-4 w-4 ml-1" /> PDF
            </Button>
          </div>
        </DialogTitle>
      </DialogHeader>

      <div ref={printRef} dir="rtl" className="leave-permit bg-white text-black mx-auto" style={{ width: "210mm", padding: "12mm 14mm", fontFamily: "'Cairo','Tahoma',sans-serif" }}>
        {/* Header row */}
        <div className="flex items-start justify-between gap-4">
          <div className="text-sm leading-7 min-w-[150px]">
            <div>التاريخ: <strong>{arToday}</strong> م</div>
            <div>الرقم: (<strong>{permitNo}</strong>)</div>
          </div>
          <div className="flex-1 text-center">
            <div className="text-base font-bold mb-1">بسم الله الرحمن الرحيم</div>
            <img src={logoUrl} alt="شعار المقاومة" className="mx-auto" style={{ width: 80, height: 80, objectFit: "contain" }} />
          </div>
          <div className="text-sm leading-7 text-right min-w-[220px]">
            <div className="font-bold">قيادة قوات المقاومة الوطنية</div>
            <div>حراس الجمهورية</div>
            <div>قيادة لواء مدفعية المقاومة الوطنية</div>
            <div className="font-bold">مكتب البطارية الثانية</div>
          </div>
        </div>

        {/* Title */}
        <div className="text-center my-4">
          <h2 className="inline-block px-8 py-1 border-2 border-black text-lg font-bold">تصريح إجازة</h2>
        </div>

        {/* Table */}
        <table className="w-full border-collapse text-sm" style={{ border: "1.5px solid #000" }}>
          <thead>
            <tr className="bg-gray-100">
              <Th w="5%">م</Th>
              <Th w="12%">الرقم العسكري</Th>
              <Th w="10%">الرتبة</Th>
              <Th>الاسم</Th>
              <Th w="10%">الوحدة</Th>
              <Th w="10%">من</Th>
              <Th w="10%">إلى</Th>
              <Th w="8%">المدة</Th>
              <Th w="10%">نوع الإجازة</Th>
              <Th w="12%">ملاحظات</Th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <Td center>1</Td>
              <Td center>{leave.persons?.military_number ?? "-"}</Td>
              <Td center>{leave.persons?.military_rank ?? "-"}</Td>
              <Td>{leave.persons?.full_name ?? "-"}</Td>
              <Td center>{unit}</Td>
              <Td center>{leave.start_date}</Td>
              <Td center>{leave.end_date}</Td>
              <Td center>{days} يوم</Td>
              <Td center>{leave.leave_type}</Td>
              <Td>{leave.reason ?? ""}</Td>
            </tr>
          </tbody>
        </table>

        <div className="mt-3 text-sm leading-8">
          <div>- يُصرَّح للمذكور أعلاه بالعبور إلى (<strong>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</strong>) كونه في إجازة.</div>
          <div className="mt-2"><strong>ملاحظة:</strong> يُعتبر هذا التصريح ملغى في حالة الاستدعاء للإجازات.</div>
        </div>

        {/* Signatures */}
        <div className="grid grid-cols-3 gap-6 mt-16 text-xs text-center">
          <div className="border-t border-black pt-1">بشرية لواء مدفعية المقاومة الوطنية</div>
          <div className="border-t border-black pt-1">أركان حرب لواء مدفعية المقاومة الوطنية</div>
          <div className="border-t border-black pt-1">قائد لواء مدفعية المقاومة الوطنية</div>
        </div>
      </div>

      <style>{`
        @media print {
          @page { size: A4; margin: 10mm; }
          body * { visibility: hidden; }
          .leave-permit, .leave-permit * { visibility: visible; }
          .leave-permit { position: absolute; inset: 0; margin: 0 auto; }
        }
        .leave-permit th, .leave-permit td { border: 1px solid #000; padding: 6px 8px; }
      `}</style>
    </DialogContent>
  );
}

function Th({ children, w }: { children: React.ReactNode; w?: string }) {
  return <th style={{ width: w, textAlign: "center", fontWeight: 700 }}>{children}</th>;
}
function Td({ children, center, colSpan }: { children?: React.ReactNode; center?: boolean; colSpan?: number }) {
  return <td colSpan={colSpan} style={{ textAlign: center ? "center" : "right" }}>{children}</td>;
}

