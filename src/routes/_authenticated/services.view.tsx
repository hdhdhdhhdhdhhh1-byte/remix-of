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
import html2canvas from "html2canvas";

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
      const { data, error } = await supabase.from("persons").select("id, full_name");
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
          <Button size="sm" onClick={()=>{ (document.getElementById(`dlg-${date}`) as any)?.click() }}> <Eye className="h-4 w-4 ml-1" /> عرض النموذج الجديد</Button>
          <Dialog><DialogContent className="hidden" /></Dialog>
        </CardHeader>
          <div className="hidden"><DayServicesDialogWrapper date={date} services={byDate[date]??[]} personById={personById} triggerId={`dlg-${date}`} /></div>
        </Card>
      ))}
      {/* عرض مباشر بدون Dialog للتجربة */}
      {filteredDates.map(date => (
        <div key={`inline-${date}`} className="md:hidden"><DayInlinePreview date={date} services={byDate[date]??[]} personById={personById} /></div>
      ))}
    </div>
  );
}

function DayServicesDialogWrapper({ date, services, personById, triggerId }: any) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button id={triggerId} className="hidden" onClick={()=>setOpen(true)} />
      <Dialog open={open} onOpenChange={setOpen}>
        <DayServicesDialog date={date} services={services} personById={personById} />
      </Dialog>
    </>
  )
}

function DayInlinePreview({ date, services, personById }: { date: string; services: ServiceRow[]; personById: (id: string|null)=>string }) {
  const ref = useRef<HTMLDivElement>(null);
  const dayName = useMemo(()=> new Date(date).toLocaleDateString("ar-EG", { weekday: "long" }), [date]);

  const exportAsImage = async () => {
    if (!ref.current) return;
    const canvas = await html2canvas(ref.current, { scale: 3, backgroundColor: "#ffffff", useCORS: true });
    const link = document.createElement("a");
    link.download = `خدمات-${date}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const getLocationRow = (locName: string) => services.find(s => s.location === locName || s.location.includes(locName));
  
  const printEl = () => {
    if (!ref.current) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<html><head><title>${date}</title><style>body{margin:0}</style></head><body>${ref.current.outerHTML}</body></html>`);
    win.document.close();
    win.print();
  };

  const Block6 = ({ title, row }: { title: string; row?: ServiceRow }) => {
    const members = row ? [row.member_1, row.member_2, row.member_3, row.member_4, row.member_5, row.member_6] : [];
    // كمل 6 خانات
    const filled = [...members, ...Array(6 - members.length).fill(null)].slice(0,6);
    return (
      <div className="mb-2">
        <div className="bg-black text-white text-center py-1 font-black text-[11px]">{title}</div>
        <div className="border-2 border-t-0 border-black bg-white">
          {filled.map((mid,i)=>(
            <div key={i} className="h-[28px] flex items-center px-2 border-b border-dashed border-gray-300 last:border-0 text-[11px] font-bold whitespace-nowrap overflow-hidden text-ellipsis">
              <span className="w-4 text-[10px]">{i+1}-</span>
              <span className="flex-1 truncate">{mid ? personById(mid) : "-"}</span>
            </div>
          ))}
        </div>
      </div>
    )
  };

  const bawaba = getLocationRow("البوابة");
  const tabba = getLocationRow("التبة");
  const metras1 = getLocationRow("مترس 1");
  const metras2 = getLocationRow("مترس 2");
  const recipient = services[0]?.recipient;

  return (
    <div className="bg-[#f5f5f0] p-2 rounded-xl">
      <div className="flex gap-2 justify-center mb-2">
        <Button size="sm" className="bg-black text-white rounded-full" onClick={exportAsImage}><ImageIcon className="h-4 w-4 ml-1" /> حفظ كصورة</Button>
        <Button size="sm" variant="outline" className="rounded-full border-black" onClick={printEl}><Printer className="h-4 w-4 ml-1" /> طباعة</Button>
      </div>
      <div ref={ref} className="bg-white text-black p-3 border-[3px] border-black rounded-[16px] w-full max-w-[380px] mx-auto" dir="rtl">
        <div className="flex justify-between border-b-[2px] border-black pb-2 mb-2">
          <div className="text-[11px] font-bold">{dayName} | {date}</div>
          <div className="font-black text-[14px] flex gap-1 items-center"><Shield className="h-4 w-4" /> جدول خدمات الحراسة</div>
        </div>
        {/* 6 خانات لكل موقع = مضغوط */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="bg-gray-100 border-2 border-black rounded-full text-center font-black text-[11px] py-1 mb-1">الفصيل الأول</div>
            <Block6 title="البوابة" row={bawaba} />
            <Block6 title="التبة" row={tabba} />
          </div>
          <div>
            <div className="bg-gray-100 border-2 border-black rounded-full text-center font-black text-[11px] py-1 mb-1">الفصيلة الثانية</div>
            <Block6 title="مترس 1" row={metras1} />
            <Block6 title="مترس 2" row={metras2} />
          </div>
        </div>
        {/* خانة المستلم */}
        <div className="mt-3 border-2 border-black rounded-full px-3 py-1.5 flex gap-2 items-center bg-black text-white justify-center">
          <span className="font-black text-[11px]">المستلم للقطاع:</span>
          <span className="bg-white text-black px-4 rounded-full text-[11px] font-bold min-w-[80px] text-center">{recipient || "-"}</span>
        </div>
      </div>
    </div>
  )
}

