import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Printer, FileDown, Image as ImageIcon, Eye } from "lucide-react";
import { SERVICE_LOCATIONS } from "@/lib/constants";
import { exportElementAsImage, exportElementAsPDF, printElement } from "@/lib/export";

export const Route = createFileRoute("/_authenticated/services/view")({
  component: ServicesViewPage,
});

interface Person {
  id: string;
  full_name: string;
  military_rank: string | null;
  formation: string | null;
  military_number: string | null;
}
interface ServiceRow {
  id: string;
  service_date: string;
  location: string;
  member_1: string | null; member_2: string | null; member_3: string | null;
  member_4: string | null; member_5: string | null; member_6: string | null;
  recipient: string | null;
  notes: string | null;
  approved_at: string | null;
}

function ServicesViewPage() {
  const { can, isAdmin } = useAuth();
  const canView = isAdmin || can("services_view", "view");
  const canPrint = isAdmin || can("services_view", "print");
  const canPdf = isAdmin || can("services_view", "export_pdf");
  const canImg = isAdmin || can("services_view", "export_image");

  const [searchDate, setSearchDate] = useState<string>("");
  const [openDate, setOpenDate] = useState<string | null>(null);

  const { data: services = [], isLoading } = useQuery({
    queryKey: ["services-approved"],
    enabled: canView,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("*")
        .not("approved_at", "is", null)
        .order("service_date", { ascending: false });
      if (error) throw error;
      return data as ServiceRow[];
    },
  });

  const { data: persons = [] } = useQuery({
    queryKey: ["persons-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("persons")
        .select("id, full_name, military_rank, formation, military_number");
      if (error) throw error;
      return data as Person[];
    },
  });

  const personById = (id: string | null) => persons.find((p) => p.id === id);

  // Group by date
  const byDate = useMemo(() => {
    const m: Record<string, ServiceRow[]> = {};
    services.forEach((s) => {
      (m[s.service_date] ??= []).push(s);
    });
    return m;
  }, [services]);

  const filteredDates = useMemo(() => {
    const dates = Object.keys(byDate);
    if (searchDate) return dates.filter((d) => d === searchDate);
    return dates;
  }, [byDate, searchDate]);

  if (!canView) {
    return <div className="text-center text-muted-foreground py-8">ليس لديك صلاحية عرض الخدمات</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="text-sm text-muted-foreground">بحث بالتاريخ:</div>
        <Input type="date" value={searchDate} onChange={(e) => setSearchDate(e.target.value)} className="max-w-[200px]" />
        {searchDate && <Button variant="ghost" size="sm" onClick={() => setSearchDate("")}>مسح</Button>}
      </div>

      {isLoading ? (
        <div className="animate-pulse text-muted-foreground">جارٍ التحميل...</div>
      ) : filteredDates.length === 0 ? (
        <Card><CardContent className="pt-6 text-center text-muted-foreground">لا توجد خدمات معتمدة</CardContent></Card>
      ) : (
        <div className="grid gap-3">
          {filteredDates.map((date) => {
            const dayServices = byDate[date];
            return (
              <Card key={date}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-base">{date}</CardTitle>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">{dayServices.length} خدمة</span>
                    <Button size="sm" onClick={() => setOpenDate(date)}>
                      <Eye className="h-4 w-4 ml-1" /> عرض
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {dayServices.map((s) => s.location).join(" • ")}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!openDate} onOpenChange={(v) => !v && setOpenDate(null)}>
        {openDate && (
          <DayServicesDialog
            date={openDate}
            services={byDate[openDate] ?? []}
            personById={personById}
            canPrint={canPrint}
            canPdf={canPdf}
            canImg={canImg}
          />
        )}
      </Dialog>
    </div>
  );
}

function DayServicesDialog({
  date, services, personById, canPrint, canPdf, canImg,
}: {
  date: string;
  services: ServiceRow[];
  personById: (id: string | null) => Person | undefined;
  canPrint: boolean; canPdf: boolean; canImg: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const filename = `خدمات-${date}`;

  // Order: التبة, البوابة, مترس ١, مترس ٢
  const ordered = useMemo(() => {
    const arr = [...services];
    arr.sort((a, b) => {
      const ia = SERVICE_LOCATIONS.indexOf(a.location as (typeof SERVICE_LOCATIONS)[number]);
      const ib = SERVICE_LOCATIONS.indexOf(b.location as (typeof SERVICE_LOCATIONS)[number]);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    return arr;
  }, [services]);

  return (
    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>خدمات يوم {date}</DialogTitle></DialogHeader>
      <div className="flex gap-2 flex-wrap mb-2 print:hidden">
        {canPrint && (
          <Button size="sm" variant="outline" onClick={() => ref.current && printElement(ref.current)}>
            <Printer className="h-4 w-4 ml-1" /> طباعة
          </Button>
        )}
        {canPdf && (
          <Button size="sm" variant="outline" onClick={() => ref.current && exportElementAsPDF(ref.current, filename)}>
            <FileDown className="h-4 w-4 ml-1" /> PDF
          </Button>
        )}
        {canImg && (
          <Button size="sm" variant="outline" onClick={() => ref.current && exportElementAsImage(ref.current, filename)}>
            <ImageIcon className="h-4 w-4 ml-1" /> صورة
          </Button>
        )}
      </div>
      <div ref={ref} className="p-4 bg-white text-black rounded border space-y-4">
        <div className="text-center border-b pb-2 mb-2">
          <h2 className="text-xl font-bold">جدول خدمات يوم {date}</h2>
        </div>
        {ordered.map((s) => {
          const members = [s.member_1, s.member_2, s.member_3, s.member_4, s.member_5, s.member_6];
          return (
            <div key={s.id} className="border rounded p-3">
              <div className="font-bold mb-2 text-center bg-gray-100 py-1">{s.location}</div>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="border p-2 bg-gray-50 w-10">#</th>
                    <th className="border p-2 bg-gray-50">الرقم العسكري</th>
                    <th className="border p-2 bg-gray-50">الرتبة</th>
                    <th className="border p-2 bg-gray-50">الاسم</th>
                    <th className="border p-2 bg-gray-50">التشكيل</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((mid, i) => {
                    const p = personById(mid);
                    return (
                      <tr key={i}>
                        <td className="border p-2 text-center">{i + 1}</td>
                        <td className="border p-2">{p?.military_number ?? "-"}</td>
                        <td className="border p-2">{p?.military_rank ?? "-"}</td>
                        <td className="border p-2">{p?.full_name ?? "-"}</td>
                        <td className="border p-2">{p?.formation ?? "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="mt-2 text-sm"><strong>المستلم:</strong> {s.recipient ?? "-"}</div>
              {s.notes && <div className="mt-1 text-sm"><strong>ملاحظات:</strong> {s.notes}</div>}
            </div>
          );
        })}
      </div>
    </DialogContent>
  );
}
