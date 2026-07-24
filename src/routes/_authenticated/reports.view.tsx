import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Printer, FileDown, RotateCcw, CheckCircle2, FileText } from "lucide-react";
import { type AttendanceStatus } from "@/lib/constants";
import { exportElementAsPDF, printElement } from "@/lib/export";
import logoUrl from "@/assets/resistance-logo.jpg";

export const Route = createFileRoute("/_authenticated/reports/view")({
  component: ReportsViewPage,
});

const PRINT_ROWS = ["الضباط", "ف١", "ف٢", "ق س", "ق ك"] as const;
const ARABIC_WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

interface Person {
  id: string;
  full_name: string;
  military_rank: string | null;
  formation: string | null;
  military_number: string | null;
}
interface Entry { person_id: string; status: AttendanceStatus; note: string | null }
interface ReportRow {
  id: string;
  report_date: string;
  notes: string | null;
  approved_at: string | null;
  edited_after_approval?: boolean | null;
}

function ReportsViewPage() {
  const { can, isAdmin, user } = useAuth();
  const canCancelApproval = isAdmin || can("reports_view", "cancel_approval") || can("reports_entry", "cancel_approval");
  const canView = isAdmin || can("reports_view", "view");
  const qc = useQueryClient();
  const printRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const updateScale = () => {
      if (!wrapperRef.current) return;
      const containerWidth = wrapperRef.current.clientWidth - 16;
      const reportWidth = 794;
      if (containerWidth < reportWidth) {
        setScale(containerWidth / reportWidth);
      } else {
        setScale(1);
      }
    };
    updateScale();
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, []);

  const { data: reports = [] } = useQuery({
    queryKey: ["reports-list-approved"],
    enabled: canView,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_reports")
        .select("id, report_date, notes, approved_at, edited_after_approval")
        .not("approved_at", "is", null)
        .order("report_date", { ascending: false })
        .limit(365);
      if (error) throw error;
      return (data ?? []) as ReportRow[];
    },
  });

  const selected = useMemo(
    () => reports.find((r) => r.id === selectedId) ?? reports[0] ?? null,
    [reports, selectedId]
  );

  const { data: persons = [] } = useQuery({
    queryKey: ["persons-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("persons")
        .select("id, full_name, military_rank, formation, military_number")
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as Person[];
    },
  });

  const { data: entries = [] } = useQuery({
    queryKey: ["report-entries", selected?.id],
    enabled: !!selected?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("report_entries")
        .select("person_id, status, note")
        .eq("report_id", selected!.id);
      if (error) throw error;
      return (data ?? []) as Entry[];
    },
  });

  const { data: prevEntries = [] } = useQuery({
    queryKey: ["report-entries-prev", selected?.report_date],
    enabled: !!selected?.report_date,
    queryFn: async () => {
      const { data: prev } = await supabase
        .from("daily_reports")
        .select("id, report_date, report_entries(person_id, status)")
        .lt("report_date", selected!.report_date)
        .order("report_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      const ents = (prev?.report_entries ?? []) as { person_id: string; status: AttendanceStatus }[];
      return ents;
    },
  });

  const entryMap = useMemo(() => {
    const m: Record<string, Entry> = {};
    entries.forEach((e) => { m[e.person_id] = e; });
    return m;
  }, [entries]);

  const prevMap = useMemo(() => {
    const m: Record<string, AttendanceStatus> = {};
    prevEntries.forEach((e) => { m[e.person_id] = e.status; });
    return m;
  }, [prevEntries]);

  const byFormation = useMemo(() => {
    const map: Record<string, Person[]> = {};
    PRINT_ROWS.forEach((f) => (map[f] = []));
    persons.forEach((p) => {
      if (p.formation && (PRINT_ROWS as readonly string[]).includes(p.formation)) {
        map[p.formation].push(p);
      }
    });
    return map;
  }, [persons]);

  const countsFor = (list: Person[]) => {
    const c: Record<AttendanceStatus, number> = {
      present: 0, absent: 0, leave: 0, sick: 0, permit: 0, mission: 0, course: 0, other: 0,
    };
    list.forEach((p) => { const s = entryMap[p.id]?.status ?? "present"; c[s]++; });
    const absentAll = c.absent + c.mission + c.other;
    const total = list.length;
    const present = total - (c.leave + c.permit + absentAll + c.sick + c.course);
    return { total, present, leave: c.leave, permit: c.permit, absent: absentAll, sick: c.sick, course: c.course };
  };

  const changes = useMemo(() => {
    if (!selected) return null;
    if (prevEntries.length === 0) {
      return { newLeave: [] as Person[], returned: [] as Person[], newAbsent: [] as Person[], newSick: [] as Person[], newPermit: [] as Person[], newCourse: [] as Person[] };
    }
    const newLeave: Person[] = [], returned: Person[] = [], newAbsent: Person[] = [],
      newSick: Person[] = [], newPermit: Person[] = [], newCourse: Person[] = [];
    persons.forEach((p) => {
      const now = entryMap[p.id]?.status;
      const before = prevMap[p.id];
      if (!now || !before) return;
      if (now === "leave" && before !== "leave") newLeave.push(p);
      if (before !== "present" && now === "present") returned.push(p);
      if ((now === "absent" || now === "mission" || now === "other") &&
          !(before === "absent" || before === "mission" || before === "other")) newAbsent.push(p);
      if (now === "sick" && before !== "sick") newSick.push(p);
      if (now === "permit" && before !== "permit") newPermit.push(p);
      if (now === "course" && before !== "course") newCourse.push(p);
    });
    return { newLeave, returned, newAbsent, newSick, newPermit, newCourse };
  }, [entryMap, prevMap, persons, prevEntries, selected]);

  const sectionTotals = PRINT_ROWS.map((f) => ({ f, c: countsFor(byFormation[f] ?? []) }));
  const grand = sectionTotals.reduce(
    (acc, s) => ({
      total: acc.total + s.c.total, present: acc.present + s.c.present,
      leave: acc.leave + s.c.leave, permit: acc.permit + s.c.permit,
      absent: acc.absent + s.c.absent, sick: acc.sick + s.c.sick, course: acc.course + s.c.course,
    }),
    { total: 0, present: 0, leave: 0, permit: 0, absent: 0, sick: 0, course: 0 }
  );

  const cancelMut = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("لم يتم اختيار تقرير");
      const { error } = await supabase
        .from("daily_reports")
        .update({ approved_at: null, approved_by: null })
        .eq("id", selected.id);
      if (error) throw error;
      await supabase.from("audit_log").insert({
        user_id: user?.id, action: "cancel_approval",
        entity: "daily_reports", entity_id: selected.id,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reports-list-approved"] });
      qc.invalidateQueries({ queryKey: ["report"] });
      toast.success("تم إلغاء اعتماد التقرير");
    },
    onError: (e: Error) => toast.error("خطأ: " + (e.message ?? "تعذر إلغاء الاعتماد")),
  });

  if (!canView) {
    return <div className="text-center text-muted-foreground py-8">ليس لديك صلاحية عرض التقارير</div>;
  }

  const dateObj = selected ? new Date(selected.report_date) : null;
  const weekday = dateObj ? ARABIC_WEEKDAYS[dateObj.getDay()] : "";
  const arDate = dateObj ? `${dateObj.getFullYear()}/${dateObj.getMonth() + 1}/${dateObj.getDate()}` : "";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
      <div className="print:hidden border rounded-lg bg-card">
        <div className="p-4 border-b"><h3 className="font-bold text-base">التقارير المحفوظة</h3></div>
        <div className="max-h-[70vh] overflow-y-auto">
          {reports.length === 0 && <div className="p-4 text-sm text-muted-foreground text-center">لا توجد تقارير</div>}
          {reports.map((r) => {
            const isActive = selected?.id === r.id;
            return (
              <button key={r.id} onClick={() => setSelectedId(r.id)}
                className={`w-full text-right px-4 py-3 border-b hover:bg-muted transition-colors flex items-center justify-between gap-2 ${isActive ? "bg-muted" : ""}`}>
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium text-sm">{r.report_date}</span>
                </div>
                {r.approved_at ? <Badge className="bg-emerald-600">معتمد</Badge> : <Badge variant="secondary">مسودة</Badge>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-4">
        {selected ? (
          <>
            <div className="flex flex-wrap gap-2 items-center justify-between print:hidden">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold">تقرير {selected.report_date}</h2>
                {selected.approved_at ? <Badge className="bg-emerald-600"><CheckCircle2 className="h-3 w-3 ml-1" /> معتمد</Badge> : <Badge variant="secondary">مسودة</Badge>}
                {selected.edited_after_approval && <Badge variant="destructive">تم التعديل بعد الاعتماد</Badge>}
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={() => printRef.current && printElement(printRef.current)}><Printer className="h-4 w-4 ml-1" /> طباعة</Button>
                <Button variant="outline" size="sm" onClick={() => printRef.current && exportElementAsPDF(printRef.current, `يومية-${selected.report_date}`)}><FileDown className="h-4 w-4 ml-1" /> PDF</Button>
                {selected.approved_at && canCancelApproval && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild><Button variant="destructive" size="sm"><RotateCcw className="h-4 w-4 ml-1" /> إلغاء الاعتماد</Button></AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader><AlertDialogTitle>تأكيد إلغاء الاعتماد</AlertDialogTitle><AlertDialogDescription>سيتم فتح التقرير للتعديل مرة أخرى. هل أنت متأكد؟</AlertDialogDescription></AlertDialogHeader>
                      <AlertDialogFooter><AlertDialogCancel>إلغاء</AlertDialogCancel><AlertDialogAction onClick={() => cancelMut.mutate()}>تأكيد</AlertDialogAction></AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </div>

            {/* Responsive wrapper - mobile friendly */}
            <div ref={wrapperRef} className="w-full flex justify-center bg-gray-100/50 rounded-xl p-2 md:p-4 overflow-hidden">
              <div
                style={{
                  width: "794px",
                  height: scale < 1 ? `${1123 * scale}px` : "auto",
                  transform: `scale(${scale})`,
                  transformOrigin: "top center",
                  transition: "transform 0.2s ease",
                }}
              >
                <div ref={printRef} dir="rtl" className="official-report bg-white text-black shadow-lg"
                  style={{ width: "210mm", minHeight: "297mm", padding: "12mm 14mm", fontFamily: "'Cairo', 'Tahoma', sans-serif" }}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="text-sm leading-8 min-w-[110px]"><div>التاريخ: <strong>{arDate}</strong> م</div><div>اليوم: <strong>{weekday}</strong></div></div>
                    <div className="flex-1 text-center"><div className="text-base font-bold mb-1">بسم الله الرحمن الرحيم</div><img src={logoUrl} alt="شعار" className="mx-auto" style={{ width: "90px", height: "90px", objectFit: "contain" }} /></div>
                    <div className="text-sm leading-7 text-right min-w-[220px]"><div className="font-bold">قيادة قوات المقاومة الوطنية</div><div>حراس الجمهورية</div><div>قيادة لواء مدفعية المقاومة الوطنية</div><div>قيادة كتيبة الراجمات</div><div className="font-bold">مكتب البطارية الثانية</div></div>
                  </div>

                  <div className="text-center mt-4 mb-2"><h2 className="inline-block px-6 py-1 border-b-2 border-black text-lg font-bold">يومية البطارية الثانية راجمات</h2></div>

                  <table className="w-full border-collapse text-sm mt-2" style={{ border: "1.5px solid #000" }}>
                    <thead><tr className="bg-gray-100"><Th w="6%">م</Th><Th w="14%">الصنف</Th><Th>الإجازات</Th><Th>الأذونات</Th><Th>الغياب</Th><Th>المستشفى</Th><Th>الدورة</Th><Th>القوة</Th><Th>الموجود</Th></tr></thead>
                    <tbody>
                      {sectionTotals.map((s, i) => (
                        <tr key={s.f}><Td center>{i + 1}</Td><Td center bold>{s.f}</Td><Td center>{s.c.leave || ""}</Td><Td center>{s.c.permit || ""}</Td><Td center>{s.c.absent || ""}</Td><Td center>{s.c.sick || ""}</Td><Td center>{s.c.course || ""}</Td><Td center bold>{s.c.total || ""}</Td><Td center bold>{s.c.present || ""}</Td></tr>
                      ))}
                      <tr className="bg-gray-100 font-bold"><Td center colSpan={2}>الإجمالي</Td><Td center>{grand.leave || 0}</Td><Td center>{grand.permit || 0}</Td><Td center>{grand.absent || 0}</Td><Td center>{grand.sick || 0}</Td><Td center>{grand.course || 0}</Td><Td center>{grand.total || 0}</Td><Td center>{grand.present || 0}</Td></tr>
                    </tbody>
                  </table>

                  <div className="mt-6">
                    <div className="text-center font-bold mb-2 text-base">التغيرات (لهذا اليوم فقط)</div>
                    <table className="w-full border-collapse text-sm" style={{ border: "1.5px solid #000" }}>
                      <thead><tr className="bg-gray-100"><Th w="18%">التغير</Th><Th>الاسم</Th><Th w="14%">الرتبة</Th><Th w="12%">الوحدة</Th><Th w="22%">ملاحظات</Th></tr></thead>
                      <tbody>
                        {renderChangeRows("خروج إجازة", changes?.newLeave ?? [], entryMap)}
                        {renderChangeRows("عودة", changes?.returned ?? [], entryMap)}
                        {renderChangeRows("غياب جديد", changes?.newAbsent ?? [], entryMap)}
                        {renderChangeRows("مريض جديد", changes?.newSick ?? [], entryMap)}
                        {renderChangeRows("إذن", changes?.newPermit ?? [], entryMap)}
                        {renderChangeRows("دورة", changes?.newCourse ?? [], entryMap)}
                        {(changes && Object.values(changes).every(a => a.length === 0)) && <tr><Td center colSpan={5}>لا توجد تغيرات عن اليوم السابق</Td></tr>}
                      </tbody>
                    </table>
                  </div>

                  {selected.notes && <div className="mt-4 text-sm"><strong>ملاحظات: </strong>{selected.notes}</div>}

                  <div className="grid grid-cols-2 gap-8 mt-16 text-sm text-center"><div><div className="border-t border-black pt-1">أركان حرب البطارية</div></div><div><div className="border-t border-black pt-1">قائد البطارية</div></div></div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="p-8 text-center text-muted-foreground border rounded-lg">اختر تقريراً من القائمة لعرضه</div>
        )}
      </div>

      <style>{`
        @media print {
          @page { size: A4; margin: 10mm; }
          body * { visibility: hidden !important; }
          .official-report, .official-report * { visibility: visible !important; }
          .official-report { 
            position: absolute !important; 
            inset: 0 !important; 
            margin: 0 auto !important;
            transform: none !important;
            width: 210mm !important;
            box-shadow: none !important;
          }
        }
        .official-report th, .official-report td { border: 1px solid #000; padding: 6px 8px; }
      `}</style>
    </div>
  );
}

function Th({ children, w }: { children: React.ReactNode; w?: string }) {
  return <th style={{ width: w, textAlign: "center", fontWeight: 700 }}>{children}</th>;
}
function Td({ children, center, bold, colSpan }: { children?: React.ReactNode; center?: boolean; bold?: boolean; colSpan?: number }) {
  return <td colSpan={colSpan} style={{ textAlign: center ? "center" : "right", fontWeight: bold ? 700 : 400 }}>{children}</td>;
}

function renderChangeRows(label: string, list: Person[], entryMap: Record<string, Entry>) {
  if (list.length === 0) return null;
  return list.map((p) => (
    <tr key={label + p.id}>
      <Td center bold>{label}</Td><Td>{p.full_name}</Td><Td center>{p.military_rank ?? "-"}</Td><Td center>{p.formation ?? "-"}</Td><Td>{entryMap[p.id]?.note ?? ""}</Td>
    </tr>
  ));
}

