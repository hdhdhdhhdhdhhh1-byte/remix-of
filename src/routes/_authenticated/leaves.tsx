import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
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
import { Plus, FileText, CheckCircle2, Trash2, Printer, FileDown, Image as ImageIcon } from "lucide-react";
import { printElement, exportElementAsPDF } from "@/lib/export";
import logoUrl from "@/assets/resistance-logo.jpg";

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

const LEAVE_TYPES = ["استحقاقية", "اضطرارية", "مرضية", "بدون راتب", "طارئة"];

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
    mutationFn: async (v: { person_id: string; start_date: string; end_date: string; leave_type: string; reason: string }) => {
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
    onError: (e: Error) => toast.error("خطأ: " + e.message),
  });

  const setStatusMut = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "approved" | "rejected" | "pending" }) => {
      const { data: userData } = await supabase.auth.getUser();
      const updateData: any = { status };
      if (status === "approved") {
        updateData.approved_by = userData.user?.id ?? null;
        updateData.approved_at = new Date().toISOString();
      }
      const { error } = await supabase.from("leaves").update(updateData).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leaves"] }),
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
              <TableHeader><TableRow><TableHead>الفرد</TableHead><TableHead>النوع</TableHead><TableHead>من</TableHead><TableHead>إلى</TableHead><TableHead>الحالة</TableHead><TableHead>إجراءات</TableHead></TableRow></TableHeader>
              <TableBody>
                {leaves.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>{l.persons?.full_name ?? "-"}</TableCell>
                    <TableCell>{l.leave_type}</TableCell>
                    <TableCell>{l.start_date}</TableCell>
                    <TableCell>{l.end_date}</TableCell>
                    <TableCell><span className={statusColor(l.status)}>{statusAr(l.status)}</span></TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setPreviewLeave(l)}><FileText className="h-4 w-4" /></Button>
                        {canApprove && l.status === "pending" && (
                          <Button size="sm" variant="ghost" onClick={() => setStatusMut.mutate({ id: l.id, status: "approved" })}><CheckCircle2 className="h-4 w-4 text-emerald-600" /></Button>
                        )}
                        {canEdit && (<Button size="sm" variant="ghost" onClick={() => { if (confirm("حذف؟")) deleteMut.mutate(l.id); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>)}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {leaves.length === 0 && (<TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">لا توجد إجازات</TableCell></TableRow>)}
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
  persons: { full_name: string; military_rank: string | null; squad: string | null; military_number: string | null; formation: string | null } | null;
};

function statusAr(s: LeaveRow["status"]) { return { pending: "قيد الاعتماد", approved: "معتمدة", rejected: "مرفوضة" }[s] ?? s; }
function statusColor(s: LeaveRow["status"]) { return { pending: "text-amber-600", approved: "text-emerald-600", rejected: "text-red-600" }[s] ?? ""; }

function LeaveForm({ persons, onSubmit, submitting }: { persons: Person[]; onSubmit: (v: { person_id: string; start_date: string; end_date: string; leave_type: string; reason: string }) => void; submitting: boolean }) {
  const [person_id, setPersonId] = useState("");
  const [start_date, setStart] = useState(new Date().toISOString().slice(0, 10));
  const [end_date, setEnd] = useState(new Date().toISOString().slice(0, 10));
  const [leave_type, setType] = useState("استحقاقية");
  const [reason, setReason] = useState("");
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>إجازة جديدة</DialogTitle></DialogHeader>
      <div className="grid gap-3">
        <div><Label>الفرد *</Label><Select value={person_id} onValueChange={setPersonId}><SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger><SelectContent>{persons.map((p) => (<SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>))}</SelectContent></Select></div>
        <div><Label>نوع الإجازة</Label><Select value={leave_type} onValueChange={setType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{LEAVE_TYPES.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}</SelectContent></Select></div>
        <div className="grid grid-cols-2 gap-3"><div><Label>من</Label><Input type="date" value={start_date} onChange={(e) => setStart(e.target.value)} /></div><div><Label>إلى</Label><Input type="date" value={end_date} onChange={(e) => setEnd(e.target.value)} /></div></div>
        <div><Label>ملاحظات / الوجهة</Label><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثال: تعز - للعلاج" /></div>
      </div>
      <DialogFooter><Button disabled={!person_id || submitting} onClick={() => onSubmit({ person_id, start_date, end_date, leave_type, reason })}>حفظ</Button></DialogFooter>
    </DialogContent>
  );
}

function LeavePreview({ leave }: { leave: LeaveRow }) {
  const printRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [savingImage, setSavingImage] = useState(false);
  const days = Math.ceil((new Date(leave.end_date).getTime() - new Date(leave.start_date).getTime()) / 86400000) + 1;

  useEffect(() => {
    const updateScale = () => {
      if (!wrapperRef.current) return;
      const w = wrapperRef.current.clientWidth - 16;
      const reportW = 794;
      setScale(w < reportW ? w / reportW : 1);
    };
    updateScale();
    const timer = setTimeout(updateScale, 100);
    window.addEventListener("resize", updateScale);
    return () => { window.removeEventListener("resize", updateScale); clearTimeout(timer); };
  }, []);

  const today = new Date();
  const arDate = `${today.getFullYear()} / ${String(today.getMonth() + 1).padStart(2, "0")} / ${String(today.getDate()).padStart(2, "0")} م`;
  const startDisplay = leave.start_date.split("-").reverse().join("/");
  const endDisplay = leave.end_date.split("-").reverse().join("/");

  const saveAsImage = async () => {
    if (!printRef.current) return;
    setSavingImage(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(printRef.current, {
        scale: 3,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
      });
      const link = document.createElement("a");
      link.download = `تصريح-اجازة-${leave.persons?.full_name}-${leave.start_date}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      toast.success("تم حفظ الصورة");
    } catch (e) {
      console.error(e);
      toast.error("تعذر حفظ الصورة - تأكد من تثبيت html2canvas");
    } finally {
      setSavingImage(false);
    }
  };

  return (
    <DialogContent className="max-w-[98vw] md:max-w-[880px] p-0 md:p-0 bg-transparent border-0 shadow-none gap-0">
      <DialogHeader className="sr-only"><DialogTitle>تصريح إجازة</DialogTitle></DialogHeader>

      {/* أزرار التحكم */}
      <div className="flex gap-2 justify-center bg-white p-3 rounded-t-xl border print:hidden">
        <Button variant="outline" size="sm" onClick={() => printRef.current && printElement(printRef.current)}>
          <Printer className="h-4 w-4 ml-1" /> طباعة
        </Button>
        <Button variant="outline" size="sm" onClick={() => printRef.current && exportElementAsPDF(printRef.current, `تصريح-اجازة-${leave.persons?.full_name}`)}>
          <FileDown className="h-4 w-4 ml-1" /> PDF
        </Button>
        <Button variant="default" size="sm" onClick={saveAsImage} disabled={savingImage} className="bg-emerald-700 hover:bg-emerald-800">
          <ImageIcon className="h-4 w-4 ml-1" /> {savingImage ? "جاري الحفظ..." : "حفظ كصورة"}
        </Button>
      </div>

      {/* الحاوية المتجاوبة - نفس فكرة التقرير */}
      <div ref={wrapperRef} className="w-full flex justify-center bg-gray-100 rounded-b-xl p-2 md:p-4 overflow-hidden">
        <div
          style={{
            width: "794px",
            height: scale < 1 ? `${560 * scale}px` : "auto",
            transform: `scale(${scale})`,
            transformOrigin: "top center",
            transition: "transform 0.2s ease",
            flexShrink: 0,
          }}
        >
          <div
            ref={printRef}
            dir="rtl"
            className="vacation-official bg-white text-black relative shadow-lg"
            style={{
              width: "210mm",
              minHeight: "148mm",
              padding: "9mm 11mm",
              fontFamily: "'Cairo', 'Tahoma', sans-serif",
              border: "2.8px solid #000",
              borderRadius: "20px",
              overflow: "hidden",
            }}
          >
            <img
              src={logoUrl}
              alt=""
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                width: "300px",
                height: "300px",
                objectFit: "contain",
                opacity: 0.07,
                pointerEvents: "none",
                zIndex: 0,
              }}
            />

            <div className="relative z-10 flex items-start justify-between gap-2">
              <div className="text-[12.5px] leading-[1.7] text-right min-w-[195px] font-medium">
                <div className="font-bold">قيادة قوات المقاومة الوطنية</div>
                <div>حراس الجمهورية</div>
                <div>قيادة لواء مدفعية المقاومة الوطنية</div>
                <div className="font-bold">مكتب البشرية</div>
              </div>
              <div className="flex-1 text-center">
                <div className="text-[15px] font-bold mb-1" style={{ fontFamily: "Traditional Arabic, serif" }}>بسم الله الرحمن الرحيم</div>
                <img src={logoUrl} alt="شعار" className="mx-auto" style={{ width: "88px", height: "88px", objectFit: "contain" }} />
              </div>
              <div className="text-[12.5px] leading-7 min-w-[145px] text-right">
                <div>التاريخ: {arDate}</div>
                <div>الرقم : ( &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; )</div>
              </div>
            </div>

            <div className="relative z-10 text-center mt-3 mb-3">
              <h2 className="text-[20px] font-extrabold tracking-wide">تصريح إجازة</h2>
            </div>

            <div className="relative z-10">
              <table className="w-full border-collapse text-[12px]" style={{ border: "1.6px solid #000" }}>
                <thead>
                  <tr className="bg-[#f2f2f2]">
                    <th style={{ border: "1px solid #000", padding: "6px 3px", width: "24px" }}>م</th>
                    <th style={{ border: "1px solid #000", padding: "6px 3px", width: "62px" }}>م موحد</th>
                    <th style={{ border: "1px solid #000", padding: "6px 3px", width: "62px" }}>الرتبة</th>
                    <th style={{ border: "1px solid #000", padding: "6px 3px" }}>الاسم</th>
                    <th style={{ border: "1px solid #000", padding: "6px 3px", width: "64px" }}>الوحدة</th>
                    <th style={{ border: "1px solid #000", padding: "6px 3px", width: "50px" }}>من</th>
                    <th style={{ border: "1px solid #000", padding: "6px 3px", width: "50px" }}>الى</th>
                    <th style={{ border: "1px solid #000", padding: "6px 3px", width: "50px" }}>المدة</th>
                    <th style={{ border: "1px solid #000", padding: "6px 3px", width: "56px" }}>نوعها</th>
                    <th style={{ border: "1px solid #000", padding: "6px 3px", width: "60px" }}>ملاحظة</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ border: "1px solid #000", padding: "8px 3px", textAlign: "center" }}>1</td>
                    <td style={{ border: "1px solid #000", padding: "8px 3px", textAlign: "center", fontSize: "11px" }}>{leave.persons?.military_number ?? "-"}</td>
                    <td style={{ border: "1px solid #000", padding: "8px 3px", textAlign: "center", fontSize: "11px" }}>{leave.persons?.military_rank ?? "-"}</td>
                    <td style={{ border: "1px solid #000", padding: "8px 3px", textAlign: "center", fontWeight: 800, fontSize: "12.5px" }}>{leave.persons?.full_name ?? "-"}</td>
                    <td style={{ border: "1px solid #000", padding: "8px 3px", textAlign: "center" }}>{leave.persons?.formation ?? leave.persons?.squad ?? "-"}</td>
                    <td style={{ border: "1px solid #000", padding: "8px 3px", textAlign: "center", fontSize: "11px" }}>{startDisplay}</td>
                    <td style={{ border: "1px solid #000", padding: "8px 3px", textAlign: "center", fontSize: "11px" }}>{endDisplay}</td>
                    <td style={{ border: "1px solid #000", padding: "8px 3px", textAlign: "center" }}>{days} يوم</td>
                    <td style={{ border: "1px solid #000", padding: "8px 3px", textAlign: "center", fontSize: "11px" }}>{leave.leave_type}</td>
                    <td style={{ border: "1px solid #000", padding: "8px 3px", textAlign: "center", fontSize: "10px" }}>{leave.reason ? leave.reason.slice(0, 20) : ""}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="relative z-10 mt-4 text-[13.5px] leading-8 font-medium">
              <div>- يصرح للمذكور أعلاه بالعبور الى <span className="font-bold inline-block border-b border-dotted border-black min-w-[150px] text-center px-2">________</span> كونه إجازة .</div>
              <div className="mt-2">ملاحظة:</div>
              <div className="mr-2 text-[12.5px]">يعتبر هذا التصريح ملغي في حالة الاستدعاء للاجازات .</div>
            </div>

            <div className="relative z-10 border-t border-dashed border-black mt-5 mb-6"></div>

            <div className="relative z-10 grid grid-cols-3 gap-2 text-[11.5px] text-center mt-1">
              <div><div className="h-[38px]"></div><div className="font-bold leading-4">بشرية لواء مدفعية الوطنية</div></div>
              <div><div className="h-[38px]"></div><div className="font-bold leading-4">أركان حرب لواء مدفعية الوطنية</div></div>
              <div><div className="h-[38px]"></div><div className="font-bold leading-4">قائد لواء مدفعية الوطنية</div></div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 6mm; }
          body * { visibility: hidden !important; }
          .vacation-official, .vacation-official * { visibility: visible !important; }
          .vacation-official { 
            position: fixed !important; 
            left: 50% !important;
            top: 0 !important;
            transform: translateX(-50%) !important;
            margin: 0 !important;
            box-shadow: none !important;
            border: 2.8px solid #000 !important;
            border-radius: 20px !important;
            width: 210mm !important;
          }
        }
      `}</style>
    </DialogContent>
  );
}
