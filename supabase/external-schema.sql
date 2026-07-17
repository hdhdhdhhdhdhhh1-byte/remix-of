-- ============================================================
-- External Supabase Schema Migration
-- Run this file in SQL Editor of your external Supabase project
-- Project: bkwwtkfejvyqjzaririv
-- ============================================================

-- ============ ENUM TYPES ============
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('owner','admin','leader','viewer','platoon_leader','office','battery_commander');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.attendance_status AS ENUM ('present','absent','leave','sick','permit','mission','course','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.leave_status AS ENUM ('pending','approved','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ HELPER FUNCTIONS (needed by policies) ============
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('owner','admin'));
$$;

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _module text, _action text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin(_user_id) OR EXISTS(
    SELECT 1 FROM public.permissions
    WHERE user_id = _user_id AND module = _module AND (
      (_action = 'view' AND can_view) OR
      (_action = 'edit' AND can_edit) OR
      (_action = 'approve' AND can_approve) OR
      (_action = 'add' AND can_add) OR
      (_action = 'delete' AND can_delete) OR
      (_action = 'print' AND can_print) OR
      (_action = 'export_pdf' AND can_export_pdf) OR
      (_action = 'export_image' AND can_export_image) OR
      (_action = 'cancel_approval' AND can_cancel_approval)
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION public.enforce_approved_report_lock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.approved_at IS NOT NULL AND NEW.approved_at IS NULL THEN
      IF NOT public.has_permission(v_uid, 'reports', 'cancel_approval') THEN
        RAISE EXCEPTION 'ليس لديك صلاحية إلغاء اعتماد التقرير';
      END IF;
      RETURN NEW;
    END IF;
    IF OLD.approved_at IS NOT NULL THEN
      RAISE EXCEPTION 'لا يمكن تعديل تقرير معتمد. قم بإلغاء الاعتماد أولاً';
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.approved_at IS NOT NULL AND NOT public.has_permission(v_uid, 'reports', 'cancel_approval') THEN
      RAISE EXCEPTION 'لا يمكن حذف تقرير معتمد';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;

CREATE OR REPLACE FUNCTION public.enforce_approved_entries_lock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_approved timestamptz; v_report_id uuid := COALESCE(NEW.report_id, OLD.report_id);
BEGIN
  IF auth.uid() IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT approved_at INTO v_approved FROM public.daily_reports WHERE id = v_report_id;
  IF v_approved IS NOT NULL THEN
    RAISE EXCEPTION 'لا يمكن تعديل بنود تقرير معتمد';
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)), NEW.email)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.my_role()
RETURNS app_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.user_roles WHERE user_id = auth.uid()
  ORDER BY CASE role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 WHEN 'leader' THEN 3 ELSE 4 END LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.my_is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('owner','admin'));
$$;

