import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Save, CheckCircle2, Printer, FileDown } from "lucide-react";
import { FORMATIONS, STATUS_LABEL, ATTENDANCE_STATUSES, type AttendanceStatus } from "@/lib/constants";
import { exportElementAsPDF, printElement } from "@/lib/export";
import logoUrl from "@/assets/resistance-logo.jpg";

export const Route = createFileRoute("/_authenticated/reports/")({
  component: ReportsPage,
});

interface Person { id: string; full_name: string; military_rank: string | null; formation: string | null; military_number: string | null; }

// Print order matches the official form
const PRINT_ROWS: string[] = ["الضباط", "ف١", "ف٢", "ق س", "ق ك"];

const ARABIC_WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

function ReportsPage() {
  const { can, isAdmin, user } = useAuth();
  const canEdit = isAdmin || can("reports_entry", "edit") || can("reports_entry", "add");
  const canApprove = isAdmin || can("reports_entry", "approve");
  const canViewEntry = isAdmin || can("reports_entry", "view");
  const qc = useQueryClient();
  const printRef = useRef<HTMLDivElement>(null);

  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10));
  const [entries, setEntries] = useState<Record<string, { status: AttendanceStatus; note: string }>>({});
  const [notes, setNotes] = useState("");

  const { data: persons = [] } = useQuery({
    queryKey: ["persons-active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("persons")
        .select("id, full_name, military_rank, formation, military_number")
        .eq("active", true).order("full_name");
      if (error) throw error;
      return data as Person[];
    },
  });

  const { data: report } = useQuery({
    queryKey: ["report", reportDate],
    queryFn: async () => {
      const { data } = await supabase.from("daily_reports")
        .select("*, report_entries(*)").eq("report_date", reportDate).maybeSingle();
      return data;
    },
  });

  const { data: prevReport } = useQuery({
    queryKey: ["prev-report", reportDate],
    queryFn: async () => {
      const { data } = await supabase.from("daily_reports")
        .select("id, report_date, report_entries(person_id, status)")
        .lt("report_date", reportDate)
        .not("approved_at", "is", null)
        .order("report_date", { ascending: false })
        .limit(1).maybeSingle();
      return data;
    },
  });

  useEffect(() => {
  if (report && "report_entries" in report) {

    const map: Record<string, { status: AttendanceStatus; note: string }> = {};

    const ents = (report.report_entries ?? []) as {
      person_id: string;
      status: AttendanceStatus;
      note: string | null;
    }[];

    ents.forEach((e) => {
      map[e.person_id] = {
        status: e.status,
        note: e.note ?? "",
      };
    });

    setEntries(map);
    setNotes((report as { notes?: string | null }).notes ?? "");

  } else {

    const map: Record<string, { status: AttendanceStatus; note: string }> = {};

    persons.forEach((p) => {

      map[p.id] = {
        status: prevMap[p.id] ?? "present",
        note: "",
      };

    });

    setEntries(map);

    // لا ننقل ملاحظات اليوم السابق
    setNotes("");

  }

}, [report, persons, prevMap]);

  const byFormation = useMemo(() => {
    const map: Record<string, Person[]> = {};
    PRINT_ROWS.forEach((f) => (map[f] = []));
    map["أخرى"] = [];
    persons.forEach((p) => {
      const key = p.formation && PRINT_ROWS.includes(p.formation) ? p.formation : "أخرى";
      map[key].push(p);
    });
    return map;
  }, [persons]);

  const prevMap = useMemo(() => {
    const m: Record<string, AttendanceStatus> = {};
    if (prevReport) {
      const ents = (prevReport.report_entries ?? []) as { person_id: string; status: AttendanceStatus }[];
      ents.forEach((e) => { m[e.person_id] = e.status; });
    }
    return m;
  }, [prevReport]);

  const countsFor = (list: Person[]) => {
    const c: Record<AttendanceStatus, number> = {
      present: 0, absent: 0, leave: 0, sick: 0, permit: 0, mission: 0, course: 0, other: 0,
    };
    list.forEach((p) => { const s = entries[p.id]?.status ?? "present"; c[s]++; });
    // "الغياب" in the official form folds mission/other into absent
    const absentAll = c.absent + c.mission + c.other;
    const total = list.length;
    const present = total - (c.leave + c.permit + absentAll + c.sick + c.course);
    return {
      total,
      present,
      leave: c.leave,
      permit: c.permit,
      absent: absentAll,
      sick: c.sick,
      course: c.course,
      raw: c,
    };
  };

  const setStatus = (personId: string, status: AttendanceStatus) => {
    setEntries((prev) => ({ ...prev, [personId]: { status, note: prev[personId]?.note ?? "" } }));
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      let reportId = report?.id as string | undefined;
      if (!reportId) {
        const { data, error } = await supabase.from("daily_reports")
          .insert({ report_date: reportDate, notes, created_by: user?.id }).select().single();
        if (error) throw error;
        reportId = data.id;
      } else {
        await supabase.from("daily_reports").update({ notes }).eq("id", reportId);
        await supabase.from("report_entries").delete().eq("report_id", reportId);
      }
      const rows = Object.entries(entries).map(([person_id, v]) => ({
        report_id: reportId!, person_id, status: v.status, note: v.note || null,
      }));
      if (rows.length > 0) {
        const { error } = await supabase.from("report_entries").insert(rows);
        if (error) throw error;
      }
      await supabase.from("audit_log").insert({ user_id: user?.id, action: "save", entity: "daily_reports", entity_id: reportId });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["report"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast.success("تم حفظ التقرير");
    },
    onError: (e: Error) => toast.error("خطأ: " + e.message),
  });

  const approveMut = useMutation({
    mutationFn: async () => {
      if (!report) throw new Error("احفظ التقرير أولاً");
      const wasApprovedBefore = !!(report as { edited_after_approval?: boolean | null; approved_at?: string | null }).edited_after_approval
        || false;
      const { data: existing } = await supabase.from("daily_reports")
        .select("id, approved_at, edited_after_approval").eq("id", report.id).maybeSingle();
      const reapproving = !!existing?.edited_after_approval || wasApprovedBefore;
      const { error } = await supabase.from("daily_reports")
        .update({
          approved_at: new Date().toISOString(),
          approved_by: user?.id,
          edited_after_approval: reapproving,
        }).eq("id", report.id);
      if (error) throw error;
      await supabase.from("audit_log").insert({ user_id: user?.id, action: "approve", entity: "daily_reports", entity_id: report.id });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["report"] }); toast.success("تم اعتماد التقرير"); },
    onError: (e: Error) => toast.error("خطأ: " + e.message),
  });

  // Changes vs previous report — names shown ONLY here
  const changes = useMemo(() => {
    if (!prevReport) return null;
    const newLeave: Person[] = [], returned: Person[] = [], newAbsent: Person[] = [],
      newSick: Person[] = [], newPermit: Person[] = [], newCourse: Person[] = [];
    persons.forEach((p) => {
      const now = entries[p.id]?.status;
      const before = prevMap[p.id];
      if (!now) return;
      if (now === "leave" && before !== "leave") newLeave.push(p);
      if (before && before !== "present" && now === "present") returned.push(p);
      if ((now === "absent" || now === "mission" || now === "other") &&
          !(before === "absent" || before === "mission" || before === "other")) newAbsent.push(p);
      if (now === "sick" && before !== "sick") newSick.push(p);
      if (now === "permit" && before !== "permit") newPermit.push(p);
      if (now === "course" && before !== "course") newCourse.push(p);
    });
    return { newLeave, returned, newAbsent, newSick, newPermit, newCourse };
  }, [entries, persons, prevMap, prevReport]);

  // Totals across all sections
  const sectionTotals = PRINT_ROWS.map((f) => ({ f, c: countsFor(byFormation[f] ?? []) }));
  const grand = sectionTotals.reduce(
    (acc, s) => ({
      total: acc.total + s.c.total,
      present: acc.present + s.c.present,
      leave: acc.leave + s.c.leave,
      permit: acc.permit + s.c.permit,
      absent: acc.absent + s.c.absent,
      sick: acc.sick + s.c.sick,
      course: acc.course + s.c.course,
    }),
    { total: 0, present: 0, leave: 0, permit: 0, absent: 0, sick: 0, course: 0 }
  );

  const approved = !!report?.approved_at;
  const dateObj = new Date(reportDate);
  const weekday = ARABIC_WEEKDAYS[dateObj.getDay()];
  const arDate = `${dateObj.getFullYear()}/${dateObj.getMonth() + 1}/${dateObj.getDate()}`;

  return (
    <div className="space-y-6">
      {/* ================= Toolbar (screen only) ================= */}
      <div className="flex items-center justify-between flex-wrap gap-4 print:hidden">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">التقرير اليومي</h1>
          <p className="text-muted-foreground text-sm mt-1">إدخال حالات الأفراد؛ يُطبع التقرير الرسمي بالأعداد فقط</p>
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          <div>
            <Label>التاريخ</Label>
            <Input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} className="w-44" />
          </div>
          <Button variant="outline" size="sm" onClick={() => printRef.current && printElement(printRef.current)}>
            <Printer className="h-4 w-4 ml-1" /> طباعة
          </Button>
          <Button variant="outline" size="sm" onClick={() => printRef.current && exportElementAsPDF(printRef.current, `يومية-${reportDate}`)}>
            <FileDown className="h-4 w-4 ml-1" /> PDF
          </Button>
        </div>
      </div>

      {/* ================= Data entry (screen only) ================= */}
      <div className="print:hidden space-y-4">
        {PRINT_ROWS.map((f) => {
          const list = byFormation[f] ?? [];
          if (list.length === 0) return null;
          const c = countsFor(list);
          return (
            <Card key={f}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between flex-wrap gap-2">
                  <span>{f}</span>
                  <div className="text-sm font-normal flex flex-wrap gap-3">
                    <span>القوة: <strong>{c.total}</strong></span>
                    <span className="text-emerald-600">موجود: <strong>{c.present}</strong></span>
                    <span>إجازة: <strong>{c.leave}</strong></span>
                    <span>إذن: <strong>{c.permit}</strong></span>
                    <span className="text-red-600">غياب: <strong>{c.absent}</strong></span>
                    <span>مستشفى: <strong>{c.sick}</strong></span>
                    <span>دورة: <strong>{c.course}</strong></span>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>الرقم العسكري</TableHead>
                        <TableHead>الاسم</TableHead>
                        <TableHead>الرتبة</TableHead>
                        <TableHead>الحالة</TableHead>
                        <TableHead>ملاحظات</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {list.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell>{p.military_number ?? "-"}</TableCell>
                          <TableCell className="font-medium">{p.full_name}</TableCell>
                          <TableCell>{p.military_rank ?? "-"}</TableCell>
                          <TableCell>
                            <Select
                              value={entries[p.id]?.status ?? "present"}
                              onValueChange={(v) => setStatus(p.id, v as AttendanceStatus)}
                              disabled={!canEdit || approved}
                            >
                              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {ATTENDANCE_STATUSES.map((s) => (
                                  <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Input
                              value={entries[p.id]?.note ?? ""}
                              onChange={(e) => setEntries((prev) => ({
                                ...prev,
                                [p.id]: { status: prev[p.id]?.status ?? "present", note: e.target.value },
                              }))}
                              disabled={!canEdit || approved}
                              placeholder="ملاحظات..."
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          );
        })}

        <Card>
          <CardContent className="pt-6">
            <Label>ملاحظات التقرير</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!canEdit || approved} />
          </CardContent>
        </Card>

        {canEdit && (
          <div className="flex gap-2 flex-wrap">
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || approved}>
              <Save className="h-4 w-4 ml-1" /> حفظ
            </Button>
            {canApprove && report && !approved && (
              <Button variant="outline" onClick={() => approveMut.mutate()} disabled={approveMut.isPending}>
                <CheckCircle2 className="h-4 w-4 ml-1" /> اعتماد
              </Button>
            )}
            {approved && (
              <div className="text-sm text-emerald-600 flex items-center">
                <CheckCircle2 className="h-4 w-4 ml-1" /> معتمد
              </div>
            )}
          </div>
        )}
      </div>

      {/* ================= Official print block ================= */}
      <div ref={printRef} dir="rtl" className="official-report bg-white text-black mx-auto" style={{ width: "210mm", minHeight: "297mm", padding: "12mm 14mm", fontFamily: "'Cairo', 'Tahoma', sans-serif" }}>
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          {/* Left: date/day */}
          <div className="text-sm leading-8 min-w-[110px]">
            <div>التاريخ: <strong>{arDate}</strong> م</div>
            <div>اليوم: <strong>{weekday}</strong></div>
          </div>
          {/* Center: logo + bismillah */}
          <div className="flex-1 text-center">
            <div className="text-base font-bold mb-1">بسم الله الرحمن الرحيم</div>
            <img src={logoUrl} alt="شعار المقاومة الوطنية" className="mx-auto" style={{ width: "90px", height: "90px", objectFit: "contain" }} />
          </div>
          {/* Right: military headings */}
          <div className="text-sm leading-7 text-right min-w-[220px]">
            <div className="font-bold">قيادة قوات المقاومة الوطنية</div>
            <div>حراس الجمهورية</div>
            <div>قيادة لواء مدفعية المقاومة الوطنية</div>
            <div>قيادة كتيبة الراجمات</div>
            <div className="font-bold">مكتب البطارية الثانية</div>
          </div>
        </div>

        {/* Title */}
        <div className="text-center mt-4 mb-2">
          <h2 className="inline-block px-6 py-1 border-b-2 border-black text-lg font-bold">يومية البطارية الثانية راجمات</h2>
        </div>

        {/* Main stats table */}
        <table className="w-full border-collapse text-sm mt-2" style={{ border: "1.5px solid #000" }}>
          <thead>
            <tr className="bg-gray-100">
              <Th w="6%">م</Th>
              <Th w="14%">الصنف</Th>
              <Th>الإجازات</Th>
              <Th>الأذونات</Th>
              <Th>الغياب</Th>
              <Th>المستشفى</Th>
              <Th>الدورة</Th>
              <Th>القوة</Th>
              <Th>الموجود</Th>
            </tr>
          </thead>
          <tbody>
            {sectionTotals.map((s, i) => (
              <tr key={s.f}>
                <Td center>{i + 1}</Td>
                <Td center bold>{s.f}</Td>
                <Td center>{s.c.leave || ""}</Td>
                <Td center>{s.c.permit || ""}</Td>
                <Td center>{s.c.absent || ""}</Td>
                <Td center>{s.c.sick || ""}</Td>
                <Td center>{s.c.course || ""}</Td>
                <Td center bold>{s.c.total || ""}</Td>
                <Td center bold>{s.c.present || ""}</Td>
              </tr>
            ))}
            <tr className="bg-gray-100 font-bold">
              <Td center colSpan={2}>الإجمالي</Td>
              <Td center>{grand.leave || 0}</Td>
              <Td center>{grand.permit || 0}</Td>
              <Td center>{grand.absent || 0}</Td>
              <Td center>{grand.sick || 0}</Td>
              <Td center>{grand.course || 0}</Td>
              <Td center>{grand.total || 0}</Td>
              <Td center>{grand.present || 0}</Td>
            </tr>
          </tbody>
        </table>

        {/* Changes section */}
        <div className="mt-6">
          <div className="text-center font-bold mb-2 text-base">التغيرات</div>
          <table className="w-full border-collapse text-sm" style={{ border: "1.5px solid #000" }}>
            <thead>
              <tr className="bg-gray-100">
                <Th w="18%">التغير</Th>
                <Th>الاسم</Th>
                <Th w="14%">الرتبة</Th>
                <Th w="12%">الوحدة</Th>
                <Th w="22%">ملاحظات</Th>
              </tr>
            </thead>
            <tbody>
              {renderChangeRows("خروج إجازة", changes?.newLeave ?? [], entries)}
              {renderChangeRows("عودة", changes?.returned ?? [], entries)}
              {renderChangeRows("غياب جديد", changes?.newAbsent ?? [], entries)}
              {renderChangeRows("مريض جديد", changes?.newSick ?? [], entries)}
              {renderChangeRows("إذن", changes?.newPermit ?? [], entries)}
              {renderChangeRows("دورة", changes?.newCourse ?? [], entries)}
              {(!changes ||
                (changes.newLeave.length + changes.returned.length + changes.newAbsent.length +
                 changes.newSick.length + changes.newPermit.length + changes.newCourse.length === 0)) && (
                <tr><Td center colSpan={5}>لا توجد تغيرات</Td></tr>
              )}
            </tbody>
          </table>
        </div>

        {notes && (
          <div className="mt-4 text-sm">
            <strong>ملاحظات: </strong>{notes}
          </div>
        )}

        {/* Signatures */}
        <div className="grid grid-cols-2 gap-8 mt-16 text-sm text-center">
          <div>
            <div className="border-t border-black pt-1">أركان حرب البطارية</div>
          </div>
          <div>
            <div className="border-t border-black pt-1">قائد البطارية</div>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          @page { size: A4; margin: 10mm; }
          body * { visibility: hidden; }
          .official-report, .official-report * { visibility: visible; }
          .official-report { position: absolute; inset: 0; margin: 0 auto; }
        }
        .official-report th, .official-report td {
          border: 1px solid #000; padding: 6px 8px;
        }
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

function renderChangeRows(
  label: string,
  list: Person[],
  entries: Record<string, { status: AttendanceStatus; note: string }>,
) {
  if (list.length === 0) return null;
  return list.map((p) => (
    <tr key={label + p.id}>
      <Td center bold>{label}</Td>
      <Td>{p.full_name}</Td>
      <Td center>{p.military_rank ?? "-"}</Td>
      <Td center>{p.formation ?? "-"}</Td>
      <Td>{entries[p.id]?.note ?? ""}</Td>
    </tr>
  ));
}

