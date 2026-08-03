import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import type { ModuleKey } from "@/lib/constants";
import { getDB } from "@/lib/offline/db";

export type AppRole = "owner" | "admin" | "leader" | "viewer" | "platoon_leader" | "office" | "battery_commander";
export type PermAction = "view" | "edit" | "approve" | "add" | "delete" | "export_image" | "cancel_approval" | "sign" | "save";
export interface UserPermission {
  module: string; can_view: boolean; can_edit: boolean; can_approve: boolean; can_add: boolean; can_delete: boolean; can_export_image: boolean; can_cancel_approval?: boolean; can_sign?: boolean; can_print?: boolean; can_export_pdf?: boolean;
}
export interface PageVis { page_key: string; visible: boolean }
interface AuthCtx {
  user: User | null; session: Session | null; loading: boolean; role: AppRole | null; isAdmin: boolean; permissions: UserPermission[]; pageVisibility: PageVis[]; fullName: string | null;
  can: (module: ModuleKey | string, action: PermAction) => boolean;
  isPageVisible: (page: string) => boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

// Helpers لحفظ/استرجاع بدون نت
function cacheSet(key: string, val: any) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {}
}

function cacheGet<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange(async (event, s) => {
      setSession(s);
      if (event === 'SIGNED_IN' && s?.user) {
        // احفظ الجلسة للعمل بدون نت
        cacheSet('offline_user', s.user);
        cacheSet('offline_session', s);
        try {
          const db = await getDB();
          await db.put('meta', { key: 'last_user', value: s.user });
          await db.put('meta', { key: 'last_session', value: s });
        } catch {}
        const key = `logged_${s.user.id}_${s.access_token.slice(-10)}`;
        if (!sessionStorage.getItem(key)) {
          try {
            const now = new Date().toISOString();
            localStorage.setItem('session_start', now);
            localStorage.setItem(`session_start_${s.user.id}`, now);
            sessionStorage.setItem(key, '1');
            if (navigator.onLine) {
              await supabase.from("audit_log").insert({
                user_id: s.user.id, action: "sign_in", entity: "auth", entity_id: s.user.id,
                details: { email: s.user.email, session_start: now, user_agent: navigator.userAgent },
              });
            }
          } catch {}
        }
      }
    });

    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) {
        setSession(data.session);
      } else {
        // بدون نت وبدون جلسة supabase -> جرب استرجاع من الكاش المحلي
        const cached = cacheGet<Session>('offline_session');
        // تم تعطيل استرجاع الجلسة بدون نت
          setSession(null);
      }
      setLoading(false);
      if (data.session?.user && !localStorage.getItem('session_start')) {
        localStorage.setItem('session_start', new Date().toISOString());
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const user = session?.user ?? null;

  const { data: role } = useQuery({
    queryKey: ["my_role", user?.id],
    enabled: !!user,
    queryFn: async () => {
      try {
        const { data, error } = await supabase.rpc("my_role");
        if (error) throw error;
        if (data) cacheSet(`role_${user?.id}`, data);
        return (data ?? null) as AppRole | null;
      } catch {
        return (cacheGet<AppRole>(`role_${user?.id}`)) as AppRole | null;
      }
    },
  });

  const { data: isAdminData } = useQuery({
    queryKey: ["my_is_admin", user?.id],
    enabled: !!user,
    queryFn: async () => {
      try {
        const { data, error } = await supabase.rpc("my_is_admin");
        if (error) throw error;
        cacheSet(`isAdmin_${user?.id}`, !!data);
        return !!data;
      } catch {
        return !!cacheGet<boolean>(`isAdmin_${user?.id}`);
      }
    },
  });

  const { data: perms } = useQuery({
    queryKey: ["my_permissions", user?.id],
    enabled: !!user,
    queryFn: async () => {
      try {
        const { data, error } = await supabase.rpc("my_permissions");
        if (error) throw error;
        if (data) cacheSet(`perms_${user?.id}`, data);
        return (data ?? []) as UserPermission[];
      } catch {
        return (cacheGet<UserPermission[]>(`perms_${user?.id}`) ?? []) as UserPermission[];
      }
    },
  });

  const { data: pages } = useQuery({
    queryKey: ["my_pages", user?.id],
    enabled: !!user,
    queryFn: async () => {
      try {
        const { data, error } = await supabase.rpc("my_pages");
        if (error) return cacheGet<PageVis[]>(`pages_${user?.id}`) ?? [];
        if (data) cacheSet(`pages_${user?.id}`, data);
        return (data ?? []) as PageVis[];
      } catch {
        return (cacheGet<PageVis[]>(`pages_${user?.id}`) ?? []) as PageVis[];
      }
    },
  });

  const { data: profile } = useQuery({
    queryKey: ["my_profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      try {
        const { data } = await supabase.from("profiles").select("full_name").eq("user_id", user!.id).maybeSingle();
        if (data) cacheSet(`profile_${user?.id}`, data);
        return data;
      } catch {
        return cacheGet<{full_name: string}>(`profile_${user?.id}`);
      }
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
      case "add": return p.can_add;
      case "save": return p.can_edit || p.can_add;
      case "delete": return p.can_delete;
      case "sign": return !!(p as any).can_sign;
      case "approve": return p.can_approve;
      case "export_image": return p.can_export_image;
      case "cancel_approval": return !!p.can_cancel_approval;
      case "print": return !!(p as any).can_print;
      case "export_pdf": return !!(p as any).can_export_pdf;
      default: return false;
    }
  };

  const isPageVisible = (page: string) => {
    if (isAdmin) return true;
    const p = pageVisibility.find((x) => x.page_key === page);
    if (!p) return true;
    return p.visible;
  };

  const signOut = async () => {
    if (user?.id) {
      try {
        const sessionStart = localStorage.getItem(`session_start_${user.id}`) || localStorage.getItem('session_start');
        const now = new Date();
        let durationText = ""; let minutes = 0;
        if (sessionStart) {
          const diffMs = now.getTime() - new Date(sessionStart).getTime();
          minutes = Math.floor(diffMs / 60000);
          durationText = minutes < 60 ? `${minutes} دقيقة` : `${Math.floor(minutes/60)} ساعة و ${minutes%60} دقيقة`;
        }
        if (navigator.onLine) {
          await supabase.from("audit_log").insert({
            user_id: user.id, action: "sign_out", entity: "auth", entity_id: user.id,
            details: { email: user.email, session_start: sessionStart, session_end: now.toISOString(), duration_minutes: minutes, duration_text: durationText },
          });
        }
      } catch {}
      localStorage.removeItem('session_start');
      localStorage.removeItem(`session_start_${user.id}`);
      sessionStorage.clear();
    }
    // لا تمسح الكاش المحلي للعمل بدون نت
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
export type { ModuleKey } from "@/lib/constants";
