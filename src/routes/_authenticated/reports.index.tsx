import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getReportByDate, getLastApprovedReportBefore, saveOfflineReport } from "@/lib/offline/repository/reports.repository";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Save, CheckCircle2, PenLine, Trash, RotateCcw, Image as ImageIcon } from "lucide-react";
import { STATUS_LABEL, ATTENDANCE_STATUSES, type AttendanceStatus } from "@/lib/constants";
import logoUrl from "@/assets/resistance-logo.jpg";

const isOnline = () =>
  typeof navigator !== "undefined" && navigator.onLine;

export const Route = createFileRoute("/_authenticated/reports/")({ component: ReportsPage, });
interface Person { id: string; full_name: string; military_rank: string | null; formation: string | null; military_number: string | null; }
const PRINT_ROWS: string[] = ["الضباط", "ف١", "ف٢", "ق س", "ق ك"];
const ARABIC_WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

function SignaturePad({ open, onOpenChange, onSave }: { open: boolean; onOpenChange: (v: boolean) => void; onSave: (url: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  useEffect(() => {
    if (!open) return;
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext("2d")!; ctx.fillStyle = "#fff"; ctx.fillRect(0,0,c.width,c.height); ctx.strokeStyle="#000"; ctx.lineWidth=2.5; ctx.lineCap="round"; ctx.lineJoin="round";
  }, [open]);
  const pos = (e: any) => {
    const r = canvasRef.current!.getBoundingClientRect();
    const cx = e.touches? e.touches[0].clientX : e.clientX;
    const cy = e.touches? e.touches[0].clientY : e.clientY;
    return { x: (cx - r.left) * (600 / r.width), y: (cy - r.top) * (280 / r.height) };
  };
  const start = (e: any) => { e.preventDefault(); setDrawing(true); const ctx = canvasRef.current!.getContext("2d")!; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x,p.y); };
  const move = (e: any) => { if(!drawing) return; e.preventDefault(); const ctx = canvasRef.current!.getContext("2d")!; const p = pos(e); ctx.lineTo(p.x,p.y); ctx.stroke(); };
  const end = () => setDrawing(false);
  const clear = () => { const c = canvasRef.current!; const ctx = c.getContext("2d")!; ctx.fillStyle="#fff"; ctx.fillRect(0,0,c.width,c.height); };
  const save = () => {
    const c = canvasRef.current!;
    if (c.toDataURL().length < 1500) { toast.error("وقع أولاً"); return; }
    onSave(c.toDataURL("image/png")); onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] md:max-w-[500px] p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-2"><DialogTitle className="flex items-center gap-2"><PenLine className="h-5 w-5" /> توقيع قائد البطارية</DialogTitle></DialogHeader>
        <div className="px-4"><div className="border-2 border-dashed border-gray-300 rounded-xl bg-white overflow-hidden"><canvas ref={canvasRef} width={600} height={280} className="w-full h-[260px] touch-none cursor-crosshair" onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end} onTouchStart={start} onTouchMove={move} onTouchEnd={end} /></div></div>
        <div className="p-3 flex justify-between bg-gray-50 mt-3"><Button variant="outline" size="sm" onClick={clear}><Trash className="h-4 w-4 ml-1" /> مسح</Button><Button size="sm" onClick={save} className="bg-emerald-700 hover:bg-emerald-800">حفظ التوقيع</Button></div>
      </DialogContent>
    </Dialog>
  );
}

