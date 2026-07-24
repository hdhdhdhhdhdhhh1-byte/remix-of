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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, FileText, CheckCircle2, Trash2, Printer, FileDown, Image as ImageIcon, PenLine, Trash, X, Check } from "lucide-react";
import { printElement, exportElementAsPDF } from "@/lib/export";
import logoUrl from "@/assets/resistance-logo.jpg";

export const Route = createFileRoute("/_authenticated/leaves")({
  component: LeavesPage,
});

interface Person { id: string; full_name: string; military_rank: string | null; squad: string | null; military_number?: string | null; formation?: string | null; }
const LEAVE_TYPES = ["استحقاقية", "اضطرارية", "مرضية", "بدون راتب", "طارئة"];

function LeavesPage() {
  const { can, isAdmin } = useAuth();
  const canEdit = isAdmin || can("leaves", "edit");
  const canApprove = isAdmin || can("leaves", "approve");
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [previewLeave, setPreviewLeave] = useState<LeaveRow | null>(null);
  const { data: persons = [] } = useQuery({ queryKey: ["persons-active"], queryFn: async () => { const { data, error } = await supabase.from("persons").select("id,full_name,military_rank,squad,military_number,formation").eq("active", true); if (error) throw error; return (data ?? []) as Person[]; } });
  const { data: leaves = [] } = useQuery({ queryKey: ["leaves"], queryFn: async () => { const { data: leaveData, error } = await supabase.from("leaves").select("*").order("start_date", { ascending: false }); if (error) throw error; const personIds = (leaveData ?? []).map((x: { person_id: string | null }) => x.person_id).filter((id): id is string => !!id); let personsMap: Record<string, Person> = {}; if (personIds.length) { const { data: personsData } = await supabase.from("persons").select("id,full_name,military_rank,squad,military_number,formation").in("id", personIds); (personsData ?? []).forEach((p) => { personsMap[p.id] = p as Person; }); } return (leaveData ?? []).map((item) => ({ ...item, persons: item.person_id ? personsMap[item.person_id] ?? null : null })) as LeaveRow[]; } });
  const insertMut = useMutation({ mutationFn: async (v: { person_id: string; start_date: string; end_date: string; leave_type: string; reason: string }) => { const { error } = await supabase.from("leaves").insert({ person_id: v.person_id, start_date: v.start_date, end_date: v.end_date, leave_type: v.leave_type, reason: v.reason || null, status: "pending" }); if (error) throw error; }, onSuccess: () => { qc.invalidateQueries({ queryKey: ["leaves"] }); setOpen(false); toast.success("تمت إضافة الإجازة"); }, onError: (e: Error) => toast.error("خطأ: " + e.message) });
  const setStatusMut = useMutation({ mutationFn: async ({ id, status }: { id: string; status: "approved" | "rejected" | "pending" }) => { const { data: userData } = await supabase.auth.getUser(); const updateData: any = { status }; if (status === "approved") { updateData.approved_by = userData.user?.id ?? null; updateData.approved_at = new Date().toISOString(); } const { error } = await supabase.from("leaves").update(updateData).eq("id", id); if (error) throw error; }, onSuccess: () => qc.invalidateQueries({ queryKey: ["leaves"] }) });
  const deleteMut = useMutation({ mutationFn: async (id: string) => { const { error } = await supabase.from("leaves").delete().eq("id", id); if (error) throw error; }, onSuccess: () => { qc.invalidateQueries({ queryKey: ["leaves"] }); toast.success("تم الحذف"); } });
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4"><div><h1 className="text-2xl md:text-3xl font-bold">الإجازات</h1><p className="text-muted-foreground text-sm mt-1">إدارة إجازات الأفراد</p></div>{canEdit && (<Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button><Plus className="h-4 w-4 ml-1" /> إجازة جديدة</Button></DialogTrigger><LeaveForm persons={persons} onSubmit={(v) => insertMut.mutate(v)} submitting={insertMut.isPending} /></Dialog>)}</div>
      <Card><CardContent className="pt-6"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>الفرد</TableHead><TableHead>النوع</TableHead><TableHead>من</TableHead><TableHead>إلى</TableHead><TableHead>الحالة</TableHead><TableHead>إجراءات</TableHead></TableRow></TableHeader><TableBody>{leaves.map((l) => (<TableRow key={l.id}><TableCell>{l.persons?.full_name ?? "-"}</TableCell><TableCell>{l.leave_type}</TableCell><TableCell>{l.start_date}</TableCell><TableCell>{l.end_date}</TableCell><TableCell><span className={statusColor(l.status)}>{statusAr(l.status)}</span></TableCell><TableCell><div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => setPreviewLeave(l)}><FileText className="h-4 w-4" /></Button>{canApprove && l.status === "pending" && (<Button size="sm" variant="ghost" onClick={() => setStatusMut.mutate({ id: l.id, status: "approved" })}><CheckCircle2 className="h-4 w-4 text-emerald-600" /></Button>)}{canEdit && (<Button size="sm" variant="ghost" onClick={() => { if (confirm("حذف؟")) deleteMut.mutate(l.id); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>)}</div></TableCell></TableRow>))}{leaves.length === 0 && (<TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">لا توجد إجازات</TableCell></TableRow>)}</TableBody></Table></div></CardContent></Card>
      <Dialog open={!!previewLeave} onOpenChange={(v) => !v && setPreviewLeave(null)}>{previewLeave && <LeavePreview leave={previewLeave} />}</Dialog>
    </div>
  );
}

type LeaveRow = { id: string; person_id: string | null; leave_type: string; start_date: string; end_date: string; status: "pending" | "approved" | "rejected"; reason: string | null; persons: { full_name: string; military_rank: string | null; squad: string | null; military_number: string | null; formation: string | null } | null; };
function statusAr(s: LeaveRow["status"]) { return { pending: "قيد الاعتماد", approved: "معتمدة", rejected: "مرفوضة" }[s] ?? s; }
function statusColor(s: LeaveRow["status"]) { return { pending: "text-amber-600", approved: "text-emerald-600", rejected: "text-red-600" }[s] ?? ""; }
function LeaveForm({ persons, onSubmit, submitting }: { persons: Person[]; onSubmit: (v: { person_id: string; start_date: string; end_date: string; leave_type: string; reason: string }) => void; submitting: boolean }) {
  const [person_id, setPersonId] = useState(""); const [start_date, setStart] = useState(new Date().toISOString().slice(0, 10)); const [end_date, setEnd] = useState(new Date().toISOString().slice(0, 10)); const [leave_type, setType] = useState("استحقاقية"); const [reason, setReason] = useState("");
  return (<DialogContent><DialogHeader><DialogTitle>إجازة جديدة</DialogTitle></DialogHeader><div className="grid gap-3"><div><Label>الفرد *</Label><Select value={person_id} onValueChange={setPersonId}><SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger><SelectContent>{persons.map((p) => (<SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>))}</SelectContent></Select></div><div><Label>نوع الإجازة</Label><Select value={leave_type} onValueChange={setType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{LEAVE_TYPES.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}</SelectContent></Select></div><div className="grid grid-cols-2 gap-3"><div><Label>من</Label><Input type="date" value={start_date} onChange={(e) => setStart(e.target.value)} /></div><div><Label>إلى</Label><Input type="date" value={end_date} onChange={(e) => setEnd(e.target.value)} /></div></div><div><Label>ملاحظات / الوجهة</Label><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثال: تعز - للعلاج" /></div></div><DialogFooter><Button disabled={!person_id || submitting} onClick={() => onSubmit({ person_id, start_date, end_date, leave_type, reason })}>حفظ</Button></DialogFooter></DialogContent>);
}

// ===== مكون لوحة التوقيع =====
function SignaturePadModal({ open, onOpenChange, onSave, initialTitle }: { open: boolean; onOpenChange: (v: boolean) => void; onSave: (dataUrl: string) => void; initialTitle: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // خلفية بيضاء
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, [open]);

  const getPos = (e: any) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const startDraw = (e: any) => {
    e.preventDefault();
    setIsDrawing(true);
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const moveDraw = (e: any) => {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const endDraw = () => {
    setIsDrawing(false);
  };

  const clear = () => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  const save = () => {
    const canvas = canvasRef.current!;
    // نتحقق هل في توقيع ولا فاضي
    const blank = document.createElement("canvas");
    blank.width = canvas.width;
    blank.height = canvas.height;
    const bCtx = blank.getContext("2d")!;
    bCtx.fillStyle = "#ffffff";
    bCtx.fillRect(0, 0, blank.width, blank.height);
    if (canvas.toDataURL() === blank.toDataURL()) {
      toast.error("وقع أولاً ثم احفظ");
      return;
    }
    onSave(canvas.toDataURL("image/png"));
    onOpenChange(false);
    toast.success("تم حفظ التوقيع ✅");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] md:max-w-[500px] p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-2"><DialogTitle className="flex items-center gap-2"><PenLine className="h-5 w-5" /> توقيع: {initialTitle}</DialogTitle></DialogHeader>
        <div className="px-4">
          <div className="border-2 border-dashed border-gray-300 rounded-xl bg-white overflow-hidden touch-none">
            <canvas
              ref={canvasRef}
              width={600}
              height={280}
              className="w-full h-[220px] md:h-[280px] touch-none cursor-crosshair"
              onMouseDown={startDraw}
              onMouseMove={moveDraw}
              onMouseUp={endDraw}
              onMouseLeave={endDraw}
              onTouchStart={startDraw}
              onTouchMove={moveDraw}
              onTouchEnd={endDraw}
            />
          </div>
          <p className="text-[11px] text-gray-500 mt-2 text-center">وقع بإصبعك أو الماوس داخل المربع الأبيض</p>
        </div>
        <DialogFooter className="p-3 flex flex-row gap-2 justify-between bg-gray-50 mt-3">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={clear}><Trash className="h-4 w-4 ml-1" /> مسح</Button>
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}><X className="h-4 w-4 ml-1" /> إلغاء</Button>
          </div>
          <Button size="sm" onClick={save} className="bg-emerald-700 hover:bg-emerald-800"><Check className="h-4 w-4 ml-1" /> حفظ التوقيع</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LeavePreview({ leave }: { leave: LeaveRow }) {
  const printRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [savingImage, setSavingImage] = useState(false);
  
  // حالات التوقيع الثلاثة
  const [sigs, setSigs] = useState<{ personnel: string | null; chief: string | null; commander: string | null }>({ personnel: null, chief: null, commander: null });
  const [activeSig, setActiveSig] = useState<null | "personnel" | "chief" | "commander">(null);

  const days = Math.ceil((new Date(leave.end_date).getTime() - new Date(leave.start_date).getTime()) / 86400000) + 1;

  useEffect(() => {
    const updateScale = () => {
      if (!wrapperRef.current) return;
      const w = wrapperRef.current.clientWidth - 16;
      setScale(w < 794 ? w / 794 : 1);
    };
    updateScale();
    setTimeout(updateScale, 150);
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, []);

  const today = new Date();
  const arDate = `${today.getFullYear()} / ${String(today.getMonth() + 1).padStart(2, "0")} / ${String(today.getDate()).padStart(2, "0")} م`;
  const startDisplay = leave.start_date.split("-").reverse().join("/");
  const endDisplay = leave.end_date.split("-").reverse().join("/");

  const saveAsImage = async () => {
    if (!printRef.current) return;
    setSavingImage(true);
    try {
      const loadHtmlToImage = (): Promise<any> => {
        return new Promise((resolve, reject) => {
          // @ts-ignore
          if (window.htmlToImage) return resolve(window.htmlToImage);
          const script = document.createElement("script");
          script.src = "https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.js";
          script.onload = () => {
            // @ts-ignore
            resolve(window.htmlToImage);
          };
          script.onerror = () => reject(new Error("فشل تحميل مكتبة الصور"));
          document.head.appendChild(script);
        });
      };
      const htmlToImage = await loadHtmlToImage();
      const dataUrl = await htmlToImage.toPng(printRef.current, { quality: 1, pixelRatio: 3, backgroundColor: "#ffffff", cacheBust: true });
      const link = document.createElement("a");
      link.download = `تصريح-اجازة-${leave.persons?.full_name}-${leave.start_date}.png`;
      link.href = dataUrl;
      link.click();
      toast.success("تم حفظ الصورة مع التواقيع ✅");
    } catch (e: any) {
      console.error(e);
      toast.error("تعذر الحفظ، سيتم فتح الطباعة");
      if (printRef.current) printElement(printRef.current);
    } finally {
      setSavingImage(false);
    }
  };

  const getSigTitle = () => {
    if (activeSig === "personnel") return "بشرية لواء مدفعية الوطنية";
    if (activeSig === "chief") return "أركان حرب لواء مدفعية الوطنية";
    if (activeSig === "commander") return "قائد لواء مدفعية الوطنية";
    return "";
  };

  return (
    <>
      <DialogContent className="max-w-[98vw] md:max-w-[880px] p-0 bg-transparent border-0 shadow-none gap-0">
        <DialogHeader className="sr-only"><DialogTitle>تصريح إجازة</DialogTitle></DialogHeader>
        <div className="flex gap-2 justify-center bg-white p-3 rounded-t-xl border print:hidden flex-wrap">
          <Button variant="outline" size="sm" onClick={() => printRef.current && printElement(printRef.current)}><Printer className="h-4 w-4 ml-1" /> طباعة</Button>
          <Button variant="outline" size="sm" onClick={() => printRef.current && exportElementAsPDF(printRef.current, `تصريح-اجازة-${leave.persons?.full_name}`)}><FileDown className="h-4 w-4 ml-1" /> PDF</Button>
          <Button variant="default" size="sm" onClick={saveAsImage} disabled={savingImage} className="bg-emerald-700 hover:bg-emerald-800"><ImageIcon className="h-4 w-4 ml-1" /> {savingImage ? "جاري الحفظ..." : "حفظ كصورة"}</Button>
          {(sigs.personnel || sigs.chief || sigs.commander) && (
            <Button variant="ghost" size="sm" onClick={() => { setSigs({ personnel: null, chief: null, commander: null }); toast.success("تم مسح التواقيع"); }}><Trash className="h-4 w-4 ml-1" /> مسح التواقيع</Button>
          )}
        </div>
        
        <div ref={wrapperRef} className="w-full flex justify-center bg-[#f3f3f3] rounded-b-xl p-2 md:p-4 overflow-hidden">
          <div style={{ width: "794px", height: scale < 1 ? `${590 * scale}px` : "auto", transform: `scale(${scale})`, transformOrigin: "top center", transition: "transform 0.2s ease", flexShrink: 0 }}>
            <div ref={printRef} dir="rtl" className="vacation-official bg-white text-black relative shadow-lg" style={{ width: "210mm", minHeight: "148mm", padding: "9mm 11mm", fontFamily: "'Cairo', 'Tahoma', sans-serif", border: "2.8px solid #000000", borderRadius: "20px", overflow: "hidden", backgroundColor: "#ffffff", color: "#000000" }}>
              <img src={logoUrl} alt="" crossOrigin="anonymous" style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "300px", height: "300px", objectFit: "contain", opacity: 0.07, pointerEvents: "none", zIndex: 0 }} />
              <div className="relative z-10 flex items-start justify-between gap-2">
                <div style={{ fontSize: "12.5px", lineHeight: "1.7", textAlign: "right", minWidth: "195px", fontWeight: 500 }}><div style={{ fontWeight: 700 }}>قيادة قوات المقاومة الوطنية</div><div>حراس الجمهورية</div><div>قيادة لواء مدفعية المقاومة الوطنية</div><div style={{ fontWeight: 700 }}>مكتب البشرية</div></div>
                <div className="flex-1 text-center"><div style={{ fontSize: "15px", fontWeight: 700, marginBottom: "4px", fontFamily: "Traditional Arabic, serif" }}>بسم الله الرحمن الرحيم</div><img src={logoUrl} alt="شعار" crossOrigin="anonymous" className="mx-auto" style={{ width: "88px", height: "88px", objectFit: "contain" }} /></div>
                <div style={{ fontSize: "12.5px", lineHeight: "28px", minWidth: "145px", textAlign: "right" }}><div>التاريخ: {arDate}</div><div>الرقم : ( &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; )</div></div>
              </div>
              <div className="relative z-10 text-center mt-3 mb-3"><h2 style={{ fontSize: "20px", fontWeight: 800 }}>تصريح إجازة</h2></div>
              <div className="relative z-10">
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", border: "1.6px solid #000000" }}>
                  <thead><tr style={{ backgroundColor: "#f2f2f2" }}><th style={{ border: "1px solid #000", padding: "6px 3px", width: "24px" }}>م</th><th style={{ border: "1px solid #000", padding: "6px 3px", width: "62px" }}>م موحد</th><th style={{ border: "1px solid #000", padding: "6px 3px", width: "62px" }}>الرتبة</th><th style={{ border: "1px solid #000", padding: "6px 3px" }}>الاسم</th><th style={{ border: "1px solid #000", padding: "6px 3px", width: "64px" }}>الوحدة</th><th style={{ border: "1px solid #000", padding: "6px 3px", width: "50px" }}>من</th><th style={{ border: "1px solid #000", padding: "6px 3px", width: "50px" }}>الى</th><th style={{ border: "1px solid #000", padding: "6px 3px", width: "50px" }}>المدة</th><th style={{ border: "1px solid #000", padding: "6px 3px", width: "56px" }}>نوعها</th><th style={{ border: "1px solid #000", padding: "6px 3px", width: "60px" }}>ملاحظة</th></tr></thead>
                  <tbody><tr><td style={{ border: "1px solid #000", padding: "8px 3px", textAlign: "center" }}>1</td><td style={{ border: "1px solid #000", padding: "8px 3px", textAlign: "center", fontSize: "11px" }}>{leave.persons?.military_number ?? "-"}</td><td style={{ border: "1px solid #000", padding: "8px 3px", textAlign: "center", fontSize: "11px" }}>{leave.persons?.military_rank ?? "-"}</td><td style={{ border: "1px solid #000", padding: "8px 3px", textAlign: "center", fontWeight: 800, fontSize: "12.5px" }}>{leave.persons?.full_name ?? "-"}</td><td style={{ border: "1px solid #000", padding: "8px 3px", textAlign: "center" }}>{leave.persons?.formation ?? leave.persons?.squad ?? "-"}</td><td style={{ border: "1px solid #000", padding: "8px 3px", textAlign: "center", fontSize: "11px" }}>{startDisplay}</td><td style={{ border: "1px solid #000", padding: "8px 3px", textAlign: "center", fontSize: "11px" }}>{endDisplay}</td><td style={{ border: "1px solid #000", padding: "8px 3px", textAlign: "center" }}>{days} يوم</td><td style={{ border: "1px solid #000", padding: "8px 3px", textAlign: "center", fontSize: "11px" }}>{leave.leave_type}</td><td style={{ border: "1px solid #000", padding: "8px 3px", textAlign: "center", fontSize: "10px" }}>{leave.reason ? leave.reason.slice(0, 20) : ""}</td></tr></tbody>
                </table>
              </div>
              <div className="relative z-10 mt-4" style={{ fontSize: "13.5px", lineHeight: "32px", fontWeight: 500 }}><div>- يصرح للمذكور أعلاه بالعبور الى <span style={{ fontWeight: 700, display: "inline-block", borderBottom: "1px dotted #000", minWidth: "150px", textAlign: "center", padding: "0 8px" }}>________</span> كونه إجازة .</div><div style={{ marginTop: "8px" }}>ملاحظة:</div><div style={{ marginRight: "8px", fontSize: "12.5px" }}>يعتبر هذا التصريح ملغي في حالة الاستدعاء للاجازات .</div></div>
              <div className="relative z-10 border-t border-dashed border-black mt-5 mb-6"></div>
              
              {/* مناطق التوقيع القابلة للضغط */}
              <div className="relative z-10 grid grid-cols-3 gap-2 text-center mt-1" style={{ fontSize: "11.5px" }}>
                
                <div className="relative group cursor-pointer" onClick={() => setActiveSig("personnel")}>
                  <div className="absolute inset-0 bg-yellow-100/0 group-hover:bg-yellow-100/30 rounded-lg transition flex items-center justify-center print:hidden">
                    <span className="opacity-0 group-hover:opacity-100 text-[10px] bg-black text-white px-2 py-1 rounded-full flex items-center gap-1"><PenLine className="h-3 w-3" /> اضغط للتوقيع</span>
                  </div>
                  <div style={{ height: "65px", position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {sigs.personnel ? <img src={sigs.personnel} alt="توقيع" style={{ maxHeight: "60px", maxWidth: "120px", objectFit: "contain" }} /> : <div className="print:hidden text-[10px] text-gray-400"></div>}
                  </div>
                  <div style={{ fontWeight: 700, lineHeight: "16px" }}>بشرية لواء مدفعية الوطنية</div>
                </div>

                <div className="relative group cursor-pointer" onClick={() => setActiveSig("chief")}>
                  <div className="absolute inset-0 bg-yellow-100/0 group-hover:bg-yellow-100/30 rounded-lg transition flex items-center justify-center print:hidden">
                    <span className="opacity-0 group-hover:opacity-100 text-[10px] bg-black text-white px-2 py-1 rounded-full flex items-center gap-1"><PenLine className="h-3 w-3" /> اضغط للتوقيع</span>
                  </div>
                  <div style={{ height: "65px", position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {sigs.chief ? <img src={sigs.chief} alt="توقيع" style={{ maxHeight: "60px", maxWidth: "120px", objectFit: "contain" }} /> : null}
                  </div>
                  <div style={{ fontWeight: 700, lineHeight: "16px" }}>أركان حرب لواء مدفعية الوطنية</div>
                </div>

                <div className="relative group cursor-pointer" onClick={() => setActiveSig("commander")}>
                  <div className="absolute inset-0 bg-yellow-100/0 group-hover:bg-yellow-100/30 rounded-lg transition flex items-center justify-center print:hidden">
                    <span className="opacity-0 group-hover:opacity-100 text-[10px] bg-black text-white px-2 py-1 rounded-full flex items-center gap-1"><PenLine className="h-3 w-3" /> اضغط للتوقيع</span>
                  </div>
                  <div style={{ height: "65px", position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {sigs.commander ? <img src={sigs.commander} alt="توقيع" style={{ maxHeight: "60px", maxWidth: "120px", objectFit: "contain" }} /> : null}
                  </div>
                  <div style={{ fontWeight: 700, lineHeight: "16px" }}>قائد لواء مدفعية الوطنية</div>
                </div>

              </div>
            </div>
          </div>
        </div>
        <style>{`@media print { @page { size: A4 landscape; margin: 6mm; } body * { visibility: hidden !important; } .vacation-official, .vacation-official * { visibility: visible !important; } .vacation-official { position: fixed !important; left: 50% !important; top: 0 !important; transform: translateX(-50%) !important; margin: 0 !important; box-shadow: none !important; border: 2.8px solid #000 !important; border-radius: 20px !important; width: 210mm !important; } .vacation-official .group-hover\\:bg-yellow-100\\/30 { background: transparent !important; } .vacation-official span { display: none !important; } }`}</style>
      </DialogContent>

      <SignaturePadModal
        open={!!activeSig}
        onOpenChange={(v) => !v && setActiveSig(null)}
        initialTitle={getSigTitle()}
        onSave={(dataUrl) => {
          if (activeSig === "personnel") setSigs((s) => ({ ...s, personnel: dataUrl }));
          if (activeSig === "chief") setSigs((s) => ({ ...s, chief: dataUrl }));
          if (activeSig === "commander") setSigs((s) => ({ ...s, commander: dataUrl }));
        }}
      />
    </>
  );
}

