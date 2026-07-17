import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/weapons")({
  component: WeaponsPage,
});

const CONDITIONS = ["ممتازة", "جيدة", "مقبولة", "معطلة"];

function WeaponsPage() {
  const { isAdmin, can } = useAuth();
  const canEdit = isAdmin || can("weapons", "edit");
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ serial_number: "", weapon_type: "", condition: "جيدة", assigned_to: "", notes: "" });

  const { data: weapons = [] } = useQuery({
    queryKey: ["weapons"],
    queryFn: async () => (await supabase.from("weapons").select("*, persons(full_name)").order("created_at")).data ?? [],
  });
  const { data: persons = [] } = useQuery({
    queryKey: ["persons-all"],
    queryFn: async () => (await supabase.from("persons").select("id, full_name").eq("active", true)).data ?? [],
  });

  const addMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("weapons").insert({
        serial_number: form.serial_number,
        weapon_type: form.weapon_type,
        condition: form.condition,
        assigned_to: form.assigned_to || null,
        notes: form.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["weapons"] }); setOpen(false); setForm({ serial_number: "", weapon_type: "", condition: "جيدة", assigned_to: "", notes: "" }); toast.success("تمت الإضافة"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("weapons").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["weapons"] }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">الأسلحة</h1>
          <p className="text-muted-foreground text-sm mt-1">جرد الأسلحة والتخصيص</p>
        </div>
        {canEdit && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 ml-1" /> إضافة سلاح</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>سلاح جديد</DialogTitle></DialogHeader>
              <div className="grid gap-3">
                <div><Label>الرقم التسلسلي *</Label><Input value={form.serial_number} onChange={(e) => setForm({ ...form, serial_number: e.target.value })} /></div>
                <div><Label>نوع السلاح *</Label><Input value={form.weapon_type} onChange={(e) => setForm({ ...form, weapon_type: e.target.value })} placeholder="كلاشنكوف / مسدس..." /></div>
                <div>
                  <Label>الحالة</Label>
                  <Select value={form.condition} onValueChange={(v) => setForm({ ...form, condition: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CONDITIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>مخصص لـ</Label>
                  <Select value={form.assigned_to || "none"} onValueChange={(v) => setForm({ ...form, assigned_to: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">-</SelectItem>
                      {persons.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>ملاحظات</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
              </div>
              <DialogFooter><Button disabled={!form.serial_number || !form.weapon_type || addMut.isPending} onClick={() => addMut.mutate()}>حفظ</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card><CardContent className="pt-6">
        <Table>
          <TableHeader><TableRow><TableHead>النوع</TableHead><TableHead>الرقم التسلسلي</TableHead><TableHead>الحالة</TableHead><TableHead>مخصص لـ</TableHead>{canEdit && <TableHead />}</TableRow></TableHeader>
          <TableBody>
            {weapons.map((w) => {
              const p = w.persons as { full_name: string } | null;
              return (
                <TableRow key={w.id}>
                  <TableCell>{w.weapon_type}</TableCell>
                  <TableCell className="font-mono">{w.serial_number}</TableCell>
                  <TableCell>{w.condition}</TableCell>
                  <TableCell>{p?.full_name ?? "-"}</TableCell>
                  {canEdit && <TableCell><Button size="sm" variant="ghost" onClick={() => delMut.mutate(w.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>}
                </TableRow>
              );
            })}
            {weapons.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">لا توجد أسلحة</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}