function ReportsPage() {
  const { can, isAdmin, user } = useAuth();
  const canSave = isAdmin || can("reports_entry", "edit") || can("reports_entry", "add");
  const canSign = isAdmin || can("reports_entry", "sign");
  const canApprove = isAdmin || can("reports_entry", "approve");
  const canCancel = isAdmin || can("reports_entry", "cancel_approval");
  const canExportImage = isAdmin || can("reports_entry", "export_image");
  const qc = useQueryClient();
  const printRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10));
  const [entries, setEntries] = useState<Record<string, { status: AttendanceStatus; note: string }>>({});
  const [initialEntries, setInitialEntries] = useState<Record<string, { status: AttendanceStatus; note: string }>>({});
  const [notes, setNotes] = useState("");
  const [commanderSig, setCommanderSig] = useState<string | null>(null);
  const [showSig, setShowSig] = useState(false);
  const [savingImage, setSavingImage] = useState(false);

  useEffect(() => {
    const updateScale = () => {
      if (!wrapperRef.current) return;
      const containerWidth = wrapperRef.current.clientWidth - 16;
      const reportWidth = 794;
      if (containerWidth < reportWidth) { setScale(containerWidth / reportWidth); } else { setScale(1); }
    };
    updateScale(); window.addEventListener("resize", updateScale); return () => window.removeEventListener("resize", updateScale);
  }, []);

  const { data: persons = [] } = useQuery({
    queryKey: ["persons-active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("persons").select("id, full_name, military_rank, formation, military_number").eq("active", true).order("full_name");
      if (error) throw error; return data as Person[];
    },
  });

  const { data: report, isLoading: reportLoading } = useQuery({
    queryKey: ["report", reportDate],
    queryFn: async () => {
      return await getReportByDate(reportDate);
    },
  });

  const { data: lastReport, isLoading: lastLoading } = useQuery({
    queryKey: ["last-approved-report-before", reportDate],
    queryFn: async () => {
      return await getLastApprovedReportBefore(reportDate);
    },
  });

  useEffect(() => { if (report) { setCommanderSig((report as any).commander_signature?? null); } else { setCommanderSig(null); } }, [report]);

  useEffect(() => {
    if (reportLoading || lastLoading) return;
    if (persons.length === 0) return;
    if (report && "report_entries" in report) {
      const map: Record<string, { status: AttendanceStatus; note: string }> = {};
      const ents = (report.report_entries?? []) as { person_id: string; status: AttendanceStatus; note: string | null }[];
      ents.forEach((e) => { map[e.person_id] = { status: e.status, note: e.note?? "" }; });
      persons.forEach((p) => { if (!map[p.id]) map[p.id] = { status: "present", note: "" }; });
      setEntries(map);
      setInitialEntries(structuredClone(map));
      setNotes((report as { notes?: string | null }).notes?? "");
      return;
    }
    if (lastReport) {
      const map: Record<string, { status: AttendanceStatus; note: string }> = {};

      const ents = (lastReport.report_entries ?? []) as {
        person_id: string;
        status: AttendanceStatus;
        note: string | null;
      }[];

      const lastMap: Record<string, { status: AttendanceStatus; note: string }> = {};

      ents.forEach((e) => {
        lastMap[e.person_id] = {
          status: e.status,
          note: e.note ?? ""
        };
      });

      persons.forEach((p) => {
        map[p.id] = lastMap[p.id] ?? {
          status: "present",
          note: ""
        };
      });

      // لا يوجد تقرير لهذا التاريخ:
      // نستخدم آخر تقرير معتمد كأساس لكشف الأفراد فقط
      // الإحصائيات ستقرأ من entries الحالية
      // المتغيرات تبدأ فارغة لهذا اليوم

      setEntries(map);
      setInitialEntries(structuredClone(map));
      setNotes("");

      return;
    }
    const def: Record<string, { status: AttendanceStatus; note: string }> = {};
    persons.forEach((p) => { def[p.id] = { status: "present", note: "" }; });
    setEntries(def);
    setInitialEntries(structuredClone(def));
    setNotes("");
  }, [report, lastReport, persons, reportLoading, lastLoading, reportDate]);

  const byFormation = useMemo(() => {
    const map: Record<string, Person[]> = {}; PRINT_ROWS.forEach((f) => (map[f] = [])); map["أخرى"] = [];
    persons.forEach((p) => { const key = p.formation && PRINT_ROWS.includes(p.formation)? p.formation : "أخرى"; map[key].push(p); });
    return map;
  }, [persons]);

  const countsFor = (list: Person[]) => {
    const c: Record<AttendanceStatus, number> = { present: 0, absent: 0, leave: 0, sick: 0, permit: 0, mission: 0, course: 0, other: 0, };
    list.forEach((p) => { const s = entries[p.id]?.status?? "present"; c[s]++; });
    const absentAll = c.absent + c.mission + c.other;
    const total = list.length;
    const present = total - (c.leave + c.permit + absentAll + c.sick + c.course);
    return { total, present, leave: c.leave, permit: c.permit, absent: absentAll, sick: c.sick, course: c.course, raw: c, };
  };

  const setStatus = (personId: string, status: AttendanceStatus) => { setEntries((prev) => ({...prev, [personId]: { status, note: prev[personId]?.note?? "" } })); };

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!canSave) throw new Error("ليس لديك صلاحية الحفظ");

      if (!isOnline()) {
        const reportId = crypto.randomUUID();

        const offlineReport = {
          id: reportId,
          report_date: reportDate,
          notes,
          commander_signature: commanderSig,
          created_by: user?.id ?? null,
          status: "pending",
          approved_at: null,
          approved_by: null,
        };

        const rows = Object.entries(entries).map(([person_id, v]) => ({
          id: crypto.randomUUID(),
          report_id: reportId,
          person_id,
          status: v.status,
          note: v.note || null,
        }));

        await saveOfflineReport(offlineReport, rows);
        return;
      }

      let reportId = report?.id as string | undefined;
