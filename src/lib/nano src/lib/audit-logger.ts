import { supabase } from "@/integrations/supabase/client";

export async function logActivity(params: {
  action: string;
  entity: string;
  entity_id?: string;
  details?: any;
}) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("audit_log").insert({
      user_id: user?.id?? null,
      action: params.action,
      entity: params.entity,
      entity_id: params.entity_id?? null,
      details: params.details?? null,
    });
  } catch (e) {
    console.error("Audit log failed", e);
  }
}
