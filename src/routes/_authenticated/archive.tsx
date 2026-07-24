import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FORMATIONS, SERVICE_LOCATIONS } from "@/lib/constants";

export const Route = createFileRoute("/_authenticated/archive")({
  component: ArchivePage,
});

function ArchivePage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [formation, setFormation] = useState<string>("all");
  const [location, setLocation] = useState<string>("all");

  const { data: persons = [] } = useQuery({
    queryKey: ["persons-all"],
    queryFn: async () => (await supabase.from("persons").select("id, full_name, military_number, formation")).data ?? [],
  });
  const personById = (id: string | null) => persons.find((p) => p.id === id);

  const { data: reports = [] } = useQuery({
    queryKey: ["arch-reports", from, to],
    queryFn: async () => {
      let q = supabase.from("daily_reports").select("*").order("report_date", { ascending: false });
      if (from) q = q.gte("report_date", from);
      if (to) q = q.lte("report_date", to);
      return (await q).data ?? [];
    },
  });
  const { data: services = [] } = useQuery({
    queryKey: ["arch-services", from, to, location],
    queryFn: async () => {
      let q = supabase.from("services").select("*").order("service_date", { ascending: false });
      if (from) q = q.gte("service_date", from);
      if (to) q = q.lte("service_date", to);
      if (location !== "all") q = q.eq("location", location);
      return (await q).data ?? [];
    },
  });
  const { data: leaves = [] } = useQuery({
  queryKey: ["arch-leaves", from, to],
  queryFn: async () => {

    const { data: leaveData, error } =
      await supabase
        .from("leaves")
        .select("*")
        .order("start_date", { ascending: false });


    if (error) throw error;


    const personIds = data
  .map((x) => x.person_id)
  .filter((id): id is string => !!id);

    let personsMap: Record<string, any> = {};


    if (personIds.length) {

      const { data: personsData } =
        await supabase
          .from("persons")
          .select(
            "id, full_name, military_number, formation"
          )
          .in("id", personIds);


      (personsData ?? []).forEach((p) => {
        personsMap[p.id] = p;
      });

    }


    return (leaveData ?? []).map((l) => ({
      ...l,
      persons: l.person_id
        ? personsMap[l.person_id] ?? null
        : null,
    }));

  },
});

  const matchesSearch = (p?: { full_name?: string | null; military_number?: string | null; formation?: string | null } | null) => {
    if (!search) return true;
    if (!p) return false;
    const s = search;
    return (p.full_name ?? "").includes(s) || (p.military_number ?? "").includes(s) || (p.formation ?? "").includes(s);
  };
  const matchesFormation = (p?: { formation?: string | null } | null) => formation === "all" || p?.formation === formation;

  const filteredServices = services.filter((s) => {
    const memberIds = [s.member_1, s.member_2, s.member_3, s.member_4, s.member_5, s.member_6];
    const ps = memberIds.map(personById);
    return ps.some((p) => matchesSearch(p) && matchesFormation(p));
  });

  const filteredLeaves = leaves.filter((l) => {
    const p = l.persons as { full_name: string | null; military_number: string | null; formation: string | null } | null;
    return matchesSearch(p) && matchesFormation(p);
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">الأرشيف والبحث</h1>
        <p className="text-muted-foreground text-sm mt-1">استعراض السجلات السابقة</p>
      </div>

      <Card>
        <CardHeader><CardTitle>تصفية</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div><Label>من تاريخ</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><Label>إلى تاريخ</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <div>
            <Label>بحث</Label>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="اسم / رقم عسكري" />
          </div>
          <div>
            <Label>التشكيل</Label>
            <Select value={formation} onValueChange={setFormation}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                {FORMATIONS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>موقع الخدمة</Label>
            <Select value={location} onValueChange={setLocation}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                {SERVICE_LOCATIONS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="reports">
        <TabsList>
          <TabsTrigger value="reports">التقارير ({reports.length})</TabsTrigger>
          <TabsTrigger value="services">الخدمات ({filteredServices.length})</TabsTrigger>
          <TabsTrigger value="leaves">الإجازات ({filteredLeaves.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="reports">
          <Card><CardContent className="pt-6">
            <Table>
              <TableHeader><TableRow><TableHead>التاريخ</TableHead><TableHead>الحالة</TableHead><TableHead>ملاحظات</TableHead></TableRow></TableHeader>
              <TableBody>
                {reports.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.report_date}</TableCell>
                    <TableCell>{r.approved_at ? "معتمد" : "مسودة"}</TableCell>
                    <TableCell>{r.notes ?? "-"}</TableCell>
                  </TableRow>
                ))}
                {reports.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">لا توجد نتائج</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="services">
          <Card><CardContent className="pt-6">
            <Table>
              <TableHeader><TableRow>
                <TableHead>التاريخ</TableHead><TableHead>الموقع</TableHead>
                <TableHead>الأفراد</TableHead><TableHead>المستلم</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filteredServices.map((s) => {
                  const memberIds = [s.member_1, s.member_2, s.member_3, s.member_4, s.member_5, s.member_6];
                  const names = memberIds.map((id) => personById(id)?.full_name).filter(Boolean).join("، ");
                  return (
                    <TableRow key={s.id}>
                      <TableCell>{s.service_date}</TableCell>
                      <TableCell>{s.location}</TableCell>
                      <TableCell className="text-sm">{names || "-"}</TableCell>
                      <TableCell>{s.recipient ?? "-"}</TableCell>
                    </TableRow>
                  );
                })}
                {filteredServices.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">لا توجد نتائج</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="leaves">
          <Card><CardContent className="pt-6">
            <Table>
              <TableHeader><TableRow>
                <TableHead>الفرد</TableHead><TableHead>النوع</TableHead>
                <TableHead>من</TableHead><TableHead>إلى</TableHead><TableHead>الحالة</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filteredLeaves.map((l) => {
                  const p = l.persons as { full_name: string } | null;
                  return (
                    <TableRow key={l.id}>
                      <TableCell>{p?.full_name ?? "-"}</TableCell>
                      <TableCell>{l.leave_type}</TableCell>
                      <TableCell>{l.start_date}</TableCell>
                      <TableCell>{l.end_date}</TableCell>
                      <TableCell>{l.status}</TableCell>
                    </TableRow>
                  );
                })}
                {filteredLeaves.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">لا توجد نتائج</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
