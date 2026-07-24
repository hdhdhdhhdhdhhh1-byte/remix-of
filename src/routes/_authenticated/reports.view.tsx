import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Printer, RotateCcw, CheckCircle2, FileText, Eye, Trash2, Image as ImageIcon, PenLine, Trash, X, Check } from "lucide-react";
import { type AttendanceStatus } from "@/lib/constants";
import { printElement } from "@/lib/export";
import logoUrl from "@/assets/resistance-logo.jpg";

export const Route = createFileRoute("/_authenticated/reports/view")({
  component: ReportsViewPage,
});

const PRINT_ROWS = ["الضباط", "ف١", "ف٢", "ق س", "ق ك"] as const;
const ARABIC_WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
interface Person { id: string; full_name: string; military_rank: string | null; formation: string | null; military_number: string | null; }
interface Entry { person_id: string; status: AttendanceStatus; note: string | null }
interface ReportRow { id: string; report_date: string; notes: string | null; approved_at: string | null; edited_after_approval?: boolean | null; }

function ReportsViewPage() {
  const { can, isAdmin, user } = useAuth();
  const canCancelApproval = isAdmin || can("reports_view", "cancel_approval") || can("reports_entry", "cancel_approval");
  const canView = isAdmin || can("reports_view", "view");
  const canDelete = isAdmin || can("reports_view", "delete") || can("reports_entry", "delete");
  const qc = useQueryClient();
  const [selectedReport, setSelectedReport] = useState<ReportRow | null>(null);

  const { data: reports = [] } = useQuery({
    queryKey: ["reports-list-approved"],
    enabled: canView,
    queryFn: async () => {
      const { data, error } = await supabase.from("daily_reports").select("id, report_date, notes, approved_at, edited_after_approval").not("approved_at", "is", null).order("report_date", { ascending: false }).limit(365);
      if (error) throw error;
      return (data ?? []) as ReportRow[];
    },
  });

  const cancelMut = useMutation({
    mutationFn: async (reportId: string) => {
      const { error } = await supabase.from("daily_reports").update({ approved_at: null, approved_by: null }).eq("id", reportId);
      if (error) throw error;
      await supabase.from("audit_log").insert({ user_id: user?.id, action: "cancel_approval", entity: "daily_reports", entity_id: reportId });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["reports-list-approved"] }); qc.invalidateQueries({ queryKey: ["report"] }); toast.success("تم إلغاء اعتماد التقرير"); setSelectedReport(null); },
    onError: (e: Error) => toast.error("خطأ: " + (e.message ?? "تعذر إلغاء الاعتماد")),
  });

  const deleteMut = useMutation({
    mutationFn: async (reportId: string) => { const { error } = await supabase.from("daily_reports").delete().eq("id", reportId); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["reports-list-approved"] }); toast.success("تم حذف التقرير"); },
  });

  if (!canView) return <div className="text-center text-muted-foreground py-8">ليس لديك صلاحية عرض التقارير</div>;

  const getWeekDay = (dateStr: string) => { try { return ARABIC_WEEKDAYS[new Date(dateStr).getDay()]; } catch { return "-"; } };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><h2 className="text-xl font-bold">عرض التقارير اليومية</h2><Badge variant="outline">{reports.length} تقرير</Badge></div>

      <Card>
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>م</TableHead><TableHead>التاريخ</TableHead><TableHead>اليوم</TableHead><TableHead>الحالة</TableHead><TableHead>ملاحظات</TableHead><TableHead>الإجراءات</TableHead></TableRow></TableHeader>
              <TableBody>
                {reports.map((r, idx) => (
                  <TableRow key={r.id}>
                    <TableCell>{idx + 1}</TableCell>
                    <TableCell className="font-medium">{r.report_date}</TableCell>
                    <TableCell><Badge variant="secondary">{getWeekDay(r.report_date)}</Badge></TableCell>
                    <TableCell>{r.approved_at ? <Badge className="bg-emerald-600">معتمد</Badge> : <Badge variant="secondary">مسودة</Badge>}{r.edited_after_approval && <Badge variant="destructive" className="mr-1">معدل</Badge>}</TableCell>
                    <TableCell className="max-w-[150px] truncate text-xs">{r.notes ?? "-"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        <Button size="sm" variant="outline" onClick={() => setSelectedReport(r)}><Eye className="h-4 w-4 ml-1" /> عرض</Button>
                        {r.approved_at && canCancelApproval && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild><Button size="sm" variant="ghost"><RotateCcw className="h-4 w-4 text-orange-600" /></Button></AlertDialogTrigger>
                            <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>تأكيد إلغاء الاعتماد</AlertDialogTitle><AlertDialogDescription>سيتم فتح التقرير للتعديل مرة أخرى. هل أنت متأكد؟</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>إلغاء</AlertDialogCancel><AlertDialogAction onClick={() => cancelMut.mutate(r.id)}>تأكيد</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
                          </AlertDialog>
                        )}
                        {canDelete && <Button size="sm" variant="ghost" onClick={() => { if (confirm("حذف التقرير نهائياً؟")) deleteMut.mutate(r.id); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {reports.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">لا توجد تقارير معتمدة</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!selectedReport} onOpenChange={(v) => !v && setSelectedReport(null)}>
        {selectedReport && <ReportPreviewModal report={selectedReport} onClose={() => setSelectedReport(null)} onCancelApproval={(id) => cancelMut.mutate(id)} canCancelApproval={canCancelApproval} />}
      </Dialog>
    </div>
  );
}

// ===== لوحة التوقيع =====
function SignaturePadModal({ open, onOpenChange, onSave, title }: { open: boolean; onOpenChange: (v: boolean) => void; onSave: (dataUrl: string) => void; title: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  useEffect(() => { if (!open) return; const c = canvasRef.current; if (!c) return; const ctx = c.getContext("2d"); if (!ctx) return; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.strokeStyle = "#000"; ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.lineJoin = "round"; }, [open]);
  const getPos = (e: any) => { const canvas = canvasRef.current!; const rect = canvas.getBoundingClientRect(); const clientX = e.touches ? e.touches[0].clientX : e.clientX; const clientY = e.touches ? e.touches[0].clientY : e.clientY; return { x: (clientX - rect.left) * (canvas.width / rect.width), y: (clientY - rect.top) * (canvas.height / rect.height) }; };
  const startDraw = (e: any) => { e.preventDefault(); setIsDrawing(true); const ctx = canvasRef.current!.getContext("2d")!; const p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
  const moveDraw = (e: any) => { if (!isDrawing) return; e.preventDefault(); const ctx = canvasRef.current!.getContext("2d")!; const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); };
  const endDraw = () => setIsDrawing(false);
  const clear = () => { const c = canvasRef.current!; const ctx = c.getContext("2d")!; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); };
  const save = () => { const c = canvasRef.current!; const blank = document.createElement("canvas"); blank.width = c.width; blank.height = c.height; const bCtx = blank.getContext("2d")!; bCtx.fillStyle = "#fff"; bCtx.fillRect(0, 0, blank.width, blank.height); if (c.toDataURL() === blank.toDataURL()) { toast.error("وقع أولاً ثم احفظ"); return; } onSave(c.toDataURL("image/png")); onOpenChange(false); toast.success("تم حفظ التوقيع ✅"); };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] md:max-w-[500px] p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-2"><DialogTitle className="flex items-center gap-2"><PenLine className="h-5 w-5" /> توقيع: {title}</DialogTitle></DialogHeader>
        <div className="px-4"><div className="border-2 border-dashed border-gray-300 rounded-xl bg-white overflow-hidden touch-none"><canvas ref={canvasRef} width={600} height={280} className="w-full h-[220px] md:h-[280px] touch-none cursor-crosshair" onMouseDown={startDraw} onMouseMove={moveDraw} onMouseUp={endDraw} onMouseLeave={endDraw} onTouchStart={startDraw} onTouchMove={moveDraw} onTouchEnd={endDraw} /></div><p className="text-[11px] text-gray-500 mt-2 text-center">وقع بإصبعك أو الماوس داخل المربع الأبيض</p></div>
        <div className="p-3 flex flex-row gap-2 justify-between bg-gray-50 mt-3"><div className="flex gap-2"><Button variant="outline" size="sm" onClick={clear}><Trash className="h-4 w-4 ml-1" /> مسح</Button><Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}><X className="h-4 w-4 ml-1" /> إلغاء</Button></div><Button size="sm" onClick={save} className="bg-emerald-700 hover:bg-emerald-800"><Check className="h-4 w-4 ml-1" /> حفظ التوقيع</Button></div>
      </DialogContent>
    </Dialog>
  );
}

function ReportPreviewModal({ report, onClose, onCancelApproval, canCancelApproval }: { report: ReportRow; onClose: () => void; onCancelApproval: (id: string) => void; canCancelApproval: boolean }) {
  const printRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [savingImage, setSavingImage] = useState(false);
  const [sigs, setSigs] = useState<{ chief: string | null; commander: string | null }>({ chief: null, commander: null });
  const [activeSig, setActiveSig] = useState<null | "chief" | "commander">(null);

  useEffect(() => {
    const updateScale = () => { if (!wrapperRef.current) return; const w = wrapperRef.current.clientWidth - 16; setScale(w < 794 ? w / 794 : 1); };
    updateScale(); setTimeout(updateScale, 150); window.addEventListener("resize", updateScale); return () => window.removeEventListener("resize", updateScale);
  }, []);

  const { data: persons = [] } = useQuery({
    queryKey: ["persons-all"], queryFn: async () => { const { data, error } = await supabase.from("persons").select("id, full_name, military_rank, formation, military_number").order("full_name"); if (error) throw error; return (data ?? []) as Person[]; }
  });
  const { data: entries = [] } = useQuery({
    queryKey: ["report-entries", report.id], enabled: !!report.id, queryFn: async () => { const { data, error } = await supabase.from("report_entries").select("person_id, status, note").eq("report_id", report.id); if (error) throw error; return (data ?? []) as Entry[]; }
  });
  const { data: prevEntries = [] } = useQuery({
    queryKey: ["report-entries-prev", report.report_date], enabled: !!report.report_date, queryFn: async () => { const { data: prev } = await supabase.from("daily_reports").select("id, report_date, report_entries(person_id, status)").lt("report_date", report.report_date).order("report_date", { ascending: false }).limit(1).maybeSingle(); const ents = (prev?.report_entries ?? []) as { person_id: string; status: AttendanceStatus }[]; return ents; }
  });

  const entryMap = useMemo(() => { const m: Record<string, Entry> = {}; entries.forEach((e) => { m[e.person_id] = e; }); return m; }, [entries]);
  const prevMap = useMemo(() => { const m: Record<string, AttendanceStatus> = {}; prevEntries.forEach((e) => { m[e.person_id] = e.status; }); return m; }, [prevEntries]);
  const byFormation = useMemo(() => { const map: Record<string, Person[]> = {}; PRINT_ROWS.forEach((f) => (map[f] = [])); persons.forEach((p) => { if (p.formation && (PRINT_ROWS as readonly string[]).includes(p.formation)) map[p.formation].push(p); }); return map; }, [persons]);
  const countsFor = (list: Person[]) => { const c: Record<AttendanceStatus, number> = { present: 0, absent: 0, leave: 0, sick: 0, permit: 0, mission: 0, course: 0, other: 0 }; list.forEach((p) => { const s = entryMap[p.id]?.status ?? "present"; c[s]++; }); const absentAll = c.absent + c.mission + c.other; const total = list.length; const present = total - (c.leave + c.permit + absentAll + c.sick + c.course); return { total, present, leave: c.leave, permit: c.permit, absent: absentAll, sick: c.sick, course: c.course }; };
  const changes = useMemo(() => { if (prevEntries.length === 0) return { newLeave: [] as Person[], returned: [] as Person[], newAbsent: [] as Person[], newSick: [] as Person[], newPermit: [] as Person[], newCourse: [] as Person[] }; const newLeave: Person[] = [], returned: Person[] = [], newAbsent: Person[] = [], newSick: Person[] = [], newPermit: Person[] = [], newCourse: Person[] = []; persons.forEach((p) => { const now = entryMap[p.id]?.status; const before = prevMap[p.id]; if (!now || !before) return; if (now === "leave" && before !== "leave") newLeave.push(p); if (before !== "present" && now === "present") returned.push(p); if ((now === "absent" || now === "mission" || now === "other") && !(before === "absent" || before === "mission" || before === "other")) newAbsent.push(p); if (now === "sick" && before !== "sick") newSick.push(p); if (now === "permit" && before !== "permit") newPermit.push(p); if (now === "course" && before !== "course") newCourse.push(p); }); return { newLeave, returned, newAbsent, newSick, newPermit, newCourse }; }, [entryMap, prevMap, persons, prevEntries]);

  const sectionTotals = PRINT_ROWS.map((f) => ({ f, c: countsFor(byFormation[f] ?? []) }));
  const grand = sectionTotals.reduce((acc, s) => ({ total: acc.total + s.c.total, present: acc.present + s.c.present, leave: acc.leave + s.c.leave, permit: acc.permit + s.c.permit, absent: acc.absent + s.c.absent, sick: acc.sick + s.c.sick, course: acc.course + s.c.course }), { total: 0, present: 0, leave: 0, permit: 0, absent: 0, sick: 0, course: 0 });

  const dateObj = new Date(report.report_date);
  const weekday = ARABIC_WEEKDAYS[dateObj.getDay()];
  const arDate = `${dateObj.getFullYear()}/${dateObj.getMonth() + 1}/${dateObj.getDate()}`;

  const saveAsImage = async () => {
    if (!printRef.current) return;
    setSavingImage(true);
    try {
      const loadHtmlToImage = (): Promise<any> => new Promise((resolve, reject) => {
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
      const htmlToImage = await loadHtmlToImage();
      const dataUrl = await htmlToImage.toPng(printRef.current, { quality: 1, pixelRatio: 3, backgroundColor: "#ffffff", cacheBust: true });
      const link = document.createElement("a");
      link.download = `يومية-${report.report_date}.png`;
      link.href = dataUrl;
      link.click();
      toast.success("تم حفظ الصورة مع التواقيع ✅");
    } catch (e: any) { console.error(e); toast.error("تعذر الحفظ"); }
    finally { setSavingImage(false); }
  };

  return (
    <>
      <DialogContent className="max-w-[98vw] md:max-w-[900px] p-0 bg-transparent border-0 shadow-none gap-0 max-h-[95vh] overflow-y-auto">
        <DialogHeader className="sr-only"><DialogTitle>تقرير {report.report_date}</DialogTitle></DialogHeader>
        <div className="flex gap-2 justify-center bg-white p-3 rounded-t-xl border print:hidden flex-wrap sticky top-0 z-20">
          <Button variant="outline" size="sm" onClick={() => printRef.current && printElement(printRef.current)}><Printer className="h-4 w-4 ml-1" /> طباعة</Button>
          <Button variant="default" size="sm" onClick={saveAsImage} disabled={savingImage} className="bg-emerald-700 hover:bg-emerald-800"><ImageIcon className="h-4 w-4 ml-1" /> {savingImage ? "جاري الحفظ..." : "حفظ كصورة"}</Button>
          {report.approved_at && canCancelApproval && <Button variant="destructive" size="sm" onClick={() => onCancelApproval(report.id)}><RotateCcw className="h-4 w-4 ml-1" /> إلغاء الاعتماد</Button>}
          {(sigs.chief || sigs.commander) && <Button variant="ghost" size="sm" onClick={() => { setSigs({ chief: null, commander: null }); toast.success("تم مسح التواقيع"); }}><Trash className="h-4 w-4 ml-1" /> مسح التواقيع</Button>}
        </div>

        <div ref={wrapperRef} className="w-full flex justify-center bg-gray-100 rounded-b-xl p-2 md:p-4 overflow-hidden">
          <div style={{ width: "794px", height: scale < 1 ? `${1123 * scale}px` : "auto", transform: `scale(${scale})`, transformOrigin: "top center", transition: "transform 0.2s ease", flexShrink: 0 }}>
            <div ref={printRef} dir="rtl" className="official-report bg-white text-black shadow-lg" style={{ width: "210mm", minHeight: "297mm", padding: "12mm 14mm", fontFamily: "'Cairo', 'Tahoma', sans-serif", backgroundColor: "#ffffff", color: "#000000", border: "2px solid #000" }}>
              <div className="flex items-start justify-between gap-4">
                <div style={{ fontSize: "14px", lineHeight: "32px", minWidth: "110px" }}><div>التاريخ: <strong>{arDate}</strong> م</div><div>اليوم: <strong>{weekday}</strong></div></div>
                <div className="flex-1 text-center"><div style={{ fontSize: "16px", fontWeight: 700, marginBottom: "4px" }}>بسم الله الرحمن الرحيم</div><img src={logoUrl} alt="شعار" crossOrigin="anonymous" className="mx-auto" style={{ width: "90px", height: "90px", objectFit: "contain" }} /></div>
                <div style={{ fontSize: "13px", lineHeight: "28px", textAlign: "right", minWidth: "220px" }}><div style={{ fontWeight: 700 }}>قيادة قوات المقاومة الوطنية</div><div>حراس الجمهورية</div><div>قيادة لواء مدفعية المقاومة الوطنية</div><div>قيادة كتيبة الراجمات</div><div style={{ fontWeight: 700 }}>مكتب البطارية الثانية</div></div>
              </div>

              <div className="text-center mt-4 mb-2"><h2 style={{ display: "inline-block", padding: "4px 24px", borderBottom: "2px solid #000", fontSize: "18px", fontWeight: 800 }}>يومية البطارية الثانية راجمات</h2></div>

              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px", marginTop: "8px", border: "1.5px solid #000" }}>
                <thead><tr style={{ backgroundColor: "#f2f2f2" }}><Th w="6%">م</Th><Th w="14%">الصنف</Th><Th>الإجازات</Th><Th>الأذونات</Th><Th>الغياب</Th><Th>المستشفى</Th><Th>الدورة</Th><Th>القوة</Th><Th>الموجود</Th></tr></thead>
                <tbody>
                  {sectionTotals.map((s, i) => (<tr key={s.f}><Td center>{i + 1}</Td><Td center bold>{s.f}</Td><Td center>{s.c.leave || ""}</Td><Td center>{s.c.permit || ""}</Td><Td center>{s.c.absent || ""}</Td><Td center>{s.c.sick || ""}</Td><Td center>{s.c.course || ""}</Td><Td center bold>{s.c.total || ""}</Td><Td center bold>{s.c.present || ""}</Td></tr>))}
                  <tr style={{ backgroundColor: "#f2f2f2", fontWeight: 700 }}><Td center colSpan={2}>الإجمالي</Td><Td center>{grand.leave || 0}</Td><Td center>{grand.permit || 0}</Td><Td center>{grand.absent || 0}</Td><Td center>{grand.sick || 0}</Td><Td center>{grand.course || 0}</Td><Td center>{grand.total || 0}</Td><Td center>{grand.present || 0}</Td></tr>
                </tbody>
              </table>

              <div className="mt-6">
                <div style={{ textAlign: "center", fontWeight: 700, marginBottom: "8px", fontSize: "16px" }}>التغيرات (لهذا اليوم فقط)</div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", border: "1.5px solid #000" }}>
                  <thead><tr style={{ backgroundColor: "#f2f2f2" }}><Th w="18%">التغير</Th><Th>الاسم</Th><Th w="14%">الرتبة</Th><Th w="12%">الوحدة</Th><Th w="22%">ملاحظات</Th></tr></thead>
                  <tbody>
                    {renderChangeRows("خروج إجازة", changes?.newLeave ?? [], entryMap)}
                    {renderChangeRows("عودة", changes?.returned ?? [], entryMap)}
                    {renderChangeRows("غياب جديد", changes?.newAbsent ?? [], entryMap)}
                    {renderChangeRows("مريض جديد", changes?.newSick ?? [], entryMap)}
                    {renderChangeRows("إذن", changes?.newPermit ?? [], entryMap)}
                    {renderChangeRows("دورة", changes?.newCourse ?? [], entryMap)}
                    {changes && Object.values(changes).every((a) => a.length === 0) && <tr><Td center colSpan={5}>لا توجد تغيرات عن اليوم السابق</Td></tr>}
                  </tbody>
                </table>
              </div>

              {report.notes && <div className="mt-4" style={{ fontSize: "14px" }}><strong>ملاحظات: </strong>{report.notes}</div>}

              {/* التوقيعات القابلة للضغط */}
              <div className="grid grid-cols-2 gap-8 mt-16 text-center" style={{ fontSize: "13px" }}>
                <div className="relative group cursor-pointer" onClick={() => setActiveSig("chief")}>
                  <div className="absolute inset-0 bg-yellow-100/0 group-hover:bg-yellow-100/40 rounded-lg transition flex items-center justify-center print:hidden">
                    <span className="opacity-0 group-hover:opacity-100 text-[10px] bg-black text-white px-2 py-1 rounded-full flex items-center gap-1"><PenLine className="h-3 w-3" /> اضغط للتوقيع</span>
                  </div>
                  <div style={{ height: "70px", display: "flex", alignItems: "center", justifyContent: "center" }}>{sigs.chief ? <img src={sigs.chief} alt="توقيع" style={{ maxHeight: "65px", maxWidth: "150px", objectFit: "contain" }} /> : null}</div>
                  <div style={{ borderTop: "1.5px solid #000", paddingTop: "4px", fontWeight: 700 }}>أركان حرب البطارية</div>
                </div>

                <div className="relative group cursor-pointer" onClick={() => setActiveSig("commander")}>
                  <div className="absolute inset-0 bg-yellow-100/0 group-hover:bg-yellow-100/40 rounded-lg transition flex items-center justify-center print:hidden">
                    <span className="opacity-0 group-hover:opacity-100 text-[10px] bg-black text-white px-2 py-1 rounded-full flex items-center gap-1"><PenLine className="h-3 w-3" /> اضغط للتوقيع</span>
                  </div>
                  <div style={{ height: "70px", display: "flex", alignItems: "center", justifyContent: "center" }}>{sigs.commander ? <img src={sigs.commander} alt="توقيع" style={{ maxHeight: "65px", maxWidth: "150px", objectFit: "contain" }} /> : null}</div>
                  <div style={{ borderTop: "1.5px solid #000", paddingTop: "4px", fontWeight: 700 }}>قائد البطارية</div>
                </div>
              </div>

            </div>
          </div>
        </div>
        <style>{`@media print { @page { size: A4; margin: 10mm; } body * { visibility: hidden !important; } .official-report, .official-report * { visibility: visible !important; } .official-report { position: absolute !important; inset: 0 !important; margin: 0 auto !important; transform: none !important; width: 210mm !important; box-shadow: none !important; border: 2px solid #000 !important; } .official-report .group-hover\\:bg-yellow-100\\/40 { background: transparent !important; } } .official-report th, .official-report td { border: 1px solid #000; padding: 6px 8px; }`}</style>
      </DialogContent>

      <SignaturePadModal open={!!activeSig} onOpenChange={(v) => !v && setActiveSig(null)} title={activeSig === "chief" ? "أركان حرب البطارية" : "قائد البطارية"} onSave={(url) => { if (activeSig === "chief") setSigs((s) => ({ ...s, chief: url })); if (activeSig === "commander") setSigs((s) => ({ ...s, commander: url })); }} />
    </>
  );
}

function Th({ children, w }: { children: React.ReactNode; w?: string }) { return <th style={{ width: w, textAlign: "center", fontWeight: 700 }}>{children}</th>; }
function Td({ children, center, bold, colSpan }: { children?: React.ReactNode; center?: boolean; bold?: boolean; colSpan?: number }) { return <td colSpan={colSpan} style={{ textAlign: center ? "center" : "right", fontWeight: bold ? 700 : 400 }}>{children}</td>; }
function renderChangeRows(label: string, list: Person[], entryMap: Record<string, Entry>) {
  if (list.length === 0) return null;
  return list.map((p) => (<tr key={label + p.id}><Td center bold>{label}</Td><Td>{p.full_name}</Td><Td center>{p.military_rank ?? "-"}</Td><Td center>{p.formation ?? "-"}</Td><Td>{entryMap[p.id]?.note ?? ""}</Td></tr>));
}