function DayServicesDialog({ date, services, personById }: { date: string; services: ServiceRow[]; personById: (id: string|null)=>string }) {
  const ref = useRef<HTMLDivElement>(null);
  const dayName = useMemo(()=> new Date(date).toLocaleDateString("ar-EG", { weekday: "long" }), [date]);

  const exportAsImage = async () => {
    if (!ref.current) return;
    try {
      const canvas = await html2canvas(ref.current, { scale: 3, backgroundColor: "#ffffff", useCORS: true, logging: false });
      const link = document.createElement("a");
      link.download = `خدمات-${date}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (e) {
      alert("فشل الحفظ: " + e);
    }
  };

  const printEl = () => {
    if (!ref.current) return;
    const win = window.open("", "_blank");
    if (!win) return;
    const styles = document.querySelectorAll("style, link[rel=stylesheet]");
    let styleHtml = "";
    styles.forEach(s => styleHtml += s.outerHTML);
    win.document.write(`<html><head>${styleHtml}</head><body>${ref.current.outerHTML}</body></html>`);
    win.document.close();
    setTimeout(()=> win.print(), 500);
  };

  const getLocationRow = (locName: string) => services.find(s => s.location === locName || s.location.includes(locName));
  const bawaba = getLocationRow("البوابة");
  const tabba = getLocationRow("التبة");
  const metras1 = getLocationRow("مترس 1");
  const metras2 = getLocationRow("مترس 2");
  const recipient = services[0]?.recipient;

  const Block6 = ({ title, row }: { title: string; row?: ServiceRow }) => {
    const members = row ? [row.member_1, row.member_2, row.member_3, row.member_4, row.member_5, row.member_6] : [];
    const filled = [...members, ...Array(6 - members.length).fill(null)].slice(0,6);
    return (
      <div className="mb-2">
        <div className="bg-black text-white text-center py-1.5 font-black text-[11px] rounded-t-lg">{title}</div>
        <div className="border-2 border-t-0 border-black rounded-b-lg bg-white">
          {filled.map((mid,i)=>(
            <div key={i} className="h-[28px] flex items-center px-2 border-b border-dashed border-gray-300 last:border-0 text-[11px] font-bold whitespace-nowrap overflow-hidden">
              <span className="w-4 text-[10px]">{i+1}-</span>
              <span className="flex-1 truncate">{mid ? personById(mid) : "-"}</span>
            </div>
          ))}
        </div>
      </div>
    )
  };

  return (
    <DialogContent className="max-w-[420px] max-h-[95vh] overflow-y-auto bg-[#f5f5f0]">
      <DialogHeader><DialogTitle className="text-center text-sm">معاينة الخدمات - 6 خانات لكل موقع</DialogTitle></DialogHeader>
      <div className="flex gap-2 justify-center mb-3">
        <Button size="sm" className="bg-black text-white rounded-full px-6" onClick={exportAsImage}>
          <ImageIcon className="h-4 w-4 ml-2" /> حفظ كصورة
        </Button>
        <Button size="sm" variant="outline" className="rounded-full px-6 border-2 border-black" onClick={printEl}>
          <Printer className="h-4 w-4 ml-2" /> طباعة
        </Button>
      </div>

      <div ref={ref} className="bg-white text-black p-3 border-[3px] border-black rounded-[16px] w-[360px] mx-auto" dir="rtl">
        <div className="flex justify-between border-b-[2px] border-black pb-2 mb-2">
          <div className="text-[11px] font-bold">{dayName} | {date}</div>
          <div className="font-black text-[13px] flex gap-1 items-center"><Shield className="h-4 w-4" /> خدمات الحراسة</div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="bg-gray-100 border-2 border-black rounded-full text-center font-black text-[11px] py-1 mb-1">الفصيل الأول</div>
            <Block6 title="البوابة" row={bawaba} />
            <Block6 title="التبة" row={tabba} />
          </div>
          <div>
            <div className="bg-gray-100 border-2 border-black rounded-full text-center font-black text-[11px] py-1 mb-1">الفصيلة الثانية</div>
            <Block6 title="مترس 1" row={metras1} />
            <Block6 title="مترس 2" row={metras2} />
          </div>
        </div>
        <div className="mt-3 border-2 border-black rounded-full px-3 py-1.5 flex gap-2 items-center bg-black text-white justify-center">
          <span className="font-black text-[11px]">المستلم للقطاع:</span>
          <span className="bg-white text-black px-4 rounded-full text-[11px] font-bold min-w-[80px] text-center">{recipient || "-"}</span>
        </div>
      </div>
    </DialogContent>
  );
}

