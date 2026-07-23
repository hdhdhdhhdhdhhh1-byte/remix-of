import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
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
const printRef = useRef(null);
const [selectedId, setSelectedId] = useState<string | null>(null);

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
.select("id, report_entries(person_id, status)")
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
if (!selected || prevEntries.length === 0) return null;
const newLeave: Person[] = [], returned: Person[] = [], newAbsent: Person[] = [],
newSick: Person[] = [], newPermit: Person[] = [], newCourse: Person[] = [];
persons.forEach((p) => {
const now = entryMap[p.id]?.status;
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
qc.invalidateQueries({ queryKey: ["reports-list"] });
qc.invalidateQueries({ queryKey: ["report"] });
toast.success("تم إلغاء اعتماد التقرير");
},
onError: (e: Error) => toast.error("خطأ: " + (e.message ?? "تعذر إلغاء الاعتماد")),
});

if (!canView) {
return

ليس لديك صلاحية عرض التقارير

;
}

const dateObj = selected ? new Date(selected.report_date) : null;
const weekday = dateObj ? ARABIC_WEEKDAYS[dateObj.getDay()] : "";
const arDate = dateObj
? ${dateObj.getFullYear()}/${dateObj.getMonth() + 1}/${dateObj.getDate()}
: "";

return (

التقارير المحفوظة

{reports.length === 0 && (

لا توجد تقارير

)}
{reports.map((r) => {
const isActive = selected?.id === r.id;
return (
<button
key={r.id}
onClick={() => setSelectedId(r.id)}
className={w-full text-right px-4 py-3 border-b hover:bg-muted transition-colors flex items-center justify-between gap-2 ${ isActive ? "bg-muted" : "" }}

{r.report_date}

{r.approved_at ? (
معتمد
) : (
مسودة
)}

);
})}

{selected ? ( 

تقرير {selected.report_date} {selected.approved_at ? ( معتمد ) : ( مسودة )} {selected.edited_after_approval && ( تم التعديل بعد الاعتماد )} 

printRef.current && printElement(printRef.current)}> طباعة printRef.current && exportElementAsPDF(printRef.current, `يومية-${selected.report_date}`)}> PDF {selected.approved_at && canCancelApproval && ( إلغاء الاعتماد تأكيد إلغاء الاعتماد سيتم فتح التقرير للتعديل مرة أخرى. هل أنت متأكد؟ إلغاء cancelMut.mutate()}>تأكيد )} 

{/* Printable block */} 

التاريخ: {arDate} م

اليوم: {weekday}

بسم الله الرحمن الرحيم

قيادة قوات المقاومة الوطنية

حراس الجمهورية

قيادة لواء مدفعية المقاومة الوطنية

قيادة كتيبة الراجمات

مكتب البطارية الثانية

يومية البطارية الثانية راجمات 

مالصنف الإجازاتالأذوناتالغياب المستشفىالدورةالقوةالموجود {sectionTotals.map((s, i) => ( {i + 1} {s.f} {s.c.leave || ""} {s.c.permit || ""} {s.c.absent || ""} {s.c.sick || ""} {s.c.course || ""} {s.c.total || ""} {s.c.present || ""} ))} الإجمالي {grand.leave || 0} {grand.permit || 0} {grand.absent || 0} {grand.sick || 0} {grand.course || 0} {grand.total || 0} {grand.present || 0} 

التغيرات (لهذا اليوم فقط)

التغير الاسم الرتبة الوحدة ملاحظات {renderChangeRows("خروج إجازة", changes?.newLeave ?? [], entryMap)} {renderChangeRows("عودة", changes?.returned ?? [], entryMap)} {renderChangeRows("غياب جديد", changes?.newAbsent ?? [], entryMap)} {renderChangeRows("مريض جديد", changes?.newSick ?? [], entryMap)} {renderChangeRows("إذن", changes?.newPermit ?? [], entryMap)} {renderChangeRows("دورة", changes?.newCourse ?? [], entryMap)} {(!changes || (changes.newLeave.length + changes.returned.length + changes.newAbsent.length + changes.newSick.length + changes.newPermit.length + changes.newCourse.length === 0)) && ( لا توجد تغيرات )} 

{selected.notes && ( 

ملاحظات: {selected.notes} 

)} 

أركان حرب البطارية

قائد البطارية

) : ( اختر تقريراً من القائمة لعرضه )} {` @media print { @page { size: A4; margin: 10mm; } body * { visibility: hidden; } .official-report, .official-report * { visibility: visible; } .official-report { position: absolute; inset: 0; margin: 0 auto; } } .official-report th, .official-report td { border: 1px solid #000; padding: 6px 8px; } `} 

);
}

function Th({ children, w }: { children: React.ReactNode; w?: string }) {
return <th style={{ width: w, textAlign: "center", fontWeight: 700 }}>{children};
}
function Td({ children, center, bold, colSpan }: { children?: React.ReactNode; center?: boolean; bold?: boolean; colSpan?: number }) {
return <td colSpan={colSpan} style={{ textAlign: center ? "center" : "right", fontWeight: bold ? 700 : 400 }}>{children};
}

function renderChangeRows(
label: string,
list: Person[],
entryMap: Record<string, Entry>,
) {
if (list.length === 0) return null;
return list.map((p) => (

{label} {p.full_name} {p.military_rank ?? "-"} {p.formation ?? "-"} {entryMap[p.id]?.note ?? ""} 

));
}


