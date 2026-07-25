import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const OWNER_EMAIL = "shafiqalwatiry@gmail.com";

// دالة التسجيل في سجل العمليات - تشتغل من السيرفر مباشرة (آمنة)
async function serverLogActivity(params: {
  userId?: string | null;
  action: string;
  entity: string;
  entity_id?: string | null;
  details?: any;
}) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("audit_log").insert({
      user_id: params.userId?? null,
      action: params.action,
      entity: params.entity,
      entity_id: params.entity_id?? null,
      details: params.details?? null,
    });
  } catch (e) {
    console.error("Audit log failed", e);
  }
}

export const ensureOwner = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const password = process.env.OWNER_INITIAL_PASSWORD;
  if (!password) return { ok: false, error: "OWNER_INITIAL_PASSWORD not set" };

  const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
  let ownerUser = list.users.find((u) => u.email?.toLowerCase() === OWNER_EMAIL.toLowerCase());

  if (!ownerUser) {
    const { data: created } = await supabaseAdmin.auth.admin.createUser({
      email: OWNER_EMAIL, password, email_confirm: true, user_metadata: { full_name: "المالك" },
    });
    ownerUser = created.user!;
  }
  await supabaseAdmin.from("profiles").upsert({ id: ownerUser.id, email: OWNER_EMAIL, full_name: "المالك" }, { onConflict: "id" });
  await supabaseAdmin.from("user_roles").upsert({ user_id: ownerUser.id, role: "owner" }, { onConflict: "user_id,role" });
  return { ok: true };
});

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: userData } = await supabaseAdmin.auth.admin.getUserById(userId);
  const email = userData.user?.email?.toLowerCase() || "";
  if (email === OWNER_EMAIL.toLowerCase()) return;
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId).eq("role", "owner").maybeSingle();
  if (!data) throw new Error("Forbidden");
}

const PermSchema = z.object({
  module: z.string(), can_view: z.boolean(), can_edit: z.boolean(), can_approve: z.boolean(),
  can_add: z.boolean().optional().default(false), can_delete: z.boolean().optional().default(false),
  can_print: z.boolean().optional().default(false), can_export_pdf: z.boolean().optional().default(false),
  can_export_image: z.boolean().optional().default(false), can_cancel_approval: z.boolean().optional().default(false),
});
const RoleEnum = z.enum(["admin", "leader", "viewer", "platoon_leader", "office", "battery_commander", "manager"]);
const CreateUserInput = z.object({
  email: z.string().email(), password: z.string().min(6), full_name: z.string().min(1),
  role: RoleEnum, assigned_formation: z.string().optional().nullable(), permissions: z.array(PermSchema),
});

export const createUser = createServerFn({ method: "POST" })
.middleware([requireSupabaseAuth])
.inputValidator((input) => CreateUserInput.parse(input))
.handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cleanEmail = data.email.trim().toLowerCase();

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: cleanEmail, password: data.password, email_confirm: true,
      user_metadata: { full_name: data.full_name },
    });
    if (error) throw new Error(error.message);
    const uid = created.user!.id;

    await supabaseAdmin.from("profiles").upsert({ id: uid, email: cleanEmail, full_name: data.full_name }, { onConflict: "id" });

    if (data.assigned_formation) {
      await supabaseAdmin.from("profiles").update({ assigned_formation: data.assigned_formation }).eq("id", uid);
    }

    await supabaseAdmin.from("user_roles").upsert({ user_id: uid, role: data.role }, { onConflict: "user_id,role" });

    if (data.permissions.length > 0) {
      await supabaseAdmin.from("permissions").delete().eq("user_id", uid);
      await supabaseAdmin.from("permissions").insert(data.permissions.map(p => ({...p, user_id: uid })));
    }

    // تسجيل في سجل العمليات
    await serverLogActivity({ userId: context.userId, action: 'create', entity: 'users', entity_id: uid, details: { email: cleanEmail, role: data.role, formation: data.assigned_formation } });

    return { ok: true, user_id: uid };
  });

export const listUsers = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  await assertAdmin(context.userId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: authList } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id, role");
  const { data: perms } = await supabaseAdmin.from("permissions").select("*");
  const { data: profs } = await supabaseAdmin.from("profiles").select("id, assigned_formation");
  return authList.users.map((u) => ({
    id: u.id, email: u.email, full_name: (u.user_metadata as any)?.full_name?? null, created_at: u.created_at,
    roles: (roles?? []).filter((r) => r.user_id === u.id).map((r) => r.role),
    permissions: (perms?? []).filter((p) => p.user_id === u.id),
    assigned_formation: (profs?? []).find((p) => (p as any).id === u.id)?.assigned_formation?? null,
  }));
});

const UpdatePermsInput = z.object({ user_id: z.string().uuid(), role: RoleEnum.optional(), assigned_formation: z.string().optional().nullable(), permissions: z.array(PermSchema) });
export const updateUserPermissions = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((i) => UpdatePermsInput.parse(i)).handler(async ({ data, context }) => {
  await assertAdmin(context.userId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id);
  if (data.role) await supabaseAdmin.from("user_roles").insert({ user_id: data.user_id, role: data.role });
  if (data.assigned_formation!== undefined) await supabaseAdmin.from("profiles").update({ assigned_formation: data.assigned_formation }).eq("id", data.user_id);
  await supabaseAdmin.from("permissions").delete().eq("user_id", data.user_id);
  if (data.permissions.length > 0) await supabaseAdmin.from("permissions").insert(data.permissions.map((p) => ({...p, user_id: data.user_id })));

  await serverLogActivity({ userId: context.userId, action: 'update', entity: 'users', entity_id: data.user_id, details: { role: data.role, formation: data.assigned_formation, perms_count: data.permissions.length } });

  return { ok: true };
});

const ResetPasswordInput = z.object({ user_id: z.string().uuid(), password: z.string().min(6) });
export const resetUserPassword = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((i) => ResetPasswordInput.parse(i)).handler(async ({ data, context }) => {
  await assertAdmin(context.userId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, { password: data.password });
  if (error) throw new Error(error.message);

  await serverLogActivity({ userId: context.userId, action: 'update', entity: 'users', entity_id: data.user_id, details: { action: 'reset_password' } });

  return { ok: true };
});

const DeleteUserInput = z.object({ user_id: z.string().uuid() });
export const deleteUser = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((i) => DeleteUserInput.parse(i)).handler(async ({ data, context }) => {
  await assertAdmin(context.userId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  await serverLogActivity({ userId: context.userId, action: 'delete', entity: 'users', entity_id: data.user_id });

  await supabaseAdmin.from("profiles").delete().eq("id", data.user_id);
  await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id);
  await supabaseAdmin.from("permissions").delete().eq("user_id", data.user_id);
  await supabaseAdmin.auth.admin.deleteUser(data.user_id);
  return { ok: true };
});
