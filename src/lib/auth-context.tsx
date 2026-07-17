import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import type { ModuleKey } from "@/lib/constants";

export type AppRole = "owner" | "admin" | "leader" | "viewer" | "platoon_leader" | "office" | "battery_commander";
export type PermAction = "view" | "edit" | "approve" | "add" | "delete" | "print" | "export_pdf" | "export_image" | "cancel_approval";

export interface UserPermission {
  module: string;
  can_view: boolean;
  can_edit: boolean;
  can_approve: boolean;
  can_add: boolean;
  can_delete: boolean;
  can_print: boolean;
  can_export_pdf: boolean;
  can_export_image: boolean;
  can_cancel_approval?: boolean;
}

export interface PageVis { page_key: string; visible: boolean }

interface AuthCtx {
  user: User | null;
  session: Session | null;
  loading: boolean;
  role: AppRole | null;
  isAdmin: boolean;
  permissions: UserPermission[];
  pageVisibility: PageVis[];
  fullName: string | null;
  can: (module: ModuleKey | string, action: PermAction) => boolean;
  isPageVisible: (page: string) => boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    return () => sub.subscription.unsubscribe();
  }, []);

  const user = session?.user ?? null;

  const { data: role } = useQuery({
    queryKey: ["my_role", user?.id], enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_role");
      if (error) throw error;
      return (data ?? null) as AppRole | null;
    },
  });

  const { data: isAdminData } = useQuery({
    queryKey: ["my_is_admin", user?.id], enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_is_admin");
      if (error) throw error;
      return !!data;
    },
  });

  const { data: perms } = useQuery({
    queryKey: ["my_permissions", user?.id], enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_permissions");
      if (error) throw error;
      return (data ?? []) as UserPermission[];
    },
  });

  const { data: pages } = useQuery({
    queryKey: ["my_pages", user?.id], enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_pages");
      if (error) return [];
      return (data ?? []) as PageVis[];
    },
  });

  const { data: profile } = useQuery({
    queryKey: ["my_profile", user?.id], enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("full_name").eq("user_id", user!.id).maybeSingle();
      return data;
    },
  });

  const isAdmin = !!isAdminData;
  const permissions = perms ?? [];
  const pageVisibility = pages ?? [];

  const can = (module: string, action: PermAction) => {
    if (isAdmin) return true;
    const p = permissions.find((x) => x.module === module);
    if (!p) return false;
    switch (action) {
      case "view": return p.can_view;
      case "edit": return p.can_edit;
      case "approve": return p.can_approve;
      case "add": return p.can_add;
      case "delete": return p.can_delete;
      case "print": return p.can_print;
      case "export_pdf": return p.can_export_pdf;
      case "export_image": return p.can_export_image;
      case "cancel_approval": return !!p.can_cancel_approval;
    }
  };

  const isPageVisible = (page: string) => {
    if (isAdmin) return true;
    const p = pageVisibility.find((x) => x.page_key === page);
    if (!p) return true; // default visible unless explicitly hidden
    return p.visible;
  };

  const signOut = async () => {
    if (user?.id) {
      try {
        await supabase.from("audit_log").insert({
          user_id: user.id, action: "sign_out", entity: "auth", entity_id: user.id,
        });
      } catch { /* ignore */ }
    }
    await supabase.auth.signOut();
  };

  return (
    <Ctx.Provider value={{ user, session, loading, role: role ?? null, isAdmin, permissions, pageVisibility, fullName: profile?.full_name ?? null, can, isPageVisible, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

// Re-export for backwards compatibility
export type { ModuleKey } from "@/lib/constants";
