import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { createUser, listUsers, deleteUser, updateUserPermissions, resetUserPassword } from "@/lib/admin.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, Shield, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { APP_MODULES, APP_ROLES, FORMATIONS } from "@/lib/constants";

export const Route = createFileRoute("/_authenticated/users")({
  component: UsersPage,
});

type RoleKey = "admin" | "leader" | "viewer" | "platoon_leader" | "office" | "battery_commander";

type Perm = {
  module: string;
  can_view: boolean; can_edit: boolean; can_approve: boolean;
  can_add: boolean; can_delete: boolean; can_print: boolean;
  can_export_pdf: boolean; can_export_image: boolean;
  can_cancel_approval: boolean;
};

const PERM_COLS: { key: keyof Perm; label: string }[] = [
  { key: "can_view", label: "عرض" },
  { key: "can_add", label: "إضافة" },
  { key: "can_edit", label: "تعديل" },
  { key: "can_delete", label: "حذف" },
  { key: "can_approve", label: "اعتماد" },
  { key: "can_cancel_approval", label: "إلغاء الاعتماد" },
  { key: "can_print", label: "طباعة" },
  { key: "can_export_pdf", label: "PDF" },
  { key: "can_export_image", label: "صورة" },
];

function defaultPerms(): Perm[] {
  return APP_MODULES.map((m) => ({
    module: m.key, can_view: true, can_edit: false, can_approve: false,
    can_add: false, can_delete: false, can_print: false, can_export_pdf: false, can_export_image: false,
    can_cancel_approval: false,
  }));
}

const SELECTABLE_ROLES = APP_ROLES.filter((r) => r.key !== "owner");

