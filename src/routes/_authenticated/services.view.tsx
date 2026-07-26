import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Printer, Image as ImageIcon, Eye, Calendar, Shield, Loader2 } from "lucide-react";
import { printElement } from "@/lib/export";
import { toast } from "sonner";
import { toPng } from "html-to-image";

export const Route = createFileRoute("/_authenticated/services/view")({ component: ServicesViewPage });
interface Person { id: string; full_name: string; }
interface ServiceRow { id: string; service_date: string; location: string; member_1: string | null; member_2: string | null; member_3: string | null; member_4: string | null; member_5: string | null; member_6: string | null; recipient: string | null; }
const THEME = { primary: "#1e3a2e", bg: "#f0f4f1" };
function normalizeLoc(s: string) { return s? s.replace(/٠/g,"0").replace(/١/g,"1").replace(/٢/g,"2").replace(/\s+/g, "").trim() : ""; }

function ServicesViewPage() {
  const { can, isAdmin } = useAuth();
  const canView = isAdmin || can("services_view", "view");
  const [searchDate, setSearchDate] = useState("");
  const [openDate, setOpenDate] = useState<string | null>(null);
  const { data: services = [] } = useQuery({ queryKey: ["services-approved"], enabled: canView, queryFn: async () => { const { data, error } = await supabase.from("services").select("*").not("approved_at", "is", null).order("service_date", { ascending: false }); if (error) throw error; return data as ServiceRow[]; } });
  const { data: persons = [] } = useQuery({ queryKey: ["persons-all"], queryFn: async () => { const { data, error } = await supabase.from("persons").select("id, full_name"); if (error) throw error; return data as Person[]; } });
  const personById = (id: string | null) => persons.find((p) => p.id === id)?.full_name || "-";
  const byDate = useMemo(() => { const m: Record<string, ServiceRow[]> = {}; services.forEach((s) => { const key = s.service_date.slice(0,10); (m[key]??= []).push(s); }); return m; }, [services]);
  const filteredDates = Object.keys(byDate).filter(d =>!searchDate || d.slice(0,10) === searchDate.slice(0,10));
  return (<div className="space-y-4 p-2" dir="rtl"><div className="flex gap-2"><Input type="date" value={searchDate} onChange={e=>setSearchDate(e.target.value)} className="max-w-[200px]" />{searchDate && <Button variant="ghost" onClick={()=>setSearchDate("")}>مسح</Button>}</div>{filteredDates.map(date => (<Card key={date} className="border-2"><CardHeader className="flex flex-row justify-between py-3"><CardTitle className="text-base flex gap-2"><Calendar className="h-4 w-4" /> {date}</CardTitle><Button size="sm" style={{background: THEME.primary}} onClick={()=>setOpenDate(date)}><Eye className="h-4 w-4 ml-1" /> عرض</Button></CardHeader></Card>))}<Dialog open={!!openDate} onOpenChange={v=>!v && setOpenDate(null)}>{openDate && <DayDialog date={openDate} services={byDate[openDate]??[]} personById={personById} />}</Dialog></div>);
}

