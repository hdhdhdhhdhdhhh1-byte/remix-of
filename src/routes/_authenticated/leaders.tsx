import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/leaves")({
  component: LeavesPage,
});

type LeaveRow = {
  id: string;
  person_id: string | null;
  leave_type: string;
  start_date: string;
  end_date: string;
  status: "pending" | "approved" | "rejected";
  approved_by?: string | null;
  created_at: string;
};

function LeavesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // 1. جلب الإجازات مع الأشخاص
  const { data: leaves = [] } = useQuery({
    queryKey: ["leaves", statusFilter],
    queryFn: async () => {
      let q = supabase.from("leaves").select("*").order("start_date", { ascending: false });
      if (statusFilter !== "all") q = q.eq("status", statusFilter as "pending" | "approved" | "rejected");

      const { data: leaveData, error } = await q;
      if (error) throw error;

      // FIX 142: كان data.map -> الصح leaveData
      const personIds = (leaveData ?? [])
        .map((x: { person_id: string | null }) => x.person_id)
        .filter((id): id is string => !!id);

      const personsMap: Record<string, { id: string; full_name: string }> = {};

      if (personIds.length) {
        const { data: personsData } = await supabase
          .from("persons")
          .select("id, full_name")
          .in("id", personIds);

        (personsData ?? []).forEach((p) => {
          personsMap[p.id] = p;
        });
      }

      return (leaveData ?? []).map((l) => ({
        ...l,
        persons: l.person_id ? personsMap[l.person_id] ?? null : null,
      }));
    },
  });

  // 2. الموافقة / الرفض
  const approveMut = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "approved" | "rejected" }) => {
      const updateData: { status: "approved" | "rejected"; approved_by?: string | null } = {
        status,
      };

      // FIX 287: الجدول ما فيه approved_at، فيه approved_by فقط
      // كان الكود القديم: updateData.approved_at = new Date().toISOString()
      updateData.approved_by = user?.id ?? null;

      const { error } = await supabase.from("leaves").update(updateData).eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leaves"] });
      toast.success("تم التحديث");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">الإجازات</h1>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            <SelectItem value="pending">معلقة</SelectItem>
            <SelectItem value="approved">موافق عليها</SelectItem>
            <SelectItem value="rejected">مرفوضة</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>قائمة الإجازات</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الفرد</TableHead>
                <TableHead>النوع</TableHead>
                <TableHead>من</TableHead>
                <TableHead>إلى</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead>إجراء</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leaves.map((l: any) => (
                <TableRow key={l.id}>
                  <TableCell>{l.persons?.full_name ?? "-"}</TableCell>
                  <TableCell>{l.leave_type}</TableCell>
                  <TableCell>{l.start_date}</TableCell>
                  <TableCell>{l.end_date}</TableCell>
                  <TableCell>{l.status}</TableCell>
                  <TableCell className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => approveMut.mutate({ id: l.id, status: "approved" })}>
                      موافقة
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => approveMut.mutate({ id: l.id, status: "rejected" })}>
                      رفض
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

