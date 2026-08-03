import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Eye, Trash2, Image as ImageIcon } from "lucide-react";
import { type AttendanceStatus } from "@/lib/constants";
import logoUrl from "@/assets/resistance-logo.jpg";

export const Route = createFileRoute("/_authenticated/reports/view")({ component: ReportsViewPage });
const PRINT_ROWS = ["الضباط", "ف١", "ف٢", "ق س", "ق ك"] as const;
const ARABIC_WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
interface Person { id: string; full_name: string; military_rank: string | null; formation: string | null; military_number: string | null; }
interface Entry { person_id: string; status: AttendanceStatus; note: string | null }
interface ReportRow { id: string; report_date: string; notes: string | null; approved_at: string | null; commander_signature: string | null; }

function ReportsViewPage() {
  const { can, isAdmin } = useAuth();
  const canView = isAdmin || can("reports_view", "view");
  const canDelete = isAdmin || can("reports_view", "delete");
  const qc = useQueryClient();
  const [selectedReport, setSelectedReport] = useState<ReportRow | null>(null);
  const { data: reports = [] } = useQuery({
    queryKey: ["reports-list-approved"],
    enabled: canView,
    queryFn: async () => {
      const { data, error } = await supabase.from("daily_reports").select("id, report_date, notes, approved_at, commander_signature").not("approved_at", "is", null).order("report_date", { ascending: false }).limit(365);
      if (error) throw error;
      return data as ReportRow[];
    }
  });

  // ✅ الإصلاح الجوهري للحذف
  const handleDelete = async (id: string) => {
    const reportToDelete = reports.find(r=>r.id===id);
    if (!confirm(`حذف تقرير ${reportToDelete?.report_date} نهائياً؟\nسيعود لصفحة الرفع كأنه لم يُرفع أبداً (بدون توقيع ولا اعتماد)`)) return;
    try {
      // 1- احذف التفاصيل أولاً
      const { error: e1 } = await supabase.from("report_entries").delete().eq("report_id", id);
      if (e1) throw e1;
      // 2- احذف التقرير
      const { error: e2 } = await supabase.from("daily_reports").delete().eq("id", id);
      if (e2) throw e2;

      // 3- امسح كاش صفحة الرفع لهذا التاريخ نهائياً - هذا حل مشكلتك
      qc.invalidateQueries({ queryKey: ["reports-list-approved"] });
      qc.invalidateQueries({ queryKey: ["reports-list"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      if (reportToDelete) {
        qc.removeQueries({ queryKey: ["report", reportToDelete.report_date] });
      }
      qc.removeQueries({ queryKey: ["report"] });
      qc.invalidateQueries({ queryKey: ["prev-report"] });
      qc.invalidateQueries({ queryKey: ["report-entries"] });

      toast.success(`تم حذف ${reportToDelete?.report_date} نهائياً - ارجع لصفحة الرفع ستراه كيوم جديد`);
    } catch (err:any) {
      toast.error("فشل الحذف: " + err.message + " - نفذ إصلاح RLS بالأسفل");
    }
  };

  const getWeekDay = (d: string) => { try { return ARABIC_WEEKDAYS[new Date(d).getDay()]; } catch { return "-"; } };
  if (!canView) return <div className="text-center py-8">ليس لديك صلاحية</div>;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><h2 className="text-xl font-bold">عرض التقارير اليومية</h2><Badge variant="outline">{reports.length} تقرير</Badge></div>
      <Card><CardContent className="pt-6"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>م</TableHead><TableHead>التاريخ</TableHead><TableHead>اليوم</TableHead><TableHead>الحالة</TableHead><TableHead>ملاحظات</TableHead><TableHead>الإجراءات</TableHead></TableRow></TableHeader><TableBody>
      {reports.map((r, idx) => (
        <TableRow key={r.id}><TableCell>{idx + 1}</TableCell><TableCell className="font-medium">{r.report_date}</TableCell><TableCell><Badge variant="secondary">{getWeekDay(r.report_date)}</Badge></TableCell><TableCell><Badge className="bg-emerald-600">معتمد</Badge></TableCell><TableCell className="max-w-[150px] truncate text-xs">{r.notes || "-"}</TableCell><TableCell><div className="flex gap-1"><Button size="sm" variant="outline" onClick={() => setSelectedReport(r)}><Eye className="h-4 w-4 ml-1" /> عرض</Button>{canDelete && <Button size="sm" variant="ghost" onClick={() => handleDelete(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}</div></TableCell></TableRow>
      ))}
      {reports.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-6">لا توجد تقارير معتمدة</TableCell></TableRow>}
      </TableBody></Table></div></CardContent></Card>
      <Dialog open={!!selectedReport} onOpenChange={(v) => { if (!v) setSelectedReport(null); }}>{selectedReport && <ReportPreviewModal report={selectedReport} />}</Dialog>
    </div>
  );
}

function ReportPreviewModal({ report }: { report: ReportRow; }) {
  const printRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [savingImage, setSavingImage] = useState(false);
  useEffect(() => { const upd = () => { if (!wrapperRef.current) return; const w = wrapperRef.current.clientWidth - 16; setScale(w < 794? w / 794 : 1); }; upd(); setTimeout(upd, 150); window.addEventListener("resize", upd); return () => window.removeEventListener("resize", upd); }, []);
  const { data: persons = [] } = useQuery({ queryKey: ["persons-all"], queryFn: async () => { const { data, error } = await supabase.from("persons").select("id, full_name, military_rank, formation, military_number").order("full_name"); if (error) throw error; return data as Person[]; } });
  const { data: entries = [] } = useQuery({ queryKey: ["report-entries", report.id], queryFn: async () => { const { data, error } = await supabase.from("report_entries").select("person_id, status, note").eq("report_id", report.id); if (error) throw error; return data as Entry[]; } });
  const { data: prevEntries = [] } = useQuery({ queryKey: ["report-entries-prev", report.report_date], queryFn: async () => { const { data: prev } = await supabase.from("daily_reports").select("id, report_entries(person_id, status)").lt("report_date", report.report_date).order("report_date", { ascending: false }).limit(1).maybeSingle(); const arr = prev?.report_entries as any; return (arr || []) as { person_id: string; status: AttendanceStatus }[]; } });
  const entryMap = useMemo(() => { const m: Record<string, Entry> = {}; entries.forEach((e) => { m[e.person_id] = e; }); return m; }, [entries]);
  const prevMap = useMemo(() => { const m: Record<string, AttendanceStatus> = {}; prevEntries.forEach((e) => { m[e.person_id] = e.status; }); return m; }, [prevEntries]);
  const byFormation = useMemo(() => { const map: Record<string, Person[]> = {}; PRINT_ROWS.forEach((f) => { (map as any)[f] = []; }); persons.forEach((p) => { if (p.formation && (PRINT_ROWS as any).includes(p.formation)) (map as any)[p.formation].push(p); }); return map; }, [persons]);
  const countsFor = (list: Person[]) => { const c: any = { present: 0, absent: 0, leave: 0, sick: 0, permit: 0, mission: 0, course: 0, other: 0 }; list.forEach((p) => { const s = entryMap[p.id]?.status || "present"; c[s]++; }); const absentAll = c.absent + c.mission + c.other; const total = list.length; const present = total - (c.leave + c.permit + absentAll + c.sick + c.course); return { total, present, leave: c.leave, permit: c.permit, absent: absentAll, sick: c.sick, course: c.course }; };
  const changes = useMemo(() => { if (prevEntries.length === 0) return { newLeave: [] as Person[], returned: [] as Person[], newAbsent: [] as Person[], newSick: [] as Person[], newPermit: [] as Person[], newCourse: [] as Person[] }; const newLeave: Person[] = []; const returned: Person[] = []; const newAbsent: Person[] = []; const newSick: Person[] = []; const newPermit: Person[] = []; const newCourse: Person[] = []; persons.forEach((p) => { const now = entryMap[p.id]?.status; const before = prevMap[p.id]; if (!now ||!before) return; if (now!== before) { if (now === "leave") newLeave.push(p); else if (now === "present") returned.push(p); else if (now === "absent" || now === "mission" || now === "other") newAbsent.push(p); else if (now === "sick") newSick.push(p); else if (now === "permit") newPermit.push(p); else if (now === "course") newCourse.push(p); } }); return { newLeave, returned, newAbsent, newSick, newPermit, newCourse }; }, [entryMap, prevMap, persons, prevEntries]);
  const sectionTotals = PRINT_ROWS.map((f) => ({ f, c: countsFor((byFormation as any)[f] || []) }));
  const grand = sectionTotals.reduce((acc, s) => ({ total: acc.total + s.c.total, present: acc.present + s.c.present, leave: acc.leave + s.c.leave, permit: acc.permit + s.c.permit, absent: acc.absent + s.c.absent, sick: acc.sick + s.c.sick, course: acc.course + s.c.course }), { total: 0, present: 0, leave: 0, permit: 0, absent: 0, sick: 0, course: 0 });
  const dateObj = new Date(report.report_date); const weekday = ARABIC_WEEKDAYS[dateObj.getDay()]; const arDate = `${dateObj.getFullYear()}/${dateObj.getMonth() + 1}/${dateObj.getDate()}`;
  const saveAsImage = async () => {
    if (!printRef.current) return;
    setSavingImage(true);
    try {
      const mod = await import("html-to-image");
      const dataUrl = await mod.toPng(printRef.current, { quality: 1, pixelRatio: 3, backgroundColor: "#ffffff", cacheBust: true });
      const a = document.createElement("a"); a.download = `يومية-${report.report_date}.png`; a.href = dataUrl; a.click(); toast.success("تم حفظ الصورة موقعة جاهزة");
    } catch (e: any) {
      const s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.js"; s.onload = async () => {
        try { // @ts-ignore
          const dataUrl = await window.htmlToImage.toPng(printRef.current, { quality: 1, pixelRatio: 3, backgroundColor: "#ffffff" }); const a = document.createElement("a"); a.download = `يومية-${report.report_date}.png`; a.href = dataUrl; a.click(); toast.success("تم حفظ الصورة");
        } catch (err) { toast.error("فشل الحفظ"); } setSavingImage(false);
      }; s.onerror = () => { toast.error("فشل تحميل المكتبة"); setSavingImage(false); }; document.head.appendChild(s); return;
    }
    setSavingImage(false);
  };
  return (
    <DialogContent className="max-w-[98vw] md:max-w-[900px] p-0 bg-transparent border-0 shadow-none gap-0 max-h-[95vh] overflow-y-auto">
      <DialogHeader className="sr-only"><DialogTitle>تقرير {report.report_date}</DialogTitle></DialogHeader>
      <div className="flex justify-center bg-white p-3 rounded-t-xl border sticky top-0 z-20"><Button size="sm" onClick={saveAsImage} disabled={savingImage} className="bg-emerald-700 hover:bg-emerald-800"><ImageIcon className="h-4 w-4 ml-1" /> {savingImage? "جاري الحفظ..." : "حفظ كصورة"}</Button></div>
      <div ref={wrapperRef} className="w-full flex justify-center bg-gray-100 rounded-b-xl p-2 md:p-4 overflow-hidden"><div style={{ width: "794px", height: scale < 1? `${1123 * scale}px` : "auto", transform: `scale(${scale})`, transformOrigin: "top center" }}><div ref={printRef} dir="rtl" className="official-report bg-white text-black shadow-lg" style={{ width: "210mm", minHeight: "297mm", padding: "12mm 14mm", fontFamily: "'Cairo', 'Tahoma', sans-serif", backgroundColor: "#fff", color: "#000", border: "2px solid #000" }}>
        <div className="flex items-start justify-between gap-4"><div style={{ fontSize: "14px", lineHeight: "32px", minWidth: "110px" }}><div>التاريخ: <strong>{arDate}</strong> م</div><div>اليوم: <strong>{weekday}</strong></div></div><div className="flex-1 text-center"><div style={{ fontSize: "16px", fontWeight: 700, marginBottom: "4px" }}>بسم الله الرحمن الرحيم</div><img src={logoUrl} alt="شعار" className="mx-auto" style={{ width: "90px", height: "90px", objectFit: "contain" }} /></div><div style={{ fontSize: "13px", lineHeight: "28px", textAlign: "right", minWidth: "220px" }}><div style={{ fontWeight: 700 }}>قيادة قوات المقاومة الوطنية</div><div>حراس الجمهورية</div><div>قيادة لواء مدفعية المقاومة الوطنية</div><div>قيادة كتيبة الراجمات</div><div style={{ fontWeight: 700 }}>مكتب البطارية الثانية</div></div></div>
        <div className="text-center mt-4 mb-2"><h2 style={{ display: "inline-block", padding: "4px 24px", borderBottom: "2px solid #000", fontSize: "18px", fontWeight: 800 }}>يومية البطارية الثانية راجمات</h2></div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px", marginTop: "8px", border: "1.5px solid #000" }}><thead><tr style={{ backgroundColor: "#f2f2f2" }}><Th w="6%">م</Th><Th w="14%">الصنف</Th><Th>الإجازات</Th><Th>الأذونات</Th><Th>الغياب</Th><Th>المستشفى</Th><Th>الدورة</Th><Th>القوة</Th><Th>الموجود</Th></tr></thead><tbody>{sectionTotals.map((s, i) => (<tr key={s.f}><Td center>{i + 1}</Td><Td center bold>{s.f}</Td><Td center>{s.c.leave || ""}</Td><Td center>{s.c.permit || ""}</Td><Td center>{s.c.absent || ""}</Td><Td center>{s.c.sick || ""}</Td><Td center>{s.c.course || ""}</Td><Td center bold>{s.c.total || ""}</Td><Td center bold>{s.c.present || ""}</Td></tr>))}<tr style={{ backgroundColor: "#f2f2f2", fontWeight: 700 }}><Td center colSpan={2}>الإجمالي</Td><Td center>{grand.leave || 0}</Td><Td center>{grand.permit || 0}</Td><Td center>{grand.absent || 0}</Td><Td center>{grand.sick || 0}</Td><Td center>{grand.course || 0}</Td><Td center>{grand.total || 0}</Td><Td center>{grand.present || 0}</Td></tr></tbody></table>
        <div className="mt-6"><div style={{ textAlign: "center", fontWeight: 700, marginBottom: "8px", fontSize: "16px" }}>التغيرات</div><table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", border: "1.5px solid #000" }}><thead><tr style={{ backgroundColor: "#f2f2f2" }}><Th w="18%">التغير</Th><Th>الاسم</Th><Th w="14%">الرتبة</Th><Th w="12%">الوحدة</Th><Th w="22%">ملاحظات</Th></tr></thead><tbody>{renderChangeRows("خروج إجازة", changes?.newLeave || [], entryMap)}{renderChangeRows("عودة", changes?.returned || [], entryMap)}{renderChangeRows("غياب جديد", changes?.newAbsent || [], entryMap)}{renderChangeRows("مريض جديد", changes?.newSick || [], entryMap)}{renderChangeRows("إذن", changes?.newPermit || [], entryMap)}{renderChangeRows("دورة", changes?.newCourse || [], entryMap)}{Object.values(changes).every((a) => a.length === 0) && <tr><Td center colSpan={5}>لا توجد تغيرات</Td></tr>}</tbody></table></div>
        {report.notes && <div className="mt-4" style={{ fontSize: "14px" }}><strong>ملاحظات: </strong>{report.notes}</div>}
        <div className="flex justify-end mt-20"><div className="w-64 text-center"><div style={{ fontWeight: 700, fontSize: "13px" }}>قائد البطارية</div><div style={{ fontSize: "13px", marginTop: "4px" }}>م2/عبدالنور العامري</div><div style={{ marginTop: "8px", height: "80px", display: "flex", alignItems: "center", justifyContent: "center" }}>{report.commander_signature? <img src={report.commander_signature} alt="توقيع" style={{ maxHeight: "75px", maxWidth: "200px", objectFit: "contain" }} /> : <span style={{ fontSize: "11px", color: "#888" }}>بدون توقيع</span>}</div><div style={{ borderTop: "1.5px solid #000", marginTop: "4px" }}></div></div></div>
      </div></div></div>
      <style>{`.official-report th,.official-report td { border: 1px solid #000; padding: 6px 8px; }`}</style>
    </DialogContent>
  );
}
function Th({ children, w }: { children: React.ReactNode; w?: string }) { return <th style={{ width: w, textAlign: "center", fontWeight: 700 }}>{children}</th>; }
function Td({ children, center, bold, colSpan }: { children?: React.ReactNode; center?: boolean; bold?: boolean; colSpan?: number }) { return <td colSpan={colSpan} style={{ textAlign: center? "center" : "right", fontWeight: bold? 700 : 400 }}>{children}</td>; }
function renderChangeRows(label: string, list: Person[], entryMap: Record<string, Entry>) { if (list.length === 0) return null; return list.map((p) => (<tr key={label + p.id}><Td center bold>{label}</Td><Td>{p.full_name}</Td><Td center>{p.military_rank || "-"}</Td><Td center>{p.formation || "-"}</Td><Td>{entryMap[p.id]?.note || ""}</Td></tr>)); }
