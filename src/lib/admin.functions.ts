import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const OWNER_EMAIL = "Shafiqalwatiry@gmail.com";

/**
 * Idempotent: ensures the owner account exists with the configured password.
 * Called on the auth page load so the owner can sign in on first launch.
 */
export const ensureOwner = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const password = process.env.OWNER_INITIAL_PASSWORD;
  if (!password) return { ok: false, error: "OWNER_INITIAL_PASSWORD not set" };

  // Check if owner role already assigned to any user
  const { data: existingRole } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("role", "owner")
    .maybeSingle();
  if (existingRole) return { ok: true, already: true };

  // Look up user by email via admin listing
  const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (listErr) return { ok: false, error: listErr.message };
  let ownerUser = list.users.find((u) => u.email?.toLowerCase() === OWNER_EMAIL.toLowerCase());

  if (!ownerUser) {
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: OWNER_EMAIL,
      password,
      email_confirm: true,
      user_metadata: { full_name: "المالك" },
    });
    if (createErr) return { ok: false, error: createErr.message };
    ownerUser = created.user!;
  }

  // Assign owner role
  const { error: roleErr } = await supabaseAdmin
    .from("user_roles")
    .upsert({ user_id: ownerUser.id, role: "owner" }, { onConflict: "user_id,role" });
  if (roleErr) return { ok: false, error: roleErr.message };

  return { ok: true, email: OWNER_EMAIL };
});

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["owner", "admin"]);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Forbidden");
}

const PermSchema = z.object({
  module: z.string(),
  can_view: z.boolean(),
  can_edit: z.boolean(),
  can_approve: z.boolean(),
  can_add: z.boolean().optional().default(false),
  can_delete: z.boolean().optional().default(false),
  can_print: z.boolean().optional().default(false),
  can_export_pdf: z.boolean().optional().default(false),
  can_export_image: z.boolean().optional().default(false),
  can_cancel_approval: z.boolean().optional().default(false),
});

const RoleEnum = z.enum(["admin", "leader", "viewer", "platoon_leader", "office", "battery_commander"]);

const CreateUserInput = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  full_name: z.string().min(1),
  role: RoleEnum,
  assigned_formation: z.string().optional().nullable(),
  permissions: z.array(PermSchema),
});

export const createUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => CreateUserInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name },
    });
    if (error) throw new Error(error.message);
    const uid = created.user!.id;
    await supabaseAdmin.from("user_roles").insert({ user_id: uid, role: data.role });
    if (data.assigned_formation) {
      await supabaseAdmin.from("profiles").update({ assigned_formation: data.assigned_formation }).eq("user_id", uid);
    }
    if (data.permissions.length > 0) {
      await supabaseAdmin.from("permissions").insert(data.permissions.map((p) => ({ ...p, user_id: uid })));
    }
    return { ok: true, user_id: uid };
  });

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: authList } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id, role");
    const { data: perms } = await supabaseAdmin.from("permissions").select("*");
    const { data: profs } = await supabaseAdmin.from("profiles").select("user_id, assigned_formation");
    return authList.users.map((u) => ({
      id: u.id,
      email: u.email,
      full_name: (u.user_metadata as { full_name?: string } | null)?.full_name ?? null,
      created_at: u.created_at,
      roles: (roles ?? []).filter((r) => r.user_id === u.id).map((r) => r.role),
      permissions: (perms ?? []).filter((p) => p.user_id === u.id),
      assigned_formation: (profs ?? []).find((pr) => pr.user_id === u.id)?.assigned_formation ?? null,
    }));
  });

const UpdatePermsInput = z.object({
  user_id: z.string().uuid(),
  role: RoleEnum.optional(),
  assigned_formation: z.string().optional().nullable(),
  permissions: z.array(PermSchema),
});

export const updateUserPermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => UpdatePermsInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.role) {
      const { data: existing } = await supabaseAdmin
        .from("user_roles").select("role").eq("user_id", data.user_id);
      if (existing?.some((r) => r.role === "owner")) throw new Error("لا يمكن تعديل دور المالك");
      await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id);
      await supabaseAdmin.from("user_roles").insert({ user_id: data.user_id, role: data.role });
    }
    if (data.assigned_formation !== undefined) {
      await supabaseAdmin.from("profiles").update({ assigned_formation: data.assigned_formation }).eq("user_id", data.user_id);
    }

    await supabaseAdmin.from("permissions").delete().eq("user_id", data.user_id);
    if (data.permissions.length > 0) {
      await supabaseAdmin.from("permissions").insert(data.permissions.map((p) => ({ ...p, user_id: data.user_id })));
    }
    return { ok: true };
  });

const ResetPasswordInput = z.object({
  user_id: z.string().uuid(),
  password: z.string().min(6),
});

export const resetUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ResetPasswordInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      password: data.password,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const DeleteUserInput = z.object({ user_id: z.string().uuid() });

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => DeleteUserInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Prevent deleting owner
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user_id);
    if (roles?.some((r) => r.role === "owner")) {
      throw new Error("لا يمكن حذف حساب المالك");
    }
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
