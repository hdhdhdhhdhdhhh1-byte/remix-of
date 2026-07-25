import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/leaders")({
  component: LeadersPage,
});

type Person = { id: string; full_name: string; military_rank: string | null; };
type Leader = { id: string; person_id: string | null; position: string; unit: string | null; created_at: string; };

function LeadersPage() {
  const { isAdmin, can } = useAuth();
  const canEdit = isAdmin || can("leaders", "edit");
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [person_id, setPersonId] = useState("");
  const [position, setPosition] = useState("");
  const [unit, setUnit] = useState("");

  const { data: leaders = [] } = useQuery({
    queryKey: ["leaders"],
    queryFn: async (): Promise<Leader[]> => {
      const { data, error } = await supabase.from("leaders").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data?? []) as Leader[];
    },
  });

  const { data: persons = [] } = useQuery({
    queryKey: ["persons-all"],
    queryFn: async (): Promise<Person[]> => {
      const { data } = await supabase.from("persons").select("id, full_name, military_rank").eq("active", true);
      return (data?? []) as Person[];
    },
  });

  const personsMap = useMemo(() => {
    const map: Record<string, Person> = {};
    persons.forEach((p) => { map[p.id] = p; });
    return map;
  }, [persons]);

  const addMut = useMutation({
    mutationFn: async () => {
      if (!person_id ||!position) throw new Error("البيانات ناقصة");
      const { error } = await supabase.from("leaders").insert({ person_id, position, unit: unit || null });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leaders"] });
      setOpen(false); setPersonId(""); setPosition(""); setUnit("");
      toast.success("تمت الإضافة");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("leaders").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leaders"] }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div><h1 className="text-2xl md:text-3xl font-bold">القادة</h1><p className="text-muted-foreground text-sm mt-1">قادة البطارية والكتيبة</p></div>
        {canEdit && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 ml-1" /> إضافة قائد</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>إضافة قائد</DialogTitle></DialogHeader>
              <div className="grid gap-3">
                <div><Label>الفرد *</Label><Select value={person_id} onValueChange={setPersonId}><SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger><SelectContent>{persons.map((p) => (<SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>))}</SelectContent></Select></div>
                <div><Label>المنصب *</Label><Input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="قائد البطارية" /></div>
                <div><Label>الوحدة</Label><Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="البطارية / الكتيبة" /></div>
              </div>
              <DialogFooter><Button disabled={!person_id ||!position || addMut.isPending} onClick={() => addMut.mutate()}>حفظ</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
      <Card><CardContent className="pt-6">
        <Table>
          <TableHeader><TableRow><TableHead>الاسم</TableHead><TableHead>الرتبة</TableHead><TableHead>المنصب</TableHead><TableHead>الوحدة</TableHead>{canEdit && <TableHead />}</TableRow></TableHeader>
          <TableBody>
            {leaders.map((l) => {
              const person = l.person_id? personsMap[l.person_id] : null;
              return (<TableRow key={l.id}><TableCell>{person?.full_name?? "-"}</TableCell><TableCell>{person?.military_rank?? "-"}</TableCell><TableCell>{l.position}</TableCell><TableCell>{l.unit?? "-"}</TableCell>{canEdit && (<TableCell><Button size="sm" variant="ghost" onClick={() => delMut.mutate(l.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>)}</TableRow>);
            })}
            {leaders.length === 0 && (<TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">لا يوجد قادة</TableCell></TableRow>)}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
            }
