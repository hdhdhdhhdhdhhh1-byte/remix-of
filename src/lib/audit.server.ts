import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function serverLogActivity(params: {
  userId?: string | null;
  action: string;
  entity: string;
  entity_id?: string | null;
  details?: any;
}) {
  try {
    await supabaseAdmin.from("audit_log").insert({
      user_id: params.userId?? null,
      action: params.action,
      entity: params.entity,
      entity_id: params.entity_id?? null,
      details: params.details?? null,
    });
  } catch (e) {
    console.error("serverLogActivity failed", e);
  }
}