function DayDialog({ date, services, personById }: { date: string; services: ServiceRow[]; personById: (id: string|null)=>string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const dayName = useMemo(()=> new Date(date).toLocaleDateString("ar-EG", { weekday: "long" }), [date]);
  const getRow = (t: string) => { const nt = normalizeLoc(t); return services.find(s => normalizeLoc(s.location).includes(nt)); };
  const bawaba = getRow("البوابة"); const tabba = getRow("التبة"); const metras1 = getRow("مترس1"); const metras2 = getRow("مترس2");
  const recipient = services[0]?.recipient || services.find(s=>s.recipient)?.recipient;

  const handleSaveImage = async () => {
    if (!ref.current) return;
    setSaving(true);
    const toastId = toast.loading("جاري التحميل...");
    try {
      // html-to-image يدعم oklch بدون مشاكل
      const dataUrl = await toPng(ref.current, {
        cacheBust: true,
        pixelRatio: 3,
        backgroundColor: "#ffffff",
        style: { margin: "0" }
      });

      const fileName = `خدمات-${date}.png`;
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      toast.success("تم تحميل الصورة ✅", { id: toastId, description: fileName });
    } catch (err: any) {
      console.error(err);
      toast.error("فشل: " + (err?.message || "خطأ"), { id: toastId });
    } finally {
      setSaving(false);
    }
  };

  const Block6 = ({ title, row }: { title: string; row?: ServiceRow }) => { const m = row? [row.member_1,row.member_2,row.member_3,row.member_4,row.member_5,row.member_6] : []; const f = [...m,...Array(6-m.length).fill(null)].slice(0,6); return (<div className="mb-2"><div className="text-white text-center py-1.5 font-black text-[11px] rounded-t-lg" style={{background: THEME.primary}}>{title}</div><div className="border-2 border-t-0 rounded-b-lg bg-white" style={{borderColor: THEME.primary}}>{f.map((mid,i)=>(<div key={i} className="h-[28px] flex items-center px-2 border-b border-dashed last:border-0 text-[11px] font-bold"><span className="w-4 opacity-60">{i+1}-</span><span className="truncate">{mid? personById(mid) : "-"}</span></div>))}</div></div>) };
  return (<DialogContent className="max-w-[420px] max-h-[95vh] overflow-y-auto" style={{background: THEME.bg}}><DialogHeader><DialogTitle className="text-center text-sm">خدمات الحراسة</DialogTitle></DialogHeader><div className="flex gap-2 justify-center mb-3"><Button size="sm" className="text-white rounded-full px-6" disabled={saving} style={{background: THEME.primary}} onClick={handleSaveImage}>{saving? <><Loader2 className="h-4 w-4 ml-2 animate-spin" /> جاري التحميل...</> : <><ImageIcon className="h-4 w-4 ml-2" /> حفظ كصورة</>}</Button><Button size="sm" variant="outline" className="rounded-full border-2" style={{borderColor: THEME.primary, color: THEME.primary}} onClick={()=> ref.current && printElement(ref.current)}><Printer className="h-4 w-4 ml-2" /> طباعة</Button></div><div ref={ref} className="bg-white text-black p-3 border-[3px] rounded-[16px] w-[360px] mx-auto" style={{borderColor: THEME.primary, backgroundColor: "#ffffff"}} dir="rtl"><div className="flex justify-between border-b-[2px] pb-2 mb-2 font-bold" style={{borderColor: THEME.primary}}><div className="text-[11px]">{dayName} | {date}</div><div className="font-black text-[13px] flex gap-1 items-center" style={{color: THEME.primary}}><Shield className="h-4 w-4" /> خدمات الحراسة</div></div><div className="grid grid-cols-2 gap-2"><div><div className="border-2 rounded-full text-center font-black text-[11px] py-1 mb-1" style={{borderColor: THEME.primary, color: THEME.primary}}>الفصيل الأول</div><Block6 title="البوابة" row={bawaba} /><Block6 title="التبة" row={tabba} /></div><div><div className="border-2 rounded-full text-center font-black text-[11px] py-1 mb-1" style={{borderColor: THEME.primary, color: THEME.primary}}>الفصيلة الثانية</div><Block6 title="مترس 1" row={metras1} /><Block6 title="مترس 2" row={metras2} /></div></div><div className="mt-3 rounded-full px-3 py-2 flex gap-2 items-center text-white justify-center" style={{background: THEME.primary}}><span className="font-black text-[11px]">المستلم للقطاع:</span><span className="bg-white px-4 rounded-full text-[11px] font-bold min-w-[90px] text-center py-0.5" style={{color: THEME.primary}}>{recipient || "-"}</span></div></div></DialogContent>);
}
