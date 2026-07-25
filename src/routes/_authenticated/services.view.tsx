import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Printer, Image as ImageIcon, Eye, Calendar, Shield } from "lucide-react";
import { exportElementAsImage, printElement } from "@/lib/export";

export const Route = createFileRoute("/_authenticated/services/view")({
  component: ServicesViewPage,
});

interface Person { id: string; full_name: string; }
interface ServiceRow {
  id: string; service_date: string; location: string;
  member_1: string | null; member_2: string | null; member_3: string | null;
  member_4: string | null; member_5: string | null; member_6: string | null;
  recipient: string | null;
}

function ServicesViewPage() {
  const { can, isAdmin } = useAuth();
  const canView = isAdmin || can("services_view", "view");
  const [searchDate, setSearchDate] = useState("");
  const [openDate, setOpenDate] = useState<string | null>(null);

  const { data: services = [] } = useQuery({
    queryKey: ["services-approved"],
    enabled: canView,
    queryFn: async () => {
      const { data, error } = await supabase.from("services").select("*").not("approved_at", "is", null).order("service_date", { ascending: false });
      if (error) throw error;
      return data as ServiceRow[];
    },
  });

  const { data: persons = [] } = useQuery({
    queryKey: ["persons-all"],
    queryFn: async () => {
      const { data } = await supabase.from("persons").select("id, full_name");
      if (error) throw error;
      return data as Person[];
    },
  });

  const personById = (id: string | null) => persons.find((p) => p.id === id)?.full_name || "-";
  const byDate = useMemo(() => {
    const m: Record<string, ServiceRow[]> = {};
    services.forEach((s) => { (m[s.service_date]??= []).push(s); });
    return m;
  }, [services]);
  const filteredDates = Object.keys(byDate).filter(d =>!searchDate || d === searchDate);

  return (
    <div className="space-y-4 p-2" dir="rtl">
      <div className="flex gap-2">
        <Input type="date" value={searchDate} onChange={e=>setSearchDate(e.target.value)} className="max-w-[200px]" />
        {searchDate && <Button variant="ghost" onClick={()=>setSearchDate("")}>مسح</Button>}
      </div>
      {filteredDates.map(date => (
        <Card key={date} className="border-2"><CardHeader className="flex flex-row justify-between py-3">
          <CardTitle className="text-base flex gap-2"><Calendar className="h-4 w-4" /> {date}</CardTitle>
          <Button size="sm" onClick={()=>setOpenDate(date)}><Eye className="h-4 w-4 ml-1" /> عرض النموذج الجديد</Button>
        </CardHeader></Card>
      ))}
      <Dialog open={!!openDate} onOpenChange={v=>!v && setOpenDate(null)}>
        {openDate && <DayServicesDialog date={openDate} services={byDate[openDate]??[]} personById={personById} />}
      </Dialog>
    </div>
  );
}

function DayServicesDialog({ date, services, personById }: { date: string; services: ServiceRow[]; personById: (id: string|null)=>string }) {
  const ref = useRef<HTMLDivElement>(null);
  const dayName = useMemo(()=> new Date(date).toLocaleDateString("ar-EG", { weekday: "long" }), [date]);
  const fasil1 = services.filter(s =>!s.location.includes("مترس"));
  const fasil2 = services.filter(s => s.location.includes("مترس"));

  const renderBlock = (s: ServiceRow, numbered=false) => {
    const members = [s.member_1, s.member_2, s.member_3, s.member_4, s.member_5, s.member_6].filter(Boolean);
    return (
      <div key={s.id} className="mb-5">
        <div className="bg-black text-white text-center py-1.5 rounded-t-lg font-black text-sm">{s.location}</div>
        <div className="border-2 border-t-0 border-black rounded-b-lg bg-white">
          {members.map((mid,i)=>(
            <div key={i} className="flex gap-2 px-3 py-2 text-[14px] border-b border-dashed last:border-0">
              {numbered && <span className="font-bold w-5">{i+1}-</span>}
              <span className="font-bold">{personById(mid)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <DialogContent className="max-w-[900px] max-h-[95vh] overflow-y-auto bg-[#f5f5f0]">
      <DialogHeader><DialogTitle className="text-center">معاينة الخدمات</DialogTitle></DialogHeader>
      <div className="flex gap-2 justify-center mb-3 print:hidden">
        <Button size="sm" className="bg-black text-white rounded-full px-6" onClick={()=> ref.current && exportElementAsImage(ref.current, `خدمات-${date}`)}>
          <ImageIcon className="h-4 w-4 ml-2" /> حفظ كصورة
        </Button>
        <Button size="sm" variant="outline" className="rounded-full px-6 border-2 border-black" onClick={()=> ref.current && printElement(ref.current)}>
          <Printer className="h-4 w-4 ml-2" /> طباعة
        </Button>
      </div>

      <div ref={ref} className="bg-white text-black p-6 border-[3px] border-black rounded-xl max-w-[800px] mx-auto" dir="rtl">
        <div className="flex justify-between border-b-[3px] border-black pb-3 mb-4 font-bold">
          <div className="text-sm">{dayName} <span className="mx-2">|</span> {date}</div>
          <div className="flex gap-2 items-center font-black text-lg"><Shield className="h-5 w-5" /> جدول خدمات الحراسة</div>
        </div>
        <div className="grid grid-cols-2 gap-6">
          <div className="border-l-2 border-dashed border-black pl-4">
            <h3 className="text-center font-black bg-gray-100 border-2 border-black rounded-full py-1 mb-4">الفصيل الأول</h3>
            {fasil1.map(s=> renderBlock(s, false))}
          </div>
          <div className="pr-4">
            <h3 className="text-center font-black bg-gray-100 border-2 border-black rounded-full py-1 mb-4">الفصيلة الثانية</h3>
            {fasil2.map(s=> renderBlock(s, true))}
          </div>
        </div>
        <div className="mt-8 flex justify-center border-t-[3px] border-black pt-4">
          <div className="bg-black text-white px-10 py-2 rounded-full font-black flex gap-4 text-[15px]">
            <span>مستلم القطاع:</span>
            <span className="bg-white text-black px-5 py-0.5 rounded-full">{services[0]?.recipient || "-"}</span>
          </div>
        </div>
      </div>
    </DialogContent>
  );
}
