import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/weapons")({ component: WeaponsPage });
const CONDITIONS = ["ممتازة", "جيدة", "مقبولة", "معطلة"];

function WeaponsPage() {
  const { isAdmin, can } = useAuth();
  const canEdit = isAdmin || can("weapons", "edit");
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ serial_number: "", weapon_type: "", condition: "جيدة", assigned_to: "", notes: "" });

  const { data: weapons = [], error, refetch, isLoading } = useQuery({
    queryKey: ["weapons"],
    queryFn: async () => {
      const { data, error } = await supabase.from("weapons").select("*").order("id", { ascending: false });
      if (error) throw error;
      return data?? [];
    },
  });

  const { data: persons = [] } = useQuery({
    queryKey: ["persons-all"],
    queryFn: async () => {
      const { data } = await supabase.from("persons").select("id, full_name").limit(200);
      return data?? [];
    },
  });

  const personsMap = useMemo(() => { const m: any = {}; persons.forEach((p: any) => m[p.id] = p.full_name); return m; }, [persons]);

  const addMut = useMutation({
    mutationFn: async () => {
      const payload: any = {
        serial_number: form.serial_number.trim(),
        weapon_type: form.weapon_type.trim(),
        condition: form.condition,
        notes: form.notes || null,
      };
      if (form.assigned_to) payload.assigned_to = form.assigned_to;
      const { error } = await supabase.from("weapons").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["weapons"] }); refetch(); setOpen(false); setForm({ serial_number: "", weapon_type: "", condition: "جيدة", assigned_to: "", notes: "" }); toast.success("تمت الإضافة - يظهر الآن في الجدول"); },
    onError: (e: any) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("weapons").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["weapons"] }); refetch(); },
  });

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">الأسلحة - {weapons.length}</h1><p className="text-sm text-muted-foreground">يعرض فوراً بعد الحفظ {error? ` - خطأ: ${error.message}` : ""}</p></div>
        <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="h-4 w-4" /></Button>
          {canEdit && <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button><Plus className="h-4 w-4 ml-1" /> إضافة سلاح</Button></DialogTrigger><DialogContent dir="rtl"><DialogHeader><DialogTitle>سلاح جديد</DialogTitle></DialogHeader><div className="grid gap-3"><div><Label>الرقم *</Label><Input value={form.serial_number} onChange={(e) => setForm({...form, serial_number: e.target.value })} /></div><div><Label>النوع *</Label><Input value={form.weapon_type} onChange={(e) => setForm({...form, weapon_type: e.target.value })} /></div><div><Label>الحالة</Label><Select value={form.condition} onValueChange={(v) => setForm({...form, condition: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CONDITIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div><div><Label>مخصص لـ</Label><Select value={form.assigned_to || "none"} onValueChange={(v) => setForm({...form, assigned_to: v==="none"? "":v })}><SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger><SelectContent><SelectItem value="none">-</SelectItem>{persons.map((p:any)=><SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}</SelectContent></Select></div><div><Label>ملاحظات</Label><Textarea value={form.notes} onChange={(e) => setForm({...form, notes: e.target.value })} /></div></div><DialogFooter><Button disabled={!form.serial_number ||!form.weapon_type} onClick={() => addMut.mutate()}>حفظ</Button></DialogFooter></DialogContent></Dialog>}
        </div>
      </div>
      <Card><CardHeader><CardTitle>قائمة الأسلحة ({weapons.length})</CardTitle></CardHeader><CardContent>
        <Table><TableHeader><TableRow><TableHead>النوع</TableHead><TableHead>الرقم</TableHead><TableHead>الحالة</TableHead><TableHead>مخصص لـ</TableHead><TableHead /></TableRow></TableHeader><TableBody>{weapons.map((w:any)=><TableRow key={w.id}><TableCell>{w.weapon_type}</TableCell><TableCell className="font-mono">{w.serial_number}</TableCell><TableCell>{w.condition}</TableCell><TableCell>{personsMap[w.assigned_to]?? "-"}</TableCell><TableCell><Button size="sm" variant="ghost" onClick={() => delMut.mutate(w.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell></TableRow>)}{weapons.length===0 && <TableRow><TableCell colSpan={5} className="text-center py-10">{isLoading? "جاري التحميل..." : "لا توجد أسلحة - أضف أول سلاح"}</TableCell></TableRow>}</TableBody></Table>
      </CardContent></Card>
    </div>
  );
}