CREATE OR REPLACE FUNCTION public.my_permissions()
RETURNS TABLE(module text, can_view boolean, can_edit boolean, can_approve boolean, can_add boolean, can_delete boolean, can_print boolean, can_export_pdf boolean, can_export_image boolean, can_cancel_approval boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT module, can_view, can_edit, can_approve, can_add, can_delete, can_print, can_export_pdf, can_export_image, can_cancel_approval
  FROM public.permissions WHERE user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.my_pages()
RETURNS TABLE(page_key text, visible boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT page_key, visible FROM public.page_visibility WHERE user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.latest_approved_report_date()
RETURNS date LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT report_date FROM public.daily_reports WHERE approved_at IS NOT NULL ORDER BY report_date DESC LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.person_current_status(_person_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT re.status::text FROM public.report_entries re
  JOIN public.daily_reports r ON r.id = re.report_id
  WHERE re.person_id = _person_id AND r.approved_at IS NOT NULL
  ORDER BY r.report_date DESC LIMIT 1;
$$;

-- ============ TABLES ============

-- persons
CREATE TABLE IF NOT EXISTS public.persons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  military_rank text,
  squad text,
  phone text,
  notes text,
  active boolean NOT NULL DEFAULT true,
  military_number text,
  formation text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.persons TO authenticated;
GRANT ALL ON public.persons TO service_role;
ALTER TABLE public.persons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "persons view" ON public.persons FOR SELECT TO authenticated USING (has_permission(auth.uid(),'persons','view') OR has_permission(auth.uid(),'reports','view'));
CREATE POLICY "persons edit" ON public.persons FOR INSERT TO authenticated WITH CHECK (has_permission(auth.uid(),'persons','edit'));
CREATE POLICY "persons update" ON public.persons FOR UPDATE TO authenticated USING (has_permission(auth.uid(),'persons','edit'));
CREATE POLICY "persons delete" ON public.persons FOR DELETE TO authenticated USING (has_permission(auth.uid(),'persons','edit'));
CREATE TRIGGER trg_persons_updated BEFORE UPDATE ON public.persons FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text,
  assigned_formation text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated USING (user_id = auth.uid() OR is_admin(auth.uid()));
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (user_id = auth.uid() OR is_admin(auth.uid()));
CREATE POLICY "admin insert profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid()) OR user_id = auth.uid());
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- user_roles
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own roles read" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR is_admin(auth.uid()));

-- permissions
CREATE TABLE IF NOT EXISTS public.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module text NOT NULL,
  can_view boolean NOT NULL DEFAULT false,
  can_edit boolean NOT NULL DEFAULT false,
  can_approve boolean NOT NULL DEFAULT false,
  can_add boolean NOT NULL DEFAULT false,
  can_delete boolean NOT NULL DEFAULT false,
  can_print boolean NOT NULL DEFAULT false,
  can_export_pdf boolean NOT NULL DEFAULT false,
  can_export_image boolean NOT NULL DEFAULT false,
  can_cancel_approval boolean NOT NULL DEFAULT false,
  UNIQUE (user_id, module)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.permissions TO authenticated;
GRANT ALL ON public.permissions TO service_role;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own perms read" ON public.permissions FOR SELECT TO authenticated USING (user_id = auth.uid() OR is_admin(auth.uid()));
CREATE POLICY "admin perms write" ON public.permissions FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

-- page_visibility
CREATE TABLE IF NOT EXISTS public.page_visibility (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  page_key text NOT NULL,
  visible boolean NOT NULL DEFAULT true,
  UNIQUE (user_id, page_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.page_visibility TO authenticated;
GRANT ALL ON public.page_visibility TO service_role;
ALTER TABLE public.page_visibility ENABLE ROW LEVEL SECURITY;
CREATE POLICY "page_visibility read own" ON public.page_visibility FOR SELECT TO authenticated USING (user_id = auth.uid() OR is_admin(auth.uid()));
CREATE POLICY "page_visibility admin write" ON public.page_visibility FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

-- daily_reports
CREATE TABLE IF NOT EXISTS public.daily_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date date NOT NULL UNIQUE,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  edited_after_approval boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_reports TO authenticated;
GRANT ALL ON public.daily_reports TO service_role;
ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reports view" ON public.daily_reports FOR SELECT TO authenticated USING (has_permission(auth.uid(),'reports','view'));
CREATE POLICY "reports insert" ON public.daily_reports FOR INSERT TO authenticated WITH CHECK (has_permission(auth.uid(),'reports','edit'));
CREATE POLICY "reports update" ON public.daily_reports FOR UPDATE TO authenticated USING (has_permission(auth.uid(),'reports','edit') OR has_permission(auth.uid(),'reports','approve'));
CREATE POLICY "reports delete" ON public.daily_reports FOR DELETE TO authenticated USING (is_admin(auth.uid()));
CREATE TRIGGER trg_reports_updated BEFORE UPDATE ON public.daily_reports FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_daily_reports_approved_lock BEFORE UPDATE OR DELETE ON public.daily_reports FOR EACH ROW EXECUTE FUNCTION enforce_approved_report_lock();

-- report_entries
CREATE TABLE IF NOT EXISTS public.report_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.daily_reports(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
  status attendance_status NOT NULL,
  note text,
  UNIQUE (report_id, person_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_entries TO authenticated;
GRANT ALL ON public.report_entries TO service_role;
ALTER TABLE public.report_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "entries view" ON public.report_entries FOR SELECT TO authenticated USING (has_permission(auth.uid(),'reports','view'));
CREATE POLICY "entries write" ON public.report_entries FOR ALL TO authenticated USING (has_permission(auth.uid(),'reports','edit')) WITH CHECK (has_permission(auth.uid(),'reports','edit'));
CREATE TRIGGER trg_report_entries_approved_lock BEFORE INSERT OR UPDATE OR DELETE ON public.report_entries FOR EACH ROW EXECUTE FUNCTION enforce_approved_entries_lock();

-- leaders
CREATE TABLE IF NOT EXISTS public.leaders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid REFERENCES public.persons(id) ON DELETE CASCADE,
  position text NOT NULL,
  unit text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leaders TO authenticated;
GRANT ALL ON public.leaders TO service_role;
ALTER TABLE public.leaders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "leaders view" ON public.leaders FOR SELECT TO authenticated USING (has_permission(auth.uid(),'leaders','view'));
CREATE POLICY "leaders write" ON public.leaders FOR ALL TO authenticated USING (has_permission(auth.uid(),'leaders','edit')) WITH CHECK (has_permission(auth.uid(),'leaders','edit'));

-- leaves
CREATE TABLE IF NOT EXISTS public.leaves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid REFERENCES public.persons(id) ON DELETE CASCADE,
  leave_type text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status leave_status NOT NULL DEFAULT 'pending',
  reason text,
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leaves TO authenticated;
GRANT ALL ON public.leaves TO service_role;
ALTER TABLE public.leaves ENABLE ROW LEVEL SECURITY;
CREATE POLICY "leaves view" ON public.leaves FOR SELECT TO authenticated USING (has_permission(auth.uid(),'leaves','view'));
CREATE POLICY "leaves insert" ON public.leaves FOR INSERT TO authenticated WITH CHECK (has_permission(auth.uid(),'leaves','edit'));
CREATE POLICY "leaves update" ON public.leaves FOR UPDATE TO authenticated USING (has_permission(auth.uid(),'leaves','edit') OR has_permission(auth.uid(),'leaves','approve'));
CREATE POLICY "leaves delete" ON public.leaves FOR DELETE TO authenticated USING (is_admin(auth.uid()));

-- weapons
CREATE TABLE IF NOT EXISTS public.weapons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  weapon_type text NOT NULL,
  serial_number text NOT NULL UNIQUE,
  assigned_to uuid REFERENCES public.persons(id) ON DELETE SET NULL,
  condition text NOT NULL DEFAULT 'good',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weapons TO authenticated;
GRANT ALL ON public.weapons TO service_role;
ALTER TABLE public.weapons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "weapons view" ON public.weapons FOR SELECT TO authenticated USING (has_permission(auth.uid(),'weapons','view'));
CREATE POLICY "weapons write" ON public.weapons FOR ALL TO authenticated USING (has_permission(auth.uid(),'weapons','edit')) WITH CHECK (has_permission(auth.uid(),'weapons','edit'));

-- services
CREATE TABLE IF NOT EXISTS public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_date date NOT NULL DEFAULT CURRENT_DATE,
  location text NOT NULL CHECK (location IN ('التبة','البوابة','مترس ١','مترس ٢')),
  member_1 uuid REFERENCES public.persons(id) ON DELETE SET NULL,
  member_2 uuid REFERENCES public.persons(id) ON DELETE SET NULL,
  member_3 uuid REFERENCES public.persons(id) ON DELETE SET NULL,
  member_4 uuid REFERENCES public.persons(id) ON DELETE SET NULL,
  member_5 uuid REFERENCES public.persons(id) ON DELETE SET NULL,
  member_6 uuid REFERENCES public.persons(id) ON DELETE SET NULL,
  recipient text,
  notes text,
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  archived boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id),
  edited_after_approval boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.services TO authenticated;
GRANT ALL ON public.services TO service_role;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "services view" ON public.services FOR SELECT TO authenticated USING (has_permission(auth.uid(),'services','view'));
CREATE POLICY "services insert" ON public.services FOR INSERT TO authenticated WITH CHECK (has_permission(auth.uid(),'services','edit'));
CREATE POLICY "services update" ON public.services FOR UPDATE TO authenticated USING (has_permission(auth.uid(),'services','edit')) WITH CHECK (has_permission(auth.uid(),'services','edit'));
CREATE POLICY "services delete" ON public.services FOR DELETE TO authenticated USING (is_admin(auth.uid()));
CREATE TRIGGER trg_services_updated BEFORE UPDATE ON public.services FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- audit_log
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id uuid,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit admin read" ON public.audit_log FOR SELECT TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "audit user insert" ON public.audit_log FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- ============ AUTH TRIGGER (auto-create profile on signup) ============
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ FUNCTION GRANTS (least-privilege) ============
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_approved_report_lock() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_approved_entries_lock() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_permissions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_pages() TO authenticated;
GRANT EXECUTE ON FUNCTION public.latest_approved_report_date() TO authenticated;
GRANT EXECUTE ON FUNCTION public.person_current_status(uuid) TO authenticated;

-- ============ POST-SETUP: create your first owner user ============
-- 1) Go to Authentication → Users → Add User (create with email/password)
-- 2) Run the following, replacing <YOUR_USER_ID> with the created user's UUID:
--
-- INSERT INTO public.user_roles (user_id, role) VALUES ('<YOUR_USER_ID>', 'owner');
--
-- 3) Grant full permissions for each module:
-- INSERT INTO public.permissions (user_id, module, can_view, can_edit, can_approve, can_add, can_delete, can_print, can_export_pdf, can_export_image, can_cancel_approval)
-- SELECT '<YOUR_USER_ID>', m, true, true, true, true, true, true, true, true, true
-- FROM unnest(ARRAY['persons','reports','leaves','leaders','weapons','services']) AS m;