if (!reportId) {
        const { data, error } = await supabase.from("daily_reports").insert({ report_date: reportDate, notes, commander_signature: commanderSig, created_by: user?.id }).select().single();
        if (error) throw error; reportId = data.id;
      } else {
        await supabase.from("daily_reports").update({ notes, commander_signature: commanderSig }).eq("id", reportId);
        await supabase.from("report_entries").delete().eq("report_id", reportId);
      }
      const rows = Object.entries(entries).map(([person_id, v]) => ({ report_id: reportId!, person_id, status: v.status, note: v.note || null, }));
      if (rows.length > 0) { const { error } = await supabase.from("report_entries").insert(rows); if (error) throw error; }
      await supabase.from("audit_log").insert({ user_id: user?.id, action: "save", entity: "daily_reports", entity_id: reportId });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["report"] }); qc.invalidateQueries({ queryKey: ["last-approved-report-before"] }); qc.invalidateQueries({ queryKey: ["dashboard-stats"] }); setInitialEntries(structuredClone(entries)); toast.success("تم حفظ التقرير"); },
    onError: (e: Error) => toast.error("خطأ: " + e.message),
  });

  const approveMut = useMutation({
    mutationFn: async () => {
      if (!canApprove) throw new Error("ليس لديك صلاحية الاعتماد");
      if (!report) throw new Error("احفظ التقرير أولاً");
      if (!commanderSig) throw new Error("يجب التوقيع أولاً");
      const { error } = await supabase.from("daily_reports").update({ approved_at: new Date().toISOString(), approved_by: user?.id, commander_signature: commanderSig }).eq("id", report.id);
      if (error) throw error;
      await supabase.from("audit_log").insert({ user_id: user?.id, action: "approve", entity: "daily_reports", entity_id: report.id });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["report"] }); toast.success("تم اعتماد التقرير"); },
    onError: (e: Error) => toast.error("خطأ: " + e.message),
  });

  const cancelMut = useMutation({
    mutationFn: async () => {
      if (!canCancel) throw new Error("ليس لديك صلاحية إلغاء الاعتماد");
      if (!report) throw new Error("لا يوجد تقرير");
      const { error } = await supabase.from("daily_reports").update({ approved_at: null, approved_by: null }).eq("id", report.id);
      if (error) throw error;
      await supabase.from("audit_log").insert({ user_id: user?.id, action: "cancel_approval", entity: "daily_reports", entity_id: report.id });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["report"] }); toast.success("تم إلغاء الاعتماد"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveAsImage = async () => {
    if (!printRef.current) return;
    if (!canExportImage) { toast.error("ليس لديك صلاحية حفظ كصورة"); return; }
    setSavingImage(true);
    try {
      const mod = await import("html-to-image");
      const dataUrl = await mod.toPng(printRef.current, { quality: 1, pixelRatio: 3, backgroundColor: "#ffffff", cacheBust: true });
      const a = document.createElement("a"); a.download = `يومية-${reportDate}.png`; a.href = dataUrl; a.click();
      toast.success("تم حفظ الصورة موقعة ✅");
    } catch (e: any) { toast.error("فشل الحفظ"); }
    setSavingImage(false);
  };

  const changes = useMemo(() => {
    const newLeave: Person[] = [], returned: Person[] = [], newAbsent: Person[] = [], newSick: Person[] = [], newPermit: Person[] = [], newCourse: Person[] = [];
    if (Object.keys(initialEntries).length === 0) return { newLeave, returned, newAbsent, newSick, newPermit, newCourse };
    persons.forEach((p) => {
      const now = entries[p.id]?.status;
      const before = initialEntries[p.id]?.status;
      if (!now ||!before) return;
      if (now!== before) {
        if (now === "leave") newLeave.push(p);
        else if (now === "present") returned.push(p);
        else if (now === "absent" || now === "mission" || now === "other") newAbsent.push(p);
        else if (now === "sick") newSick.push(p);
        else if (now === "permit") newPermit.push(p);
        else if (now === "course") newCourse.push(p);
      }
    });
    return { newLeave, returned, newAbsent, newSick, newPermit, newCourse };
  }, [entries, initialEntries, persons]);

  const sectionTotals = PRINT_ROWS.map((f) => ({ f, c: countsFor(byFormation[f]?? []) }));
  const grand = sectionTotals.reduce((acc, s) => ({ total: acc.total + s.c.total, present: acc.present + s.c.present, leave: acc.leave + s.c.leave, permit: acc.permit + s.c.permit, absent: acc.absent + s.c.absent, sick: acc.sick + s.c.sick, course: acc.course + s.c.course, }), { total: 0, present: 0, leave: 0, permit: 0, absent: 0, sick: 0, course: 0 });
  const approved =!!report?.approved_at;
  const dateObj = new Date(reportDate);
  const weekday = ARABIC_WEEKDAYS[dateObj.getDay()];
  const arDate = `${dateObj.getFullYear()}/${dateObj.getMonth() + 1}/${dateObj.getDate()}`;
  const handleSigClick = () => {
    if (approved) return;
    if (!report) { toast.error("احفظ التقرير أولاً"); return; }
    if (!canSign) { toast.error("ليس لديك صلاحية التوقيع"); return; }
    setShowSig(true);
  };

  const statusMessage = useMemo(() => {
    if (reportLoading || lastLoading) return "جاري التحميل...";
    if (report) return `تقرير محفوظ لهذا اليوم (${reportDate})`;
    if (lastReport) return `محمل من آخر تقرير معتمد (${lastReport.report_date}) - التغيرات فاضية`;
    return "أول تقرير في النظام";
  }, [report, lastReport, reportLoading, lastLoading, reportDate]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4 print:hidden">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">التقرير اليومي</h1>
          <p className="text-muted-foreground text-sm mt-1">{statusMessage}</p>
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          <div><Label>التاريخ</Label><Input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} className="w-44" /></div>
          {canExportImage && <Button variant="default" size="sm" onClick={saveAsImage} disabled={savingImage} className="bg-emerald-700 hover:bg-emerald-800"><ImageIcon className="h-4 w-4 ml-1" /> {savingImage? "جاري..." : "حفظ كصورة"}</Button>}
        </div>
      </div>

      <div className="print:hidden space-y-4">
        {PRINT_ROWS.map((f) => {
          const list = byFormation[f]?? []; if (list.length === 0) return null; const c = countsFor(list);
          return (
            <Card key={f}>
              <CardHeader><CardTitle className="flex items-center justify-between flex-wrap gap-2"><span>{f}</span><div className="text-sm font-normal flex flex-wrap gap-3"><span>القوة: <strong>{c.total}</strong></span><span className="text-emerald-600">موجود: <strong>{c.present}</strong></span><span>إجازة: <strong>{c.leave}</strong></span><span>إذن: <strong>{c.permit}</strong></span><span className="text-red-600">غياب: <strong>{c.absent}</strong></span><span>مستشفى: <strong>{c.sick}</strong></span><span>دورة: <strong>{c.course}</strong></span></div></CardTitle></CardHeader>
              <CardContent><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>الرقم العسكري</TableHead><TableHead>الاسم</TableHead><TableHead>الرتبة</TableHead><TableHead>الحالة</TableHead><TableHead>ملاحظات</TableHead></TableRow></TableHeader><TableBody>{list.map((p) => (<TableRow key={p.id}><TableCell>{p.military_number?? "-"}</TableCell><TableCell className="font-medium">{p.full_name}</TableCell><TableCell>{p.military_rank?? "-"}</TableCell><TableCell><Select value={entries[p.id]?.status?? "present"} onValueChange={(v) => setStatus(p.id, v as AttendanceStatus)} disabled={!canSave || approved}><SelectTrigger className="w-32"><SelectValue /></SelectTrigger><SelectContent>{ATTENDANCE_STATUSES.map((s) => (<SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>))}</SelectContent></Select></TableCell><TableCell><Input value={entries[p.id]?.note?? ""} onChange={(e) => setEntries((prev) => ({...prev, [p.id]: { status: prev[p.id]?.status?? "present", note: e.target.value }, }))} disabled={!canSave || approved} placeholder="ملاحظات..." /></TableCell></TableRow>))}</TableBody></Table></div></CardContent>
            </Card>
          );
        })}
        <Card><CardContent className="pt-6"><Label>ملاحظات التقرير (المتغيرات)</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!canSave || approved} placeholder="فارغ كل يوم جديد" /></CardContent></Card>
        <div className="flex gap-2 flex-wrap">
          {canSave && <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || approved || reportLoading || lastLoading}><Save className="h-4 w-4 ml-1" /> {reportLoading? "تحميل..." : "حفظ"}</Button>}
          {canApprove && report &&!approved && (<Button variant="outline" onClick={() => approveMut.mutate()} disabled={approveMut.isPending ||!commanderSig} className={commanderSig? "bg-emerald-700 text-white hover:bg-emerald-800" : ""}><CheckCircle2 className="h-4 w-4 ml-1" /> اعتماد</Button>)}
          {canCancel && approved && (<Button variant="destructive" size="sm" onClick={() => { if (confirm("إلغاء الاعتماد؟")) cancelMut.mutate(); }} disabled={cancelMut.isPending}><RotateCcw className="h-4 w-4 ml-1" /> إلغاء الاعتماد</Button>)}
          {approved && (<div className="text-sm text-emerald-600 flex items-center"><CheckCircle2 className="h-4 w-4 ml-1" /> معتمد</div>)}
        </div>
      </div>

      <div ref={wrapperRef} className="w-full flex justify-center bg-gray-100/50 rounded-xl p-2 md:p-4 overflow-hidden">
        <div style={{ width: "794px", height: scale < 1? `${1123 * scale}px` : "auto", transform: `scale(${scale})`, transformOrigin: "top center", transition: "transform 0.2s ease", }}>
          <div ref={printRef} dir="rtl" className="official-report bg-white text-black shadow-lg" style={{ width: "210mm", minHeight: "297mm", padding: "12mm 14mm", fontFamily: "'Cairo', 'Tahoma', sans-serif" }}>
            <div className="flex items-start justify-between gap-4"><div className="text-sm leading-8 min-w-[110px]"><div>التاريخ: <strong>{arDate}</strong> م</div><div>اليوم: <strong>{weekday}</strong></div></div><div className="flex-1 text-center"><div className="text-base font-bold mb-1">بسم الله الرحمن الرحيم</div><img src={logoUrl} alt="شعار المقاومة الوطنية" className="mx-auto" style={{ width: "90px", height: "90px", objectFit: "contain" }} /></div><div className="text-sm leading-7 text-right min-w-[220px]"><div className="font-bold">قيادة قوات المقاومة الوطنية</div><div>حراس الجمهورية</div><div>قيادة لواء مدفعية المقاومة الوطنية</div><div>قيادة كتيبة الراجمات</div><div className="font-bold">مكتب البطارية الثانية</div></div></div>
            <div className="text-center mt-4 mb-2"><h2 className="inline-block px-6 py-1 border-b-2 border-black text-lg font-bold">يومية البطارية الثانية راجمات</h2></div>
            <table className="w-full border-collapse text-sm mt-2" style={{ border: "1.5px solid #000" }}><thead><tr className="bg-gray-100"><Th w="6%">م</Th><Th w="14%">الصنف</Th><Th>الإجازات</Th><Th>الأذونات</Th><Th>الغياب</Th><Th>المستشفى</Th><Th>الدورة</Th><Th>القوة</Th><Th>الموجود</Th></tr></thead><tbody>{sectionTotals.map((s, i) => (<tr key={s.f}><Td center>{i + 1}</Td><Td center bold>{s.f}</Td><Td center>{s.c.leave || ""}</Td><Td center>{s.c.permit || ""}</Td><Td center>{s.c.absent || ""}</Td><Td center>{s.c.sick || ""}</Td><Td center>{s.c.course || ""}</Td><Td center bold>{s.c.total || ""}</Td><Td center bold>{s.c.present || ""}</Td></tr>))}<tr className="bg-gray-100 font-bold"><Td center colSpan={2}>الإجمالي</Td><Td center>{grand.leave || 0}</Td><Td center>{grand.permit || 0}</Td><Td center>{grand.absent || 0}</Td><Td center>{grand.sick || 0}</Td><Td center>{grand.course || 0}</Td><Td center>{grand.total || 0}</Td><Td center>{grand.present || 0}</Td></tr></tbody></table>
            <div className="mt-6"><div className="text-center font-bold mb-2 text-base">التغيرات</div><table className="w-full border-collapse text-sm" style={{ border: "1.5px solid #000" }}><thead><tr className="bg-gray-100"><Th w="18%">التغير</Th><Th>الاسم</Th><Th w="14%">الرتبة</Th><Th w="12%">الوحدة</Th><Th w="22%">ملاحظات</Th></tr></thead><tbody>{renderChangeRows("خروج إجازة", changes?.newLeave?? [], entries)}{renderChangeRows("عودة", changes?.returned?? [], entries)}{renderChangeRows("غياب جديد", changes?.newAbsent?? [], entries)}{renderChangeRows("مريض جديد", changes?.newSick?? [], entries)}{renderChangeRows("إذن", changes?.newPermit?? [], entries)}{renderChangeRows("دورة", changes?.newCourse?? [], entries)}{(changes.newLeave.length + changes.returned.length + changes.newAbsent.length + changes.newSick.length + changes.newPermit.length + changes.newCourse.length === 0) && (<tr><Td center colSpan={5}>لا توجد تغيرات - {report? "لم تقم بتعديل اليوم" : lastReport? `محمل من ${lastReport.report_date}` : "فارغ"}</Td></tr>)}</tbody></table></div>
            {notes && (<div className="mt-4 text-sm"><strong>ملاحظات: </strong>{notes}</div>)}
            <div className="flex justify-end mt-20">
              <div className="w-64 text-center">
                <div className="font-bold text-[13px]">قائد البطارية</div>
                <div className="text-[13px] mt-1">م2/عبدالنور العامري</div>
                <div onClick={handleSigClick} className={`mt-2 h-[80px] w-full flex items-center justify-center relative ${approved? "cursor-default" : canSign? "cursor-pointer hover:bg-yellow-50" : "cursor-not-allowed"}`} style={{ background: "transparent" }}>
                  {commanderSig? <img src={commanderSig} alt="توقيع" style={{ maxHeight: "75px", maxWidth: "200px", objectFit: "contain" }} /> : canSign &&!approved? <span className="text-[11px] text-gray-400 border border-dashed border-gray-300 px-3 py-1 rounded">اضغط للتوقيع</span> : <span className="text-[11px] text-gray-400">لا يوجد توقيع</span>}
                </div>
                <div className="border-t border-black mt-1 w-full"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <SignaturePad open={showSig} onOpenChange={setShowSig} onSave={(url) => { if (!canSign) { toast.error("ليس لديك صلاحية التوقيع"); return; } setCommanderSig(url); setTimeout(()=> saveMut.mutate(), 100); }} />
      <style>{`.official-report th,.official-report td { border: 1px solid #000; padding: 6px 8px; }`}</style>
    </div>
  );
}

function Th({ children, w }: { children: React.ReactNode; w?: string }) { return <th style={{ width: w, textAlign: "center", fontWeight: 700 }}>{children}</th>; }
function Td({ children, center, bold, colSpan }: { children?: React.ReactNode; center?: boolean; bold?: boolean; colSpan?: number }) { return <td colSpan={colSpan} style={{ textAlign: center? "center" : "right", fontWeight: bold? 700 : 400 }}>{children}</td>; }
function renderChangeRows(label: string, list: Person[], entries: Record<string, { status: AttendanceStatus; note: string }>,) { if (list.length === 0) return null; return list.map((p) => (<tr key={label + p.id}><Td center bold>{label}</Td><Td>{p.full_name}</Td><Td center>{p.military_rank?? "-"}</Td><Td center>{p.formation?? "-"}</Td><Td>{entries[p.id]?.note?? ""}</Td></tr>)); }