function UsersPage() {
  const { isAdmin, loading } = useAuth();
  const qc = useQueryClient();
  const listFn = useServerFn(listUsers);
  const createFn = useServerFn(createUser);
  const deleteFn = useServerFn(deleteUser);
  const updateFn = useServerFn(updateUserPermissions);
  const resetFn = useServerFn(resetUserPassword);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{
    email: string; password: string; full_name: string;
    role: RoleKey; assigned_formation: string | null; permissions: Perm[];
  }>({
    email: "", password: "", full_name: "",
    role: "viewer", assigned_formation: null, permissions: defaultPerms(),
  });
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [resettingUser, setResettingUser] = useState<UserRow | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const { data: users = [] } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => listFn(),
    enabled: isAdmin,
  });

  const createMut = useMutation({
    mutationFn: () => createFn({ data: form }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      setOpen(false);
      setForm({ email: "", password: "", full_name: "", role: "viewer", assigned_formation: null, permissions: defaultPerms() });
      toast.success("تم إنشاء المستخدم");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (user_id: string) => deleteFn({ data: { user_id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-users"] }); toast.success("تم الحذف"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: (payload: { user_id: string; role?: RoleKey; assigned_formation?: string | null; permissions: Perm[] }) =>
      updateFn({ data: payload }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-users"] }); setEditingUser(null); toast.success("تم التحديث"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetMut = useMutation({
    mutationFn: (v: { user_id: string; password: string }) => resetFn({ data: v }),
    onSuccess: () => { setResettingUser(null); setNewPassword(""); toast.success("تم تغيير كلمة المرور"); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (loading) return <div>...</div>;
  if (!isAdmin) throw redirect({ to: "/dashboard" });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2"><Shield className="h-6 w-6" /> إدارة المستخدمين</h1>
          <p className="text-muted-foreground text-sm mt-1">إنشاء وإدارة الحسابات والصلاحيات التفصيلية</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 ml-1" /> مستخدم جديد</Button></DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>مستخدم جديد</DialogTitle></DialogHeader>
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>الاسم الكامل *</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
                <div><Label>البريد الإلكتروني *</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                <div><Label>كلمة المرور *</Label><Input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
                <div>
                  <Label>الدور *</Label>
                  <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as RoleKey })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SELECTABLE_ROLES.map((r) => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>التشكيل المسند (لقادة الفصائل)</Label>
                  <Select value={form.assigned_formation ?? "none"} onValueChange={(v) => setForm({ ...form, assigned_formation: v === "none" ? null : v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— لا يوجد —</SelectItem>
                      {FORMATIONS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <PermissionsGrid permissions={form.permissions} onChange={(p) => setForm({ ...form, permissions: p })} />
            </div>
            <DialogFooter>
              <Button disabled={!form.email || !form.password || !form.full_name || createMut.isPending} onClick={() => createMut.mutate()}>
                إنشاء
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card><CardContent className="pt-6">
        <Table>
          <TableHeader><TableRow><TableHead>الاسم</TableHead><TableHead>البريد</TableHead><TableHead>الدور</TableHead><TableHead>التشكيل</TableHead><TableHead className="text-left">إجراءات</TableHead></TableRow></TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell>{u.full_name ?? "-"}</TableCell>
                <TableCell dir="ltr" className="text-right">{u.email}</TableCell>
                <TableCell>{u.roles.map((r) => APP_ROLES.find((x) => x.key === r)?.label ?? r).join(", ") || "-"}</TableCell>
                <TableCell>{u.assigned_formation ?? "-"}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {!u.roles.includes("owner") && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => setEditingUser(u)}><Shield className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => setResettingUser(u)}><KeyRound className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => { if (confirm("حذف؟")) delMut.mutate(u.id); }}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>

      <Dialog open={!!editingUser} onOpenChange={(v) => !v && setEditingUser(null)}>
        {editingUser && (
          <EditUserDialog
            user={editingUser}
            onSave={(role, formation, perms) => updateMut.mutate({ user_id: editingUser.id, role, assigned_formation: formation, permissions: perms })}
            saving={updateMut.isPending}
          />
        )}
      </Dialog>

      <Dialog open={!!resettingUser} onOpenChange={(v) => !v && setResettingUser(null)}>
        {resettingUser && (
          <DialogContent>
            <DialogHeader><DialogTitle>تغيير كلمة المرور</DialogTitle></DialogHeader>
            <div className="grid gap-3">
              <div><Label>{resettingUser.email}</Label></div>
              <Input type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="كلمة المرور الجديدة" />
            </div>
            <DialogFooter>
              <Button disabled={newPassword.length < 6 || resetMut.isPending}
                onClick={() => resetMut.mutate({ user_id: resettingUser.id, password: newPassword })}>حفظ</Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

type UserRow = {
  id: string;
  email: string | undefined;
  full_name: string | null;
  created_at: string;
  roles: string[];
  assigned_formation: string | null;
  permissions: Perm[];
};

function EditUserDialog({
  user, onSave, saving,
}: { user: UserRow; onSave: (role: RoleKey, formation: string | null, perms: Perm[]) => void; saving: boolean }) {
  const initRole = (user.roles.find((r) => SELECTABLE_ROLES.some((x) => x.key === r)) as RoleKey) ?? "viewer";
  const [role, setRole] = useState<RoleKey>(initRole);
  const [formation, setFormation] = useState<string | null>(user.assigned_formation);
  const [perms, setPerms] = useState<Perm[]>(() => {
    const map = new Map(user.permissions.map((p) => [p.module, p]));
    return APP_MODULES.map((m) => {
      const existing = map.get(m.key);
      return existing ?? {
        module: m.key, can_view: true, can_edit: false, can_approve: false,
        can_add: false, can_delete: false, can_print: false, can_export_pdf: false, can_export_image: false,
        can_cancel_approval: false,
      };
    });
  });
  return (
    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>تعديل الصلاحيات — {user.full_name}</DialogTitle></DialogHeader>
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>الدور</Label>
            <Select value={role} onValueChange={(v) => setRole(v as RoleKey)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SELECTABLE_ROLES.map((r) => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>التشكيل المسند</Label>
            <Select value={formation ?? "none"} onValueChange={(v) => setFormation(v === "none" ? null : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— لا يوجد —</SelectItem>
                {FORMATIONS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <PermissionsGrid permissions={perms} onChange={setPerms} />
      </div>
      <DialogFooter><Button disabled={saving} onClick={() => onSave(role, formation, perms)}>حفظ</Button></DialogFooter>
    </DialogContent>
  );
}

function PermissionsGrid({ permissions, onChange }: { permissions: Perm[]; onChange: (p: Perm[]) => void }) {
  const update = (module: string, key: keyof Perm, value: boolean) => {
    onChange(permissions.map((p) => (p.module === module ? { ...p, [key]: value } : p)));
  };
  return (
    <div>
      <Label className="mb-2 block">الصلاحيات التفصيلية</Label>
      <div className="border rounded-md overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>القسم</TableHead>
              {PERM_COLS.map((c) => <TableHead key={c.key} className="text-center">{c.label}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {permissions.map((p) => {
              const label = APP_MODULES.find((m) => m.key === p.module)?.label ?? p.module;
              return (
                <TableRow key={p.module}>
                  <TableCell className="font-medium">{label}</TableCell>
                  {PERM_COLS.map((c) => (
                    <TableCell key={c.key} className="text-center">
                      <Checkbox
                        checked={p[c.key] as boolean}
                        onCheckedChange={(v) => update(p.module, c.key, !!v)}
                      />
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
