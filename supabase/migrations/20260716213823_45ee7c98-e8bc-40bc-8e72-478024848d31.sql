
ALTER TABLE public.persons
  ADD COLUMN IF NOT EXISTS military_number TEXT,
  ADD COLUMN IF NOT EXISTS formation TEXT;
UPDATE public.persons SET formation = squad WHERE formation IS NULL AND squad IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS persons_military_number_key
  ON public.persons (military_number) WHERE military_number IS NOT NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS assigned_formation TEXT;

ALTER TABLE public.permissions
  ADD COLUMN IF NOT EXISTS can_add BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_delete BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_print BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_export_pdf BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_export_image BOOLEAN NOT NULL DEFAULT false;

DROP FUNCTION IF EXISTS public.my_permissions();
CREATE FUNCTION public.my_permissions()
RETURNS TABLE(module TEXT, can_view BOOLEAN, can_edit BOOLEAN, can_approve BOOLEAN,
              can_add BOOLEAN, can_delete BOOLEAN, can_print BOOLEAN,
              can_export_pdf BOOLEAN, can_export_image BOOLEAN)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT module, can_view, can_edit, can_approve,
         can_add, can_delete, can_print, can_export_pdf, can_export_image
  FROM public.permissions WHERE user_id = auth.uid();
$$;
REVOKE EXECUTE ON FUNCTION public.my_permissions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_permissions() TO authenticated;

CREATE TABLE IF NOT EXISTS public.page_visibility (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  page_key TEXT NOT NULL,
  visible BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (user_id, page_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.page_visibility TO authenticated;
GRANT ALL ON public.page_visibility TO service_role;
ALTER TABLE public.page_visibility ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "page_visibility read own" ON public.page_visibility;
CREATE POLICY "page_visibility read own" ON public.page_visibility
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()));
DROP POLICY IF EXISTS "page_visibility admin write" ON public.page_visibility;
CREATE POLICY "page_visibility admin write" ON public.page_visibility
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.my_pages()
RETURNS TABLE(page_key TEXT, visible BOOLEAN)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT page_key, visible FROM public.page_visibility WHERE user_id = auth.uid(); $$;
REVOKE EXECUTE ON FUNCTION public.my_pages() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_pages() TO authenticated;

DROP TABLE IF EXISTS public.services CASCADE;
CREATE TABLE public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_date DATE NOT NULL DEFAULT CURRENT_DATE,
  location TEXT NOT NULL CHECK (location IN ('التبة','البوابة','مترس ١','مترس ٢')),
  member_1 UUID REFERENCES public.persons(id) ON DELETE SET NULL,
  member_2 UUID REFERENCES public.persons(id) ON DELETE SET NULL,
  member_3 UUID REFERENCES public.persons(id) ON DELETE SET NULL,
  member_4 UUID REFERENCES public.persons(id) ON DELETE SET NULL,
  member_5 UUID REFERENCES public.persons(id) ON DELETE SET NULL,
  member_6 UUID REFERENCES public.persons(id) ON DELETE SET NULL,
  recipient TEXT,
  notes TEXT,
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  archived BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.services TO authenticated;
GRANT ALL ON public.services TO service_role;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "services view" ON public.services FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(),'services','view'));
CREATE POLICY "services insert" ON public.services FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(),'services','edit'));
CREATE POLICY "services update" ON public.services FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(),'services','edit'))
  WITH CHECK (public.has_permission(auth.uid(),'services','edit'));
CREATE POLICY "services delete" ON public.services FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));
CREATE TRIGGER trg_services_updated BEFORE UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_services_date ON public.services(service_date DESC);
CREATE INDEX idx_services_location ON public.services(location);

CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id UUID,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "audit admin read" ON public.audit_log;
CREATE POLICY "audit admin read" ON public.audit_log FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));
DROP POLICY IF EXISTS "audit user insert" ON public.audit_log;
CREATE POLICY "audit user insert" ON public.audit_log FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_audit_created ON public.audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON public.audit_log(entity, entity_id);
